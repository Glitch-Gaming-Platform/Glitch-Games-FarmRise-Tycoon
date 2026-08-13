import type { AnimalSpecies } from '@farmrise/shared';
import type { AnimalGroup } from '../world/models/AnimalModel.js';

/**
 * Number of visible instances assigned to one persisted livestock group.
 *
 * When a species exceeds its render budget, every non-empty shelter gets one
 * representative first. The remaining instances are distributed
 * proportionally, with stable group order providing deterministic rounding.
 */
export function visibleAnimalCountForGroup(
  groups: readonly AnimalGroup[],
  species: AnimalSpecies,
  groupId: string,
  maxVisible: number,
): number {
  let matchingCount = 0;
  let total = 0;
  let targetIndex = -1;
  let targetCount = 0;
  let weightBefore = 0;
  for (const group of groups) {
    if (group.species !== species || group.count <= 0) continue;
    if (group.id === groupId) {
      targetIndex = matchingCount;
      targetCount = group.count;
    } else if (targetIndex < 0) {
      weightBefore += Math.max(0, group.count - 1);
    }
    matchingCount += 1;
    total += group.count;
  }
  if (targetIndex < 0 || maxVisible <= 0) return 0;

  if (total <= maxVisible) return targetCount;

  // There can be more saved groups than the visual cap (especially cows). A
  // stable prefix is preferable to reshuffling visible animals every frame.
  if (matchingCount >= maxVisible) return targetIndex < maxVisible ? 1 : 0;

  const remaining = maxVisible - matchingCount;
  const weightedTotal = total - matchingCount;
  if (remaining <= 0 || weightedTotal <= 0) return 1;

  const targetWeight = Math.max(0, targetCount - 1);
  const extraBefore = Math.floor((weightBefore * remaining) / weightedTotal);
  const extraAfter = Math.floor(((weightBefore + targetWeight) * remaining) / weightedTotal);
  return 1 + extraAfter - extraBefore;
}
