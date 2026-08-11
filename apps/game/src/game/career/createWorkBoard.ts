import { carryCapacityFor, loadWeight, plotStage, type WorkerTask } from '@farmrise/shared';
import type { WorkBoard } from '../world/models/WorkerModel.js';
import type { StoreState } from '../world/models/StoreModel.js';
import { harvestForWorker, tend } from '../world/FarmCommands.js';
import type { Career } from './Career.js';

/** Gives workers only repetitive jobs the player has already learned. */
export function createWorkBoard(career: Career): WorkBoard {
  return {
    available(): readonly WorkerTask[] {
      const tasks: WorkerTask[] = [];
      if (tendablePlot(career)) tasks.push('tend');
      if (career.world.readyPlotIds().length > 0) tasks.push('harvest');
      if (haulSource(career) && haulDestination(career)) tasks.push('haul');
      return tasks;
    },
    perform(worker, task): boolean {
      if (task === 'tend') {
        const plotId = tendablePlot(career);
        return plotId ? tend(career, plotId).ok : false;
      }
      if (task === 'harvest') {
        const plotId = career.world.readyPlotIds()[0];
        return plotId ? harvestForWorker(career, plotId).ok : false;
      }
      if (task === 'haul') return haulOneLoad(career, carryCapacityFor(worker));
      return false;
    },
  };
}

function tendablePlot(career: Career): string | null {
  for (const [plotId, plot] of career.world.plots) {
    if (plot.cropId && plotStage(plot) === 'growing' && plot.tendCount < 2) return plotId;
  }
  return null;
}

function haulSource(career: Career): StoreState | null {
  return (
    career.world.stores.stores.find(
      (store) =>
        store.id.startsWith('stack-') &&
        Object.values(store.items).some((quantity) => quantity > 0),
    ) ?? null
  );
}

function haulDestination(career: Career): StoreState | null {
  return (
    career.world.stores.stores.find(
      (store) => !store.id.startsWith('stack-') && loadWeight(store.items) < store.capacity,
    ) ?? null
  );
}

function haulOneLoad(career: Career, capacity: number): boolean {
  const source = haulSource(career);
  const destination = haulDestination(career);
  if (!source || !destination) return false;
  const item = Object.entries(source.items).find(([, quantity]) => quantity > 0);
  if (!item) return false;
  const [itemId, held] = item;
  const weight = Math.max(1, loadWeight({ [itemId]: 1 }));
  const requested = Math.min(held, Math.floor(capacity / weight));
  const quality = source.quality[itemId] ?? 1;
  const outcome = career.world.stores.deposit(destination.id, itemId, requested, quality);
  if (outcome.stored <= 0) return false;
  const removed = career.world.stores.withdraw(source.id, itemId, outcome.stored);
  if (!removed.ok) return false;
  career.bump('goodsHauled', outcome.stored);
  return true;
}
