/**
 * Player-issued mutations, one function per intent.
 *
 * Every command is (world, args) -> Result, never throws, and never touches
 * rendering. Splitting these out of FarmWorld keeps "how the farm evolves on
 * its own" separate from "what the player is allowed to do to it", and means a
 * new verb is a new small file-local function rather than another method on an
 * ever-growing class.
 *
 * Note on trust: these run optimistically on the client so the game feels
 * instant. The server re-runs the equivalent checks against stored state when
 * the save is written, and rejects the write if the result is impossible. The
 * client is a predictor, never an authority (docs/NETWORKING.md).
 */
import {
  BUILDINGS,
  ANIMALS,
  LAND_PARCEL_COST,
  isAnimalSpecies,
  cents,
  clearPlot,
  computeYield,
  getAnimal,
  getCrop,
  ok,
  plantCrop,
  plotStage,
  ruleViolation,
  tendPlot,
  validateFulfilment,
  validateLandPurchase,
  validateSpotSale,
  type BuildingKind,
  type Cents,
  type MarketOrder,
  type Result,
} from '@farmrise/shared';
import { TileFlag } from '@engine/physics/TileGrid.js';
import type { FarmWorld } from './FarmWorld.js';

export function plant(world: FarmWorld, plotId: string, cropId: string): Result<void> {
  const plot = world.getPlot(plotId);
  if (!plot) return ruleViolation(`No plot "${plotId}".`);
  if (plot.cropId) return ruleViolation('That plot is already planted.');

  const crop = getCrop(cropId);
  if (!crop) return ruleViolation(`Unknown crop "${cropId}".`);
  if (world.balance < crop.seedCost)
    return ruleViolation(`Not enough money for ${crop.displayName} seed.`);

  world.adjustBalance(cents(-crop.seedCost));
  world.setPlot(plotId, plantCrop(plot, cropId));
  return ok(undefined);
}

export function tend(world: FarmWorld, plotId: string): Result<void> {
  const plot = world.getPlot(plotId);
  if (!plot) return ruleViolation(`No plot "${plotId}".`);
  if (!plot.cropId) return ruleViolation('Nothing planted there.');
  if (plotStage(plot) === 'ready') return ruleViolation('That crop is ready - harvest it instead.');

  world.setPlot(plotId, tendPlot(plot));
  return ok(undefined);
}

export function harvest(
  world: FarmWorld,
  plotId: string,
): Result<{ itemId: string; quantity: number; spilled: number }> {
  const plot = world.getPlot(plotId);
  if (!plot) return ruleViolation(`No plot "${plotId}".`);
  if (!plot.cropId) return ruleViolation('Nothing planted there.');
  if (plotStage(plot) !== 'ready') return ruleViolation('That crop is not ready yet.');

  const itemId = plot.cropId;
  const quantity = computeYield(plot);
  const { stored, spilled } = world.addToInventory(itemId, quantity);
  world.setPlot(plotId, clearPlot(plot));
  // Counted here rather than by a scene listener: a completed harvest is a
  // fact about the harvest, and every consumer of FarmWorld deserves it.
  world.bumpStat('cropsHarvested', stored);
  world.bumpStat('cyclesCompleted');
  world.events.emit('world:harvested', { plotId, itemId, quantity: stored, spilled });
  return ok({ itemId, quantity: stored, spilled });
}

export function build(
  world: FarmWorld,
  kind: BuildingKind,
  tileX: number,
  tileZ: number,
): Result<void> {
  const definition = BUILDINGS[kind];
  if (!definition) return ruleViolation(`Unknown building "${kind}".`);
  if (world.balance < definition.buildCost) {
    return ruleViolation(`Not enough money to build a ${definition.displayName.toLowerCase()}.`);
  }
  if (!world.grid.canPlace(tileX, tileZ, definition.footprint.width, definition.footprint.depth)) {
    return ruleViolation('Something is already there.');
  }
  // Soil is finite and the plots on it are the whole game. Refuse to pave them.
  if (world.grid.hasFlag(tileX, tileZ, TileFlag.Soil)) {
    return ruleViolation('You cannot build on a crop plot.');
  }

  world.adjustBalance(cents(-definition.buildCost));
  world.addBuilding({ kind, tileX, tileZ, remainingBuildTicks: definition.buildTicks });
  return ok(undefined);
}

