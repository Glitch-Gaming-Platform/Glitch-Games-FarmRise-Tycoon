/**
 * Asset manifest types.
 *
 * A manifest is data, not code: it declares what exists, where it lives, how
 * big it is and when it is needed. Nothing loads an asset by hardcoded URL -
 * that rule is what makes cache-busting, preloading and a CDN swap possible
 * later without touching gameplay (see docs/ASSET_PIPELINE.md).
 */
export type AssetKind = 'texture' | 'model' | 'audio' | 'video' | 'json';

/** When an asset is fetched relative to entering a scene. */
export type LoadPhase =
  /** Blocks the loading screen. The scene cannot render without it. */
  | 'critical'
  /** Fetched during the loading screen but the scene can start without it. */
  | 'preload'
  /** Fetched lazily on first use. */
  | 'lazy';

export interface AssetEntry {
  readonly id: string;
  readonly kind: AssetKind;
  /** Path relative to the app's base URL. Vite rewrites these at build time. */
  readonly url: string;
  readonly phase: LoadPhase;
  /** Approximate bytes. Used to weight the loading bar so it moves honestly. */
  readonly bytes?: number;
  /** Scenes that need it. Used to pre-warm and to detect orphaned assets. */
  readonly scenes?: readonly string[];
  /** Free-form, kind-specific options (colour space, loop points, and so on). */
  readonly options?: Readonly<Record<string, string | number | boolean>>;
}

export interface AssetManifest {
  readonly version: number;
  readonly assets: readonly AssetEntry[];
}

export function assetsForPhase(
  manifest: AssetManifest,
  phase: LoadPhase,
  sceneId?: string,
): AssetEntry[] {
  return manifest.assets.filter(
    (asset) =>
      asset.phase === phase && (!sceneId || !asset.scenes || asset.scenes.includes(sceneId)),
  );
}

export function findAsset(manifest: AssetManifest, id: string): AssetEntry | undefined {
  return manifest.assets.find((asset) => asset.id === id);
}
