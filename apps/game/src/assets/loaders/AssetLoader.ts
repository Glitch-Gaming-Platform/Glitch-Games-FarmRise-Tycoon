/**
 * The asynchronous asset loader.
 *
 * Responsibilities:
 *   - resolve manifest entries to concrete objects via per-kind loaders
 *   - cache by asset id, and de-duplicate concurrent requests for the same id
 *   - report byte-weighted progress so the loading bar is honest rather than
 *     "1 of 3 files" jumping in thirds
 *   - support cancellation, because a player who backs out of a load should not
 *     keep downloading a 40MB scene
 *
 * It knows nothing about what the assets are for. Scenes ask for what they need.
 */
import { EventBus } from '@engine/core/EventBus.js';
import type { Disposable } from '@engine/core/types.js';
import {
  assetsForPhase,
  findAsset,
  type AssetEntry,
  type AssetManifest,
  type LoadPhase,
} from '../manifests/types.js';
import { loadTexture } from './kinds/textureLoader.js';
import { loadModel } from './kinds/modelLoader.js';
import { loadAudio } from './kinds/audioLoader.js';
import { loadVideo } from './kinds/videoLoader.js';
import { loadJson } from './kinds/jsonLoader.js';
import type { KindLoader } from './kinds/loaderTypes.js';

export interface AssetLoaderEvents extends Record<string, unknown> {
  'assets:progress': {
    loadedBytes: number;
    totalBytes: number;
    fraction: number;
    currentId: string;
  };
  'assets:asset-loaded': { id: string };
  'assets:error': { id: string; error: unknown };
}

/** Assumed size for entries with no declared byte count, so weighting still works. */
const DEFAULT_ASSET_BYTES = 50_000;

export class AssetLoader implements Disposable {
  readonly events = new EventBus<AssetLoaderEvents>();
  readonly #cache = new Map<string, unknown>();
  readonly #inFlight = new Map<string, Promise<unknown>>();
  readonly #loaders: Record<AssetEntry['kind'], KindLoader>;

  constructor(
    private readonly manifest: AssetManifest,
    private readonly baseUrl = '/',
  ) {
    this.#loaders = {
      texture: loadTexture as KindLoader,
      model: loadModel as KindLoader,
      audio: loadAudio as KindLoader,
      video: loadVideo as KindLoader,
      json: loadJson,
    };
  }

  /** Cached value, or undefined. Never triggers a fetch. */
  peek<T>(id: string): T | undefined {
    return this.#cache.get(id) as T | undefined;
  }

  /** True when this quality tier declares an asset, without starting a load. */
  declares(id: string): boolean {
    return findAsset(this.manifest, id) !== undefined;
  }

  /**
   * Loads one asset. Concurrent calls for the same id share a single request,
   * which matters because several scene objects routinely want the same texture.
   */
  async load<T>(id: string, signal?: AbortSignal): Promise<T> {
    const cached = this.#cache.get(id);
    if (cached !== undefined) return cached as T;

    const existing = this.#inFlight.get(id);
    if (existing) return existing as Promise<T>;

    const entry = findAsset(this.manifest, id);
    if (!entry)
      throw new Error(`Asset "${id}" is not in the manifest. Add it to core.manifest.ts.`);

    const loader = this.#loaders[entry.kind];
    const promise = loader(entry, {
      signal: signal ?? new AbortController().signal,
      resolveUrl: (url) => this.#resolveUrl(url),
    })
      .then((value) => {
        this.#cache.set(id, value);
        this.#inFlight.delete(id);
        this.events.emit('assets:asset-loaded', { id });
        return value;
      })
      .catch((error: unknown) => {
        this.#inFlight.delete(id);
        this.events.emit('assets:error', { id, error });
        throw error;
      });

    this.#inFlight.set(id, promise);
    return promise as Promise<T>;
  }

  /**
   * Loads every asset for a phase, reporting byte-weighted progress.
   *
   * Failures in the `preload` phase are logged and swallowed: a missing ambient
   * loop should not stop the player getting into the game. `critical` failures
   * propagate.
   */
  async loadPhase(phase: LoadPhase, sceneId?: string, signal?: AbortSignal): Promise<void> {
    const entries = assetsForPhase(this.manifest, phase, sceneId);
    if (entries.length === 0) return;

    const totalBytes = entries.reduce(
      (sum, entry) => sum + (entry.bytes ?? DEFAULT_ASSET_BYTES),
      0,
    );
    let loadedBytes = 0;

    for (const entry of entries) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      try {
        await this.load(entry.id, signal);
      } catch (error) {
        if (phase === 'critical') throw error;
        console.warn(`[AssetLoader] optional asset "${entry.id}" failed to load`, error);
      }
      loadedBytes += entry.bytes ?? DEFAULT_ASSET_BYTES;
      this.events.emit('assets:progress', {
        loadedBytes,
        totalBytes,
        fraction: totalBytes === 0 ? 1 : loadedBytes / totalBytes,
        currentId: entry.id,
      });
    }
  }

  /** Drops a cached asset and frees its GPU resources if it has any. */
  release(id: string): void {
    const value = this.#cache.get(id) as { dispose?: () => void } | undefined;
    value?.dispose?.();
    this.#cache.delete(id);
  }

  dispose(): void {
    for (const id of [...this.#cache.keys()]) this.release(id);
    this.#cache.clear();
    this.#inFlight.clear();
    this.events.clear();
  }

  #resolveUrl(url: string): string {
    if (/^(https?:)?\/\//.test(url) || url.startsWith('data:')) return url;
    return `${this.baseUrl.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
  }
}