export function buyAnimal(world: FarmWorld, species: string, count = 1): Result<void> {
  if (!isAnimalSpecies(species)) return ruleViolation(`Unknown animal "${species}".`);
  const definition = getAnimal(species);
  if (!definition) return ruleViolation(`Unknown animal "${species}".`);
  if (count <= 0 || !Number.isInteger(count))
    return ruleViolation('Count must be a positive whole number.');

  const total = cents(definition.purchaseCost * count);
  if (world.balance < total) return ruleViolation('Not enough money.');

  const shelterSlots = shelterCapacity(world);
  const used = world.animals.reduce(
    (sum, group) => sum + group.count * (ANIMALS[group.species]?.shelterSlots ?? 1),
    0,
  );
  if (used + count * definition.shelterSlots > shelterSlots) {
    return ruleViolation('Not enough shelter space. Build more fencing first.');
  }

  world.adjustBalance(cents(-total));
  world.addAnimals(species, count);
  return ok(undefined);
}

/** Shelter capacity is baseline 4, plus 2 per completed fence. */
export function shelterCapacity(world: FarmWorld): number {
  return 4 + world.completedBuildings('fence').length * 2;
}

/**
 * Sells goods at the spot price.
 *
 * Applied optimistically so the game feels instant, then reconciled: the
 * caller enqueues the equivalent server call, and the server - which owns
 * the authoritative balance - is free to disagree. See docs/NETWORKING.md.
 *
 * The client computes the same payout the server will, from the same shared
 * item registry, so the two only diverge if something is genuinely wrong.
 */
export function sellSpot(
  world: FarmWorld,
  itemId: string,
  quantity: number,
): Result<{ payout: Cents; quantity: number }> {
  const check = validateSpotSale(itemId, quantity, world.inventory);
  if (!check.ok) return check;

  world.setInventory(check.value.inventory);
  world.adjustBalance(check.value.payout);
  world.bumpStat('itemsSold', quantity);
  world.events.emit('world:sold', {
    itemId,
    quantity,
    payout: check.value.payout,
    viaContract: false,
  });
  return ok({ payout: check.value.payout, quantity });
}

/**
 * Fulfils a market contract: a fixed quantity at an above-spot price,
 * before a deadline.
 *
 * This is the trade-off the design calls for - a contract pays a premium but
 * commits the player to a quantity and a clock, while spot selling is always
 * available and always worth less.
 */
export function fulfilContract(
  world: FarmWorld,
  order: MarketOrder,
): Result<{ payout: Cents; quantity: number }> {
  const check = validateFulfilment(order, world.inventory, world.tick);
  if (!check.ok) return check;

  world.setInventory(check.value.inventory);
  world.adjustBalance(check.value.payout);
  world.bumpStat('itemsSold', order.quantity);
  world.events.emit('world:sold', {
    itemId: order.itemId,
    quantity: order.quantity,
    payout: check.value.payout,
    viaContract: true,
  });
  return ok({ payout: check.value.payout, quantity: order.quantity });
}

/**
 * Buys the neighbouring parcel. The slice's success condition.
 *
 * Deliberately a single large purchase rather than an incremental upgrade:
 * the design wants expansion to be a decision the player saves toward and
 * feels, not something that happens to them.
 */
export function buyLand(world: FarmWorld): Result<{ parcels: number }> {
  const check = validateLandPurchase(world.runState());
  if (!check.ok) return check;

  world.adjustBalance(cents(-LAND_PARCEL_COST));
  world.setLandParcels(check.value.parcels);
  return ok({ parcels: check.value.parcels });
}
