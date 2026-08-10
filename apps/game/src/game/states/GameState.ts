/**
 * Game states model the coarse phases of the app: booting, sitting in a menu,
 * loading, playing, paused.
 *
 * They are intentionally separate from scenes. A scene is "what is on screen";
 * a state is "what mode is the game in". Pausing must not tear down the farm
 * scene, and the loading screen must be able to sit in front of it - neither is
 * expressible if the two concepts are merged.
 */
import type { FixedUpdateContext, RenderContext } from '@engine/core/types.js';

export type GamePhase = 'boot' | 'menu' | 'loading' | 'playing' | 'paused' | 'outcome';

export interface GameStateContext {
  /** Requests a transition. The machine validates it against the table. */
  readonly transitionTo: (phase: GamePhase, reason?: string) => void;
}

export interface GameState {
  readonly id: GamePhase;
  enter?(context: GameStateContext, from: GamePhase | null): void | Promise<void>;
  exit?(to: GamePhase): void;
  fixedUpdate?(context: FixedUpdateContext): void;
  update?(context: RenderContext): void;
}
