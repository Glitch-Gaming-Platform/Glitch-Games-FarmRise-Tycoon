/**
 * Schedules the warned farm events.
 *
 * The contract this class exists to guarantee (design pillar "Recoverable
 * Disruption"):
 *   - nothing ever lands without a warning first
 *   - the player always has an action available during the warning window
 *   - the damage is applied to named assets, so it is visible
 *
 * Event selection uses the world's seeded RNG, never Math.random, so the server
 * can reproduce the same schedule when it re-simulates a save.
 */
import { BUILDINGS, FARM_EVENTS, cents, type FarmEventKind } from '@farmrise/shared';
import { EventBus } from '@engine/core/EventBus.js';
import type { FarmWorld } from '../world/FarmWorld.js';

export type EventPhase = 'idle' | 'warning' | 'active';

export interface ActiveFarmEvent {
  readonly kind: FarmEventKind;
  phase: EventPhase;
  remainingTicks: number;
  /** Set when the player paid for prevention or performed the response in time. */
  mitigated: boolean;
  /** Plot ids or animal species the event is aimed at. */
  readonly targets: readonly string[];
}

export interface EventDirectorEvents extends Record<string, unknown> {
  'event:warned': {
    kind: FarmEventKind;
    message: string;
    ticksUntilImpact: number;
    targets: readonly string[];
  };
  'event:started': { kind: FarmEventKind; mitigated: boolean };
  'event:ended': { kind: FarmEventKind; mitigated: boolean };
  'event:mitigated': { kind: FarmEventKind };
}

export interface EventDirectorOptions {
  /** Average ticks between events. Randomised +/-40% around this. */
  readonly meanIntervalTicks?: number;
  /** Grace period at the start of a session before anything can go wrong. */
  readonly graceTicks?: number;
}

export class EventDirector {
  readonly events = new EventBus<EventDirectorEvents>();
  #current: ActiveFarmEvent | null = null;
  #ticksUntilNext: number;
  readonly #meanInterval: number;

  constructor(
    private readonly world: FarmWorld,
    options: EventDirectorOptions = {},
  ) {
    this.#meanInterval = options.meanIntervalTicks ?? 60 * 150;
    this.#ticksUntilNext = options.graceTicks ?? 60 * 90;
  }

  get current(): ActiveFarmEvent | null {
    return this.#current;
  }

  fixedUpdate(dtTicks = 1): void {
    if (this.#current) {
      this.#advanceCurrent(dtTicks);
      return;
    }
    this.#ticksUntilNext -= dtTicks;
    if (this.#ticksUntilNext <= 0) this.#schedule();
  }

  /**
   * Pays to prevent the incoming event. Only legal during the warning window -
   * that is what makes the warning meaningful rather than decorative.
   */
  prevent(): { ok: boolean; reason?: string } {
    const current = this.#current;
    if (!current || current.phase !== 'warning') {
      return { ok: false, reason: 'Nothing to prevent right now.' };
    }
    const cost = FARM_EVENTS[current.kind].preventionCost;
    if (this.world.balance < cost) return { ok: false, reason: 'Not enough money.' };

    this.world.adjustBalance(cents(-cost));
    current.mitigated = true;
    this.events.emit('event:mitigated', { kind: current.kind });
    return { ok: true };
  }

  #schedule(): void {
    const kinds = Object.keys(FARM_EVENTS) as FarmEventKind[];
    const kind = this.world.rng.pick(kinds);
    const definition = FARM_EVENTS[kind];
    const targets = this.#pickTargets(kind);

    if (targets.length === 0) {
      // Nothing to hit - do not fire an event the player cannot act on.
      this.#ticksUntilNext = this.#nextInterval();
      return;
    }

    this.#current = {
      kind,
      phase: 'warning',
      remainingTicks: definition.warningTicks,
      mitigated: this.#autoMitigated(kind),
      targets,
    };
    this.events.emit('event:warned', {
      kind,
      message: definition.warningText,
      ticksUntilImpact: definition.warningTicks,
      targets,
    });
  }

  #advanceCurrent(dtTicks: number): void {
    const current = this.#current;
    if (!current) return;
    current.remainingTicks -= dtTicks;
    if (current.remainingTicks > 0) return;

    const definition = FARM_EVENTS[current.kind];
    if (current.phase === 'warning') {
      current.phase = 'active';
      current.remainingTicks = definition.durationTicks;
      this.#applyImpact(current);
      this.events.emit('event:started', { kind: current.kind, mitigated: current.mitigated });
      return;
    }

    this.events.emit('event:ended', { kind: current.kind, mitigated: current.mitigated });
    this.#current = null;
    this.#ticksUntilNext = this.#nextInterval();
  }

  #applyImpact(event: ActiveFarmEvent): void {
    const definition = FARM_EVENTS[event.kind];
    const multiplier = event.mitigated
      ? definition.mitigatedMultiplier
      : definition.unmitigatedMultiplier;

    if (definition.targets === 'crops') {
      for (const plotId of event.targets) {
        const plot = this.world.getPlot(plotId);
        if (!plot) continue;
        this.world.setPlot(plotId, {
          ...plot,
          eventMultiplier: plot.eventMultiplier * multiplier,
          water: Math.min(plot.water, 0.2),
        });
      }
    } else {
      for (const group of this.world.animals) {
        if (!event.targets.includes(group.species)) continue;
        const survivors = Math.ceil(group.count * multiplier);
        group.count = Math.max(0, survivors);
      }
    }
  }

  /** Irrigation and fences are the standing countermeasures; owning them counts. */
  #autoMitigated(kind: FarmEventKind): boolean {
    if (kind === 'drought') return this.world.completedBuildings('irrigation').length > 0;
    return this.world.completedBuildings('fence').length >= 2;
  }

  #pickTargets(kind: FarmEventKind): string[] {
    if (FARM_EVENTS[kind].targets === 'crops') {
      const planted = [...this.world.plots.entries()]
        .filter(([, plot]) => plot.cropId !== null)
        .map(([plotId]) => plotId);
      if (planted.length === 0) return [];
      // Hit roughly half the planted plots, so abandoning an exposed corner to
      // protect the rest is a real option.
      const count = Math.max(1, Math.ceil(planted.length / 2));
      const shuffled = [...planted].sort(() => this.world.rng.next() - 0.5);
      return shuffled.slice(0, count);
    }
    return this.world.animals.filter((group) => group.count > 0).map((group) => group.species);
  }

  #nextInterval(): number {
    const jitter = 0.6 + this.world.rng.next() * 0.8;
    return Math.round(this.#meanInterval * jitter);
  }
}

/** Cost of the countermeasure for the currently warned event, for the HUD. */
export function preventionCostFor(kind: FarmEventKind) {
  return FARM_EVENTS[kind].preventionCost;
}

/** Which building would have prevented this event, for tutorial-style hints. */
export function counterBuildingFor(kind: FarmEventKind) {
  return kind === 'drought' ? BUILDINGS.irrigation : BUILDINGS.fence;
}
