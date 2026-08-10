/**
 * A small, guarded finite state machine.
 *
 * Transitions are queued rather than applied immediately: a state is allowed to
 * request a transition from inside its own update, and applying it mid-tick
 * would mean the rest of the frame runs against a half-swapped state.
 */
import { EventBus } from '@engine/core/EventBus.js';
import type { FixedUpdateContext, RenderContext } from '@engine/core/types.js';
import type { GamePhase, GameState } from './GameState.js';
import { canTransition } from './transitions.js';

export interface GameStateMachineEvents extends Record<string, unknown> {
  'state:changed': { from: GamePhase | null; to: GamePhase; reason?: string };
  'state:rejected': { from: GamePhase; to: GamePhase; reason?: string };
}

export class GameStateMachine {
  readonly events = new EventBus<GameStateMachineEvents>();
  readonly #states = new Map<GamePhase, GameState>();
  #current: GameState | null = null;
  #pending: { phase: GamePhase; reason?: string } | null = null;
  #transitioning = false;

  register(state: GameState): this {
    this.#states.set(state.id, state);
    return this;
  }

  get current(): GamePhase | null {
    return this.#current?.id ?? null;
  }

  get isTransitioning(): boolean {
    return this.#transitioning || this.#pending !== null;
  }

  /** Enters the first state. Bypasses the transition table by design. */
  async begin(phase: GamePhase): Promise<void> {
    const state = this.#require(phase);
    this.#current = state;
    await state.enter?.({ transitionTo: (next, reason) => this.transitionTo(next, reason) }, null);
    this.events.emit('state:changed', { from: null, to: phase });
  }

  transitionTo(phase: GamePhase, reason?: string): void {
    const from = this.#current?.id;
    if (!from) throw new Error('GameStateMachine.begin() must run before transitionTo().');
    if (from === phase) return;
    if (!canTransition(from, phase)) {
      this.events.emit('state:rejected', { from, to: phase, reason });
      console.warn(
        `[GameStateMachine] refused ${from} -> ${phase}. Update states/transitions.ts if this is intended.`,
      );
      return;
    }
    this.#pending = { phase, reason };
  }

  /** Applies any queued transition. Called once per frame by the owning system. */
  async flush(): Promise<void> {
    const pending = this.#pending;
    if (!pending || this.#transitioning) return;
    this.#pending = null;
    this.#transitioning = true;

    const from = this.#current?.id ?? null;
    try {
      const next = this.#require(pending.phase);
      this.#current?.exit?.(pending.phase);
      this.#current = next;
      await next.enter?.(
        { transitionTo: (phase, reason) => this.transitionTo(phase, reason) },
        from,
      );
      this.events.emit('state:changed', { from, to: pending.phase, reason: pending.reason });
    } finally {
      this.#transitioning = false;
    }
  }

  fixedUpdate(context: FixedUpdateContext): void {
    this.#current?.fixedUpdate?.(context);
  }

  update(context: RenderContext): void {
    this.#current?.update?.(context);
    void this.flush();
  }

  #require(phase: GamePhase): GameState {
    const state = this.#states.get(phase);
    if (!state) throw new Error(`No state registered for phase "${phase}".`);
    return state;
  }
}
