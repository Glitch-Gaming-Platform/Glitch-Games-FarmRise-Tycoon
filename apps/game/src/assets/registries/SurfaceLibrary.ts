/**
 * The procedural PBR surface library, as the client sees it.
 *
 * Three maps per material - albedo, tangent normal, and an ORM pack whose RGB
 * is (ambient occlusion, roughness, metalness) - plus the physical metadata a
 * shader needs to use them: how many metres one repeat covers, how deep the
 * relief is, and the mean linear colour.
 *
 * That last number is what lets a texture be applied to existing art without
 * changing what the art looks like on average. The terrain multiplies its
 * palette-owned vertex colour by `albedo / meanLinear`, so the texture
 * contributes *variation* with a mean of one. Without it, dropping a texture
 * onto the ground would shift the whole farm's hue and value, and
 * `npm run art:check` - which audits crop-against-ground contrast - would be
 * auditing colours the player no longer sees.
 *
 * **This class is constructed on the Ultra tier only.** The manifest entries
 * are all `lazy`, so on `low` nothing here is ever instantiated and not one of
 * these bytes is requested. That is the same "absence of a pipeline means the
 * old behaviour" rule the render layer uses, applied to payload.
 */
import * as THREE from 'three';
import type { AssetLoader } from '../loaders/AssetLoader.js';
import { SURFACE_IDS, type SurfaceId } from '../manifests/textures.manifest.js';

export interface SurfaceMaps {
  readonly id: SurfaceId;
  readonly albedo: THREE.Texture;
  readonly normal: THREE.Texture;
  readonly orm: THREE.Texture;
  /** Metres covered by one repeat of the texture. */
  readonly tileMetres: number;
  /** Peak-to-trough relief encoded in the normal map, in metres. */
  readonly reliefMetres: number;
  /** Mean linear-sRGB colour of the albedo. */
  readonly meanLinear: THREE.Color;
}

/**
 * Physical tiling and relief, mirrored from `art/textures/manifest.json`.
 *
 * Duplicated deliberately. A shader needs these numbers to build a material,
 * and fetching a JSON file to discover the tiling of a texture that is already
 * downloaded would add a round trip to the critical path of the first frame for
 * eight numbers. `tools/textures/generate.mjs` prints them, and they change only
 * when a pattern is re-authored.
 */
const SURFACE_METRICS: Record<
  SurfaceId,
  { tile: number; relief: number; mean: [number, number, number] }
> = {
  soil_dry_cracked: { tile: 2, relief: 0.05, mean: [0.3766, 0.0861, 0.034] },
  soil_tilled: { tile: 1.6, relief: 0.085, mean: [0.3528, 0.0781, 0.0284] },
  grass_dry: { tile: 1.9, relief: 0.05, mean: [0.6471, 0.4428, 0.0582] },
  scrub_gravel: { tile: 2.2, relief: 0.06, mean: [0.6168, 0.4181, 0.0721] },
  bark_eucalyptus: { tile: 1.1, relief: 0.09, mean: [0.3228, 0.2236, 0.1515] },
  timber_painted: { tile: 1, relief: 0.05, mean: [0.0358, 0.1273, 0.1461] },
  metal_corrugated: { tile: 1, relief: 0.11, mean: [0.2561, 0.2975, 0.3235] },
  roof_shingle: { tile: 1.2, relief: 0.075, mean: [0.2416, 0.2905, 0.3262] },
  cloth_canvas: { tile: 0.45, relief: 0.02, mean: [0.5875, 0.5313, 0.4325] },
  fur_short: { tile: 0.3, relief: 0.03, mean: [0.3994, 0.0883, 0.019] },
};

export class SurfaceLibrary {
  readonly #maps = new Map<SurfaceId, SurfaceMaps>();

  /** Ids that were requested and actually arrived. */
  get loaded(): readonly SurfaceId[] {
    return [...this.#maps.keys()];
  }

  get(id: SurfaceId): SurfaceMaps | null {
    return this.#maps.get(id) ?? null;
  }

  /**
   * Loads a subset of the library.
   *
   * A partial failure is not fatal, and that is not laziness: the caller's
   * fallback is the vertex-coloured material the game shipped with, which is a
   * complete and shippable look. A missing PNG must degrade to the previous
   * frame, never to a black plane.
   */
  static async load(
    assets: AssetLoader,
    ids: readonly SurfaceId[],
    signal?: AbortSignal,
    maxAnisotropy = 8,
  ): Promise<SurfaceLibrary> {
    const library = new SurfaceLibrary();
    await Promise.all(
      ids.map(async (id) => {
        if (!SURFACE_IDS.includes(id)) return;
        try {
          const [albedo, normal, orm] = await Promise.all([
            assets.load<THREE.Texture>(`texture:${id}_albedo`, signal),
            assets.load<THREE.Texture>(`texture:${id}_normal`, signal),
            assets.load<THREE.Texture>(`texture:${id}_orm`, signal),
          ]);
          const metrics = SURFACE_METRICS[id];
          for (const texture of [albedo, normal, orm]) {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            // Anisotropy is not a nicety on a ground plane seen at 34 degrees
            // above the horizon. Without it the far half of the terrain
            // resolves to the flat average of its mip chain, which is exactly
            // the "painted plane" look this work exists to remove.
            texture.anisotropy = maxAnisotropy;
            texture.needsUpdate = true;
          }
          library.#maps.set(id, {
            id,
            albedo,
            normal,
            orm,
            tileMetres: metrics.tile,
            reliefMetres: metrics.relief,
            meanLinear: new THREE.Color(...metrics.mean),
          });
        } catch (error) {
          console.warn(`[SurfaceLibrary] surface "${id}" unavailable, falling back`, error);
        }
      }),
    );
    return library;
  }

  dispose(): void {
    for (const maps of this.#maps.values()) {
      maps.albedo.dispose();
      maps.normal.dispose();
      maps.orm.dispose();
    }
    this.#maps.clear();
  }
}
