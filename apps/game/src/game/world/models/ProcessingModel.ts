/**
 * Machines that turn one good into a better one.
 *
 * A processor is a place, not a menu: it stands somewhere, it has a queue you
 * paid for up front, and while it is broken nothing moves. That is what gives
 * the breakdown incident real weight and what makes queue depth worth buying.
 */
import {
  advanceQueue,
  getRecipe,
  queueDuration,
  type Inventory,
  type ProcessorKind,
  type QueueEntry,
  type SpecializationId,
} from '@farmrise/shared';
import { EventBus } from '@engine/core/EventBus.js';

export interface ProcessorState {
  readonly id: string;
  readonly buildingId: string;
  queue: QueueEntry[];
  held: Inventory;
}

export interface ProcessingModelEvents extends Record<string, unknown> {
  'processing:queued': { processorId: string; recipeId: string; batches: number };
  'processing:completed': { processorId: string; itemId: string; quantity: number };
  'processing:idle': { processorId: string };
}

export interface ProcessedBatch {
  readonly processorId: string;
  readonly tileX: number;
  readonly tileZ: number;
  readonly items: Inventory;
}

export interface ProcessorPlacement {
  readonly kind: ProcessorKind;
  readonly tileX: number;
  readonly tileZ: number;
  readonly broken: boolean;
}

export class ProcessingModel {
  readonly events = new EventBus<ProcessingModelEvents>();
  #processors: ProcessorState[] = [];

  get processors(): readonly ProcessorState[] {
    return this.#processors;
  }

  get(id: string): ProcessorState | undefined {
    return this.#processors.find((processor) => processor.id === id);
  }

  forBuilding(buildingId: string): ProcessorState | undefined {
    return this.#processors.find((processor) => processor.buildingId === buildingId);
  }

  add(buildingId: string): ProcessorState {
    const processor: ProcessorState = {
      id: `processor-${buildingId}`,
      buildingId,
      queue: [],
      held: {},
    };
    this.#processors.push(processor);
    return processor;
  }

  remove(buildingId: string): void {
    this.#processors = this.#processors.filter((processor) => processor.buildingId !== buildingId);
  }

  enqueue(
    processorId: string,
    queue: readonly QueueEntry[],
    recipeId: string,
    batches: number,
  ): void {
    const processor = this.get(processorId);
    if (!processor) return;
    processor.queue = queue.map((entry) => ({ ...entry }));
    this.events.emit('processing:queued', { processorId, recipeId, batches });
  }

  /** Pulls a batch's input back out, for the "save the batch" incident response. */
  unload(processorId: string): Inventory {
    const processor = this.get(processorId);
    if (!processor) return {};
    const recovered: Record<string, number> = {};
    for (const entry of processor.queue) {
      const recipe = getRecipe(entry.recipeId);
      if (!recipe) continue;
      recovered[recipe.inputItemId] =
        (recovered[recipe.inputItemId] ?? 0) + recipe.inputQuantity * entry.batches;
    }
    processor.queue = [];
    this.events.emit('processing:idle', { processorId });
    return recovered;
  }

  /**
   * Advances every machine and reports what came out, and where.
   *
   * Output lands at the machine rather than in a global inventory, so a mill on
   * the far parcel still has to be visited - processing does not exempt the
   * player from hauling, it gives them something better to haul.
   */
  advance(
    dtTicks: number,
    specialization: SpecializationId | null,
    placementOf: (buildingId: string) => ProcessorPlacement | undefined,
  ): readonly ProcessedBatch[] {
    const batches: ProcessedBatch[] = [];
    for (const processor of this.#processors) {
      const placement = placementOf(processor.buildingId);
      if (!placement) continue;

      const outcome = advanceQueue(processor.queue, dtTicks, specialization, placement.broken);
      processor.queue = outcome.queue.map((entry) => ({ ...entry }));
      if (outcome.completedBatches <= 0) continue;

      batches.push({
        processorId: processor.id,
        tileX: placement.tileX,
        tileZ: placement.tileZ,
        items: outcome.produced,
      });
      for (const [itemId, quantity] of Object.entries(outcome.produced)) {
        this.events.emit('processing:completed', { processorId: processor.id, itemId, quantity });
      }
      if (processor.queue.length === 0) {
        this.events.emit('processing:idle', { processorId: processor.id });
      }
    }
    return batches;
  }

  /** Ticks until this machine is idle. Shown on its panel. */
  remainingTicks(processorId: string, specialization: SpecializationId | null): number {
    const processor = this.get(processorId);
    return processor ? queueDuration(processor.queue, specialization) : 0;
  }

  busyCount(): number {
    return this.#processors.filter((processor) => processor.queue.length > 0).length;
  }

  /** Processor ids a breakdown could target. Only busy machines are worth breaking. */
  incidentCandidates(): string[] {
    return this.#processors
      .filter((processor) => processor.queue.length > 0)
      .map((processor) => processor.buildingId);
  }

  hydrate(processors: readonly ProcessorState[]): void {
    this.#processors = processors.map((processor) => ({
      ...processor,
      queue: processor.queue.map((entry) => ({ ...entry })),
      held: { ...processor.held },
    }));
  }

  toSaveState(): ProcessorState[] {
    return this.#processors.map((processor) => ({
      ...processor,
      queue: processor.queue.map((entry) => ({ ...entry })),
      held: { ...processor.held },
    }));
  }
}
