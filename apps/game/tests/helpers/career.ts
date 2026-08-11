import {
  HOMESTEAD_PARCEL_ID,
  cents,
  newCareer,
  requireCrop,
  type CareerSaveState,
  type Cents,
} from '@farmrise/shared';
import { Career } from '@game/career/Career.js';
import { harvest, plant } from '@game/world/FarmCommands.js';

export function makeCareer(
  overrides: Partial<CareerSaveState> = {},
  careerId = 'test-career',
): Career {
  const base = newCareer({ careerId, seed: 42 });
  return Career.fromSaveState({ ...base, ...overrides });
}

export function fundedCareer(balance = 100_000): Career {
  return makeCareer({ balance: cents(balance) });
}

export function firstPlotId(career: Career): string {
  const plot = career.world.fields.placements[0];
  if (!plot) throw new Error('Test career has no crop beds.');
  return plot.id;
}

export function growAndHarvest(
  career: Career,
  cropId = 'wheat',
  plotId = firstPlotId(career),
): number {
  const planted = plant(career, plotId, cropId);
  if (!planted.ok) throw new Error(planted.reason);
  const plot = career.world.getPlot(plotId);
  if (!plot) throw new Error(`Missing plot ${plotId}`);
  career.world.setPlot(plotId, { ...plot, irrigated: true });
  career.advance(requireCrop(cropId).growthTicks + 5);
  const result = harvest(career, plotId);
  if (!result.ok) throw new Error(result.reason);
  return result.value.carried + result.value.leftInField;
}

export function depositCarriedAtYard(career: Career): number {
  const yard = career.world.stores.stores.find((store) => store.id === 'store-yard');
  if (!yard) throw new Error('Test career has no yard store.');
  const load = career.world.carry.drain();
  let stored = 0;
  for (const [itemId, quantity] of Object.entries(load.items)) {
    stored += career.world.stores.deposit(
      yard.id,
      itemId,
      quantity,
      load.quality[itemId] ?? 1,
    ).stored;
  }
  return stored;
}

export function addToYard(career: Career, itemId: string, quantity: number): void {
  const yard = career.world.stores.stores.find((store) => store.id === 'store-yard');
  if (!yard) throw new Error('Test career has no yard store.');
  const result = career.world.stores.deposit(yard.id, itemId, quantity, 1);
  if (result.stored !== quantity) throw new Error('Test yard did not have enough capacity.');
}

export function setBalance(career: Career, balance: Cents | number): void {
  career.adjustBalance(cents(Number(balance) - career.balance), 'test setup');
}

export const STARTING_PARCEL_ID = HOMESTEAD_PARCEL_ID;
