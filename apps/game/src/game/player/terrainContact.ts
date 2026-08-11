import type { TerrainSurface } from '../world/view/terrainProfile.js';

export interface TerrainContactProfile {
  readonly colour: number;
  readonly emissionMultiplier: number;
  readonly sizeMultiplier: number;
  readonly durationMultiplier: number;
}

/**
 * Palette-owned contact response for each walkable terrain family.
 *
 * One instanced particle draw serves every surface; only per-instance colour
 * and timing change. Packed road raises a short pale scuff, tilled soil kicks
 * heavier red clods, and grass/scrub stay quieter so movement never turns the
 * farm into a constant particle cloud.
 */
export function terrainContactProfile(surface: TerrainSurface): TerrainContactProfile {
  switch (surface) {
    case 'road':
      return {
        colour: 0xb0a083, // sand_stone
        emissionMultiplier: 0.42,
        sizeMultiplier: 0.72,
        durationMultiplier: 0.72,
      };
    case 'tilled-soil':
      return {
        colour: 0xb9603a, // soil_dry
        emissionMultiplier: 1.28,
        sizeMultiplier: 1.16,
        durationMultiplier: 1.12,
      };
    case 'grass':
      return {
        colour: 0xd9b84a, // ground_scrub_pale
        emissionMultiplier: 0.56,
        sizeMultiplier: 0.66,
        durationMultiplier: 0.82,
      };
    case 'scrub':
      return {
        colour: 0xc9b896, // sand_path
        emissionMultiplier: 0.86,
        sizeMultiplier: 0.92,
        durationMultiplier: 1,
      };
  }
}
