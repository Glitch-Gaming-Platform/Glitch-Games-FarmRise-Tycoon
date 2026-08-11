/**
 * Planting, tending and harvesting.
 *
 * The important change from the first playable is the last line of `harvest`:
 * the crop goes into the player's arms, not into a global inventory. Everything
 * hauling exists to create - distance mattering, carts being worth buying,
 * loading pads being worth building - follows from that one fact.
 */
import {
  clearPlot,
  computeYield,
  getCrop,
  harvestQuality,
  isCropPlantableInSeason,
  ok,
  plantCrop,
  plotStage,
  ruleViolation,
  soilAfterHarvest,
  tendPlot,
  cents,
  type Result,
} from '@farmrise/shared';
import type { Career } from '../../career/Career.js';

export function plant(career: Career, plotId: string, cropId: string): Result<void> {
  const world = career.world;
  const plot = world.getPlot(plotId);
  if (!plot) return ruleViolation(`No plot "${plotId}".`);
  if (plot.cropId) return ruleViolation('That plot is already planted.');

  const crop = getCrop(cropId);
  if (!crop) return ruleViolation(`Unknown crop "${cropId}".`);
  if (crop.requiresUnlock && !career.unlocks.includes(crop.requiresUnlock)) {
    return ruleViolation(`Nobody around here sells ${crop.displayName.toLowerCase()} seed yet.`);
  }
  if (!isCropPlantableInSeason(crop, career.season)) {
    const window = crop.plantingSeasons?.map(
      (season) => season[0]!.toUpperCase() + season.slice(1),
    );
    return ruleViolation(`${crop.displayName} seed is only sold in ${window?.join(' or ')}.`);
  }
  if (career.balance < crop.seedCost) {
    return ruleViolation(`Not enough money for ${crop.displayName} seed.`);
  }

  career.adjustBalance(cents(-crop.seedCost), 'seed');
  world.setPlot(plotId, plantCrop(plot, cropId));
  return ok(undefined);
}

export function tend(career: Career, plotId: string): Result<void> {
  const plot = career.world.getPlot(plotId);
  if (!plot) return ruleViolation(`No plot "${plotId}".`);
  if (!plot.cropId) return ruleViolation('Nothing planted there.');
  if (plotStage(plot) === 'ready') return ruleViolation('That crop is ready - harvest it instead.');

  career.world.setPlot(plotId, tendPlot(plot));
  return ok(undefined);
}

export interface HarvestOutcome {
  readonly itemId: string;
  /** Units that went into the player's hands. */
  readonly carried: number;
  /** Units that would not fit and were left in the field. */
  readonly leftInField: number;
  readonly quality: number;
}

/**
 * Harvests a bed into whatever the player is carrying.
 *
 * What does not fit is left where it grew as a field stack rather than
 * destroyed - the answer to a full pair of arms is another trip, not a
 * punishment.
 */
export function harvest(career: Career, plotId: string): Result<HarvestOutcome> {
  return completeHarvest(career, plotId, (itemId, quantity, quality) => {
    const world = career.world;
    const { taken, refused } = world.carry.pickUp(itemId, quantity, quality);
    if (refused > 0) {
      const placement = world.plotPlacement(plotId);
      if (placement) world.depositNear(placement.tileX, placement.tileZ, itemId, refused, quality);
    }
    return { carried: taken, leftInField: refused };
  });
}

/** Worker harvests land at the bed for the hauling system to collect. */
export function harvestForWorker(career: Career, plotId: string): Result<HarvestOutcome> {
  return completeHarvest(career, plotId, (itemId, quantity, quality) => {
    const placement = career.world.plotPlacement(plotId);
    if (!placement) return { carried: 0, leftInField: quantity };
    career.world.depositNear(placement.tileX, placement.tileZ, itemId, quantity, quality);
    return { carried: 0, leftInField: quantity };
  });
}

function completeHarvest(
  career: Career,
  plotId: string,
  receive: (
    itemId: string,
    quantity: number,
    quality: number,
  ) => { carried: number; leftInField: number },
): Result<HarvestOutcome> {
  const world = career.world;
  const plot = world.getPlot(plotId);
  if (!plot) return ruleViolation(`No plot "${plotId}".`);
  if (!plot.cropId) return ruleViolation('Nothing planted there.');
  if (plotStage(plot) !== 'ready') return ruleViolation('That crop is not ready yet.');

  const itemId = plot.cropId;
  const quality = harvestQuality(plot, career.season);
  const quantity = computeYield(plot, career.specializationYield(itemId));

  const destination = receive(itemId, quantity, quality);

  world.setPlot(plotId, {
    ...clearPlot(plot),
    soil: soilAfterHarvest(plot.soil, itemId, career.soilStrain()),
  });

  // Counted here rather than by a scene listener: a completed harvest is a fact
  // about the harvest, and every consumer of the model deserves it.
  career.bump('cropsHarvested', quantity);
  career.bump('cyclesCompleted');
  world.events.emit('world:harvested', {
    plotId,
    itemId,
    quantity,
    carried: destination.carried,
  });

  return ok({ itemId, ...destination, quality });
}
