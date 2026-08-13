/** Which completed structures own an active world interaction. */
import type { BuildingKind } from '@farmrise/shared';

export type BuildingInteractionKind =
  'storage' | 'processing' | 'livestock' | 'workforce' | 'passive';

export const BUILDING_INTERACTIONS: Readonly<Record<BuildingKind, BuildingInteractionKind>> =
  Object.freeze({
    barn: 'storage',
    irrigation: 'passive',
    road: 'passive',
    fence: 'passive',
    animal_shelter: 'livestock',
    water_trough: 'passive',
    loading_pad: 'storage',
    cold_store: 'storage',
    worker_hut: 'workforce',
    well: 'passive',
    mill: 'processing',
    creamery: 'processing',
    preserve_kitchen: 'processing',
  });

export function buildingInteraction(kind: BuildingKind): BuildingInteractionKind {
  return BUILDING_INTERACTIONS[kind];
}
