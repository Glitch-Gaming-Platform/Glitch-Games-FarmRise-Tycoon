/**
 * The concrete states.
 *
 * Each one is a handful of lines because the actual work lives elsewhere: the
 * scene owns the farm, the UI owns the screens. A state's job is only to say
 * "while we are in this phase, this screen is visible and the simulation is or
 * is not running".
 */
import type { FixedUpdateContext, RenderContext } from '@engine/core/types.js';
import type { SceneManager } from '@engine/scene/SceneManager.js';
import type { GamePhase, GameState, GameStateContext } from './GameState.js';

export interface PhaseDependencies {
  readonly sceneManager: SceneManager;
  readonly showScreen: (screen: 'none' | 'menu' | 'loading' | 'pause' | 'outcome') => void;
  readonly setSimulationRunning: (running: boolean) => void;
  readonly farmSceneId: string;
}

export class BootState implements GameState {
  readonly id: GamePhase = 'boot';
  constructor(private readonly deps: PhaseDependencies) {}
  enter(context: GameStateContext): void {
    this.deps.showScreen('none');
    this.deps.setSimulationRunning(false);
    // Boot exists so the engine can start with a valid state before anything is
    // loaded. It immediately hands over to the menu.
    context.transitionTo('menu', 'boot-complete');
  }
}

export class MenuState implements GameState {
  readonly id: GamePhase = 'menu';
  constructor(private readonly deps: PhaseDependencies) {}
  enter(): void {
    this.deps.showScreen('menu');
    this.deps.setSimulationRunning(false);
  }
}

export class LoadingState implements GameState {
  readonly id: GamePhase = 'loading';
  constructor(private readonly deps: PhaseDependencies) {}

  async enter(context: GameStateContext): Promise<void> {
    this.deps.showScreen('loading');
    this.deps.setSimulationRunning(false);
    try {
      await this.deps.sceneManager.goTo(this.deps.farmSceneId);
      context.transitionTo('playing', 'scene-ready');
    } catch (error) {
      console.error('[LoadingState] scene load failed', error);
      context.transitionTo('menu', 'load-failed');
    }
  }
}

export class PlayingState implements GameState {
  readonly id: GamePhase = 'playing';
  constructor(private readonly deps: PhaseDependencies) {}
  enter(): void {
    this.deps.showScreen('none');
    this.deps.setSimulationRunning(true);
  }
  exit(): void {
    this.deps.setSimulationRunning(false);
  }
  fixedUpdate(_context: FixedUpdateContext): void {
    // The simulation itself is ticked by the active scene. This hook exists for
    // phase-scoped concerns such as autosave cadence.
  }
  update(_context: RenderContext): void {}
}

/**
 * A season review pauses the simulation without ending the career.
 *
 * The scene stays loaded and the first button returns to the same farm.
 */
export class OutcomeState implements GameState {
  readonly id: GamePhase = 'outcome';
  constructor(private readonly deps: PhaseDependencies) {}
  enter(): void {
    this.deps.showScreen('outcome');
    this.deps.setSimulationRunning(false);
  }
}

export class PausedState implements GameState {
  readonly id: GamePhase = 'paused';
  constructor(private readonly deps: PhaseDependencies) {}
  enter(): void {
    this.deps.showScreen('pause');
    // Pausing stops the simulation but not the render loop, so the paused farm
    // stays visible behind the menu.
    this.deps.setSimulationRunning(false);
  }
  exit(): void {
    this.deps.showScreen('none');
  }
}
