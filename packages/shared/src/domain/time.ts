/**
 * Time constants.
 *
 * The simulation advances in fixed integer ticks. Every duration in the game -
 * crop growth, animal production, construction, event warnings - is expressed
 * in ticks so that the client's prediction and the server's re-simulation
 * produce bit-identical results. Nothing in the rules layer is allowed to read
 * a wall clock.
 */
export const TICK_HZ = 60;
export const TICK_SECONDS = 1 / TICK_HZ;
export const TICK_MS = 1000 / TICK_HZ;

/** Upper bound on catch-up work per frame, so a backgrounded tab cannot freeze on return. */
export const MAX_TICKS_PER_FRAME = 5;

/** One in-game day of wall-clock time. Tuning knob for the whole economy. */
export const GAME_DAY_SECONDS = 240;
export const GAME_DAY_TICKS = GAME_DAY_SECONDS * TICK_HZ;

export type Ticks = number;

export const secondsToTicks = (seconds: number): Ticks => Math.round(seconds * TICK_HZ);
export const ticksToSeconds = (ticks: Ticks): number => ticks / TICK_HZ;
export const daysToTicks = (days: number): Ticks => Math.round(days * GAME_DAY_TICKS);

/** Human-readable countdown, e.g. "2m 05s". Presentation only. */
export function formatTicks(ticks: Ticks): string {
  const total = Math.max(0, Math.round(ticksToSeconds(ticks)));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`;
}
