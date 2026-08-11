/**
 * Beds, what is growing in them and the state of the ground underneath.
 *
 * Plots are created and destroyed at runtime now: buying a parcel adds eight of
 * them, and the renderer has to cope (docs/PROGRESSION_GAMEPLAY_PLAN.md §34.5).
 * That is why this model owns both the plot states and their placements, and
 * why it announces additions rather than assuming a fixed list.
 */
import {
  advancePlot,
  asPlotId,
  emptyPlot,
  soilAfterFallow,
  soilAfterHarvest,
  plotStage,
  type PlotState,
  type Season,
} from '@farmrise/shared';
import { EventBus } from '@engine/core/EventBus.js';
import { TileFlag, type TileGrid } from '@engine/physics/TileGrid.js';

export interface BedPlacement {
  readonly id: string;
  readonly tileX: number;
  readonly tileZ: number;
}

export interface FieldModelEvents extends Record<string, unknown> {
  'field:plot-changed': { plotId: string };
  'field:plots-added': { plotIds: readonly string[] };
}

export class FieldModel {
  readonly events = new EventBus<FieldModelEvents>();
  readonly #plots = new Map<string, PlotState>();
  readonly #placements = new Map<string, BedPlacement>();

  constructor(private readonly grid: TileGrid) {}

  get plots(): ReadonlyMap<string, PlotState> {
    return this.#plots;
  }

  get placements(): readonly BedPlacement[] {
    return [...this.#placements.values()];
  }

  get count(): number {
    return this.#plots.size;
  }

  placement(plotId: string): BedPlacement | undefined {
    return this.#placements.get(plotId);
  }

  get(plotId: string): PlotState | undefined {
    return this.#plots.get(plotId);
  }

  set(plotId: string, next: PlotState): void {
    this.#plots.set(plotId, next);
    this.events.emit('field:plot-changed', { plotId });
  }

  /**
   * Adds beds that were not there before.
   *
   * Idempotent, because it is called both when a parcel is bought and when a
   * save is loaded for a farm that already owns that parcel.
   */
  addBeds(beds: readonly BedPlacement[], soil = 1): readonly string[] {
    const added: string[] = [];
    for (const bed of beds) {
      this.#placements.set(bed.id, bed);
      this.grid.setFlag(bed.tileX, bed.tileZ, TileFlag.Soil, true);
      if (this.#plots.has(bed.id)) continue;
      this.#plots.set(bed.id, emptyPlot(asPlotId(bed.id), soil));
      added.push(bed.id);
    }
    if (added.length > 0) this.events.emit('field:plots-added', { plotIds: added });
    return added;
  }

  /** Restores saved plot states onto beds that already exist. */
  hydrate(states: readonly PlotState[]): void {
    for (const state of states) {
      if (!this.#placements.has(state.id as string)) continue;
      this.#plots.set(state.id as string, { ...state });
    }
  }

  /**
   * Advances growth, and lets empty ground recover.
   *
   * Fallow recovery is applied here rather than on planting so that resting a
   * bed is something the player watches happen, which is what makes it feel
   * like a decision rather than a hidden modifier.
   */
  advance(dtTicks: number, season: Season): void {
    for (const [plotId, plot] of this.#plots) {
      if (plot.cropId) {
        const next = advancePlot(plot, dtTicks, season);
        if (next !== plot) this.#plots.set(plotId, next);
        continue;
      }
      if (plot.soil < 1) {
        this.#plots.set(plotId, { ...plot, soil: soilAfterFallow(plot.soil, dtTicks) });
      }
    }
  }

  /** Applies the soil cost of a harvest and remembers the crop for rotation. */
  recordHarvest(plotId: string, cropId: string, soilStrain: number): void {
    const plot = this.#plots.get(plotId);
    if (!plot) return;
    this.set(plotId, {
      ...emptyPlot(plot.id, soilAfterHarvest(plot.soil, cropId, soilStrain), cropId),
    });
  }

  readyPlotIds(): string[] {
    return [...this.#plots.entries()]
      .filter(([, plot]) => plotStage(plot) === 'ready')
      .map(([plotId]) => plotId);
  }

  growingCount(): number {
    return [...this.#plots.values()].filter((plot) => plot.cropId !== null).length;
  }

  /** Plot ids a plot-targeting incident could pick. */
  incidentCandidates(): string[] {
    return [...this.#plots.entries()]
      .filter(([, plot]) => plot.cropId !== null)
      .map(([plotId]) => plotId);
  }

  applyMultiplier(plotId: string, multiplier: number): void {
    const plot = this.#plots.get(plotId);
    if (!plot) return;
    this.set(plotId, { ...plot, eventMultiplier: plot.eventMultiplier * multiplier });
  }

  toSaveState(): PlotState[] {
    return [...this.#plots.values()].map((plot) => ({ ...plot }));
  }
}
