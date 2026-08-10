/**
 * Drives the state machine from the engine's frame loop and owns the one input
 * binding that is phase-level rather than gameplay-level: pause.
 */
import { SystemPriority, type EngineSystem } from '@engine/core/System.js';
import type { FixedUpdateContext, RenderContext } from '@engine/core/types.js';
import type { InputSystem } from '@engine/input/InputSystem.js';
import type { GameStateMachine } from '../states/GameStateMachine.js';
import type { GameAction } from '../GameActions.js';

export class GameStateSystem implements EngineSystem {
  readonly id = 'game-state';
  // Runs just after input so a pause pressed this tick takes effect this tick.
  readonly priority = SystemPriority.Input + 1;

  constructor(
    private readonly machine: GameStateMachine,
    private readonly input: InputSystem<GameAction>,
    private readonly canPause: () => boolean = () => true,
  ) {}

  fixedUpdate(context: FixedUpdateContext): void {
    if (this.input.wasPressed('pause')) {
      if (this.machine.current === 'playing' && this.canPause())
        this.machine.transitionTo('paused', 'player-pause');
      else if (this.machine.current === 'paused')
        this.machine.transitionTo('playing', 'player-resume');
    }
    this.machine.fixedUpdate(context);
  }

  update(context: RenderContext): void {
    this.machine.update(context);
  }
}
