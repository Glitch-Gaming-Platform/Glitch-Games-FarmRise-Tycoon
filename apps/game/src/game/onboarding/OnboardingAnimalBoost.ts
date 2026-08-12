/**
 * Brings the first guided clutch close to completion when the egg lesson starts.
 *
 * Production remains paused before that beat, and normal later cycles keep the
 * full livestock timing. Priming here also repairs resumed tutorial saves whose
 * hens were saved at the start of a cycle, which would otherwise turn a short
 * collection lesson into a two-minute wait.
 */
import { ANIMALS } from '@farmrise/shared';
import type { Career } from '../career/Career.js';

const GUIDED_CLUTCH_TICKS = 1;

export class OnboardingAnimalBoost {
  constructor(private readonly career: Career) {}

  /** Called before world.advance so the real livestock rule still creates the eggs. */
  update(eggBeatActive: boolean, eggsAvailable: number): void {
    if (!eggBeatActive || eggsAvailable > 0) return;
    const readyAt = ANIMALS.chicken.cycleTicks - GUIDED_CLUTCH_TICKS;
    for (const group of this.career.world.livestock.groups) {
      if (group.species !== 'chicken' || group.count <= 0) continue;
      group.cycleTicks = Math.max(group.cycleTicks, readyAt);
    }
  }
}
