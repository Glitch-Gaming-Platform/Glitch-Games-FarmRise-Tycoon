/**
 * The server's simulation clock.
 *
 * Ticks are derived from wall-clock time against a fixed epoch, so every server
 * process and every client agrees on the current tick without coordination.
 * Order deadlines are absolute ticks on this scale.
 *
 * This is the authority. A client's reported tick is a hint used only for
 * diagnostics and drift detection.
 */
import { TICK_MS } from '@farmrise/shared';
import { SERVER_EPOCH_MS } from '../config/env';

export function serverTick(now = Date.now()): number {
  return Math.max(0, Math.floor((now - SERVER_EPOCH_MS) / TICK_MS));
}

export function ticksToMs(ticks: number): number {
  return ticks * TICK_MS;
}
