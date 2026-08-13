/**
 * The legal transition table.
 *
 * Written out explicitly rather than allowing any-to-any, because the bugs this
 * prevents are the expensive kind: pausing during a load, returning to the menu
 * mid-transition, or double-entering `playing` and running the simulation twice.
 */
import type { GamePhase } from './GameState.js';

export const ALLOWED_TRANSITIONS: Readonly<Record<GamePhase, readonly GamePhase[]>> = Object.freeze(
  {
    boot: ['menu', 'loading'],
    menu: ['loading'],
    loading: ['playing', 'menu'],
    playing: ['paused', 'menu', 'loading', 'outcome'],
    paused: ['playing', 'menu'],
    // A season review keeps the persistent farm loaded, so continuing returns
    // directly to play. Loading remains legal for review/debug flows that do
    // intentionally replace the scene.
    outcome: ['playing', 'loading', 'menu'],
  },
);

export function canTransition(from: GamePhase, to: GamePhase): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
