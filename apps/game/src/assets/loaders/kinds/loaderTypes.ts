/**
 * Every asset kind is loaded through this one signature, which is what lets
 * AssetLoader stay generic and lets a new kind be added without touching the
 * loader's own logic.
 */
import type { AssetEntry } from '../../manifests/types.js';

export interface KindLoadContext {
  readonly signal: AbortSignal;
  /** 0..1 for this individual asset, if the transport can report it. */
  readonly onProgress?: (fraction: number) => void;
  /** Resolves a manifest URL against the app base. */
  readonly resolveUrl: (url: string) => string;
}

export type KindLoader<T = unknown> = (entry: AssetEntry, context: KindLoadContext) => Promise<T>;

/** Anything a loader produces that holds GPU or DOM resources. */
export interface LoadedAsset {
  dispose?(): void;
}
