/**
 * Server-side validation of a submitted save.
 *
 * The threat model: the client is a program on someone else's computer. Its
 * memory can be edited, its JavaScript can be replaced, and its requests can be
 * forged. Everything it sends is a *claim*.
 *
 * Fully re-simulating every session server-side would be the strongest answer,
 * but it is also the most expensive and it is not what protects the things that
 * matter here. Instead the design splits responsibility:
 *
 *   - Money earned from TRADES is computed entirely by the server. The client
 *     cannot propose a payout (see marketService.ts). This is the hard boundary.
 *   - Everything else in the save is checked for physical possibility: time
 *     cannot run backwards or faster than the wall clock, balance cannot grow
 *     faster than the game can generate income, goods cannot appear faster than
 *     plots can grow them, and storage limits hold.
 *
 * A rejected save returns RULE_VIOLATION and the client is expected to reload
 * authoritative state rather than retry.
 */
import {
  MAX_PLAUSIBLE_EARNINGS_PER_TICK,
  MAX_PLAUSIBLE_ITEMS_PER_TICK,
  MAX_TICK_DRIFT_TICKS,
  requireCrop,
  storageCapacity,
  storageUsed,
  type SaveState,
} from '@farmrise/shared';

export interface ValidationOutcome {
  readonly ok: boolean;
  readonly reason?: string;
}

const OK: ValidationOutcome = { ok: true };
const reject = (reason: string): ValidationOutcome => ({ ok: false, reason });

export function validateSaveTransition(
  previous: SaveState,
  next: SaveState,
  nowTick: number,
): ValidationOutcome {
  // 1. Time only moves forward, and only as fast as real time does.
  if (next.tick < previous.tick) {
    return reject('Save tick went backwards.');
  }
  if (next.tick > nowTick + MAX_TICK_DRIFT_TICKS) {
    return reject('Save tick is further ahead than the server clock allows.');
  }

  const elapsedTicks = next.tick - previous.tick;

  // 2. Money may fall freely (spending) but may only rise within what the game
  //    could plausibly have produced in the elapsed time.
  const balanceGain = next.balance - previous.balance;
  if (balanceGain > MAX_PLAUSIBLE_EARNINGS_PER_TICK * elapsedTicks + 1) {
    return reject('Balance increased by more than the elapsed time allows.');
  }

  // 3. Goods cannot materialise faster than plots and animals can make them.
  const gainedItems = totalItems(next.inventory) - totalItems(previous.inventory);
  if (gainedItems > MAX_PLAUSIBLE_ITEMS_PER_TICK * elapsedTicks + 1) {
    return reject('Inventory grew by more than production allows.');
  }

  // 4. Storage is a hard cap, and it is what makes the sell-or-hold decision
  //    real. A save over capacity would quietly delete that decision.
  const capacity = storageCapacity(
    next.buildings.filter(
      (building) => building.kind === 'barn' && building.remainingBuildTicks <= 0,
    ).length,
  );
  if (storageUsed(next.inventory) > capacity) {
    return reject('Inventory exceeds storage capacity.');
  }

  // 5. Land is bought one parcel at a time, never granted.
  if (next.landParcels < previous.landParcels) return reject('Land parcels decreased.');
  if (next.landParcels > previous.landParcels + 1) {
    return reject('More than one land parcel was claimed in a single save.');
  }

  // 6. Crops cannot be more grown than the elapsed time permits, and never past
  //    their own maximum.
  const previousByPlot = new Map(previous.plots.map((plot) => [String(plot.id), plot]));
  for (const plot of next.plots) {
    if (!plot.cropId) continue;
    const crop = requireCrop(plot.cropId);
    if (plot.grownTicks > crop.growthTicks + 1) {
      return reject(`Plot ${String(plot.id)} is grown beyond its crop's maximum.`);
    }
    const before = previousByPlot.get(String(plot.id));
    // Only compare when the same crop is still in the ground; replanting
    // legitimately resets growth to zero.
    if (before && before.cropId === plot.cropId) {
      const growth = plot.grownTicks - before.grownTicks;
      if (growth > elapsedTicks + 1) {
        return reject(`Plot ${String(plot.id)} grew faster than time passed.`);
      }
    }
  }

  return OK;
}

function totalItems(inventory: Readonly<Record<string, number>>): number {
  return Object.values(inventory).reduce((sum, quantity) => sum + Math.max(0, quantity), 0);
}
