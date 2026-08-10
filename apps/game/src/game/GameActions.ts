/**
 * The game's action vocabulary and its default bindings.
 *
 * This is the one place that knows about physical keys. Everything downstream
 * asks about actions, which is what allows the settings screen to rebind and a
 * touch UI to synthesise the same actions without gameplay code noticing.
 */
import type { ActionMap } from '@engine/input/ActionMap.js';

export type GameAction =
  | 'moveForward'
  | 'moveBack'
  | 'moveLeft'
  | 'moveRight'
  | 'sprint'
  | 'interact'
  | 'cancel'
  | 'cycleCrop'
  | 'openBuild'
  | 'openMarket'
  | 'prevent'
  | 'pause'
  | 'toggleDebug';

export const DEFAULT_BINDINGS: ActionMap<GameAction> = {
  // KeyboardEvent.code is physical, so WASD stays under the same fingers on
  // AZERTY and Dvorak layouts. Arrow keys are always available as an alternate.
  moveForward: { keys: ['KeyW', 'ArrowUp'] },
  moveBack: { keys: ['KeyS', 'ArrowDown'] },
  moveLeft: { keys: ['KeyA', 'ArrowLeft'] },
  moveRight: { keys: ['KeyD', 'ArrowRight'] },
  sprint: { keys: ['ShiftLeft', 'ShiftRight'] },
  interact: { keys: ['KeyE', 'Space'], mouseButtons: [0] },
  cancel: { keys: ['Escape'] },
  cycleCrop: { keys: ['KeyQ'] },
  openBuild: { keys: ['KeyB'] },
  openMarket: { keys: ['KeyM'] },
  // F for the countermeasure: reachable with the left hand while the right
  // stays on movement, because the prevention window is short and the player
  // may be running toward the threat when it opens.
  prevent: { keys: ['KeyF'] },
  pause: { keys: ['Escape', 'KeyP'] },
  toggleDebug: { keys: ['Backquote'] },
};

export const MOVE_AXIS_X = { negative: 'moveLeft', positive: 'moveRight' } as const;
export const MOVE_AXIS_Z = { negative: 'moveForward', positive: 'moveBack' } as const;
