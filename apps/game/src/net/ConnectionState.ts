/**
 * Tracks whether the client currently has a working link to the server, and
 * queues mutations that were attempted while it did not.
 *
 * FarmRise Tycoon is single-player, so losing the connection must never stop
 * play. The rule is: the simulation always continues locally, and anything that
 * needs the server is queued and replayed. Each queued item carries the
 * idempotency key it was created with, so replaying it after an ambiguous
 * failure cannot double-pay.
 */
import { EventBus } from '@engine/core/EventBus.js';

export type ConnectionStatus = 'online' | 'offline' | 'reconnecting' | 'unauthenticated';

export interface QueuedMutation {
  readonly id: string;
  readonly label: string;
  readonly run: () => Promise<void>;
  attempts: number;
}

export interface ConnectionEvents extends Record<string, unknown> {
  'connection:status': { status: ConnectionStatus; previous: ConnectionStatus };
  'connection:queued': { id: string; label: string; depth: number };
  'connection:flushed': { succeeded: number; failed: number };
}

export class ConnectionState {
  readonly events = new EventBus<ConnectionEvents>();
  #status: ConnectionStatus = 'online';
  readonly #queue: QueuedMutation[] = [];
  #flushing = false;

  constructor(private readonly maxAttempts = 5) {
    // The browser's own signal is a useful hint, though not a guarantee: being
    // on a network is not the same as being able to reach our server.
    globalThis.addEventListener?.('online', () => this.setStatus('reconnecting'));
    globalThis.addEventListener?.('offline', () => this.setStatus('offline'));
  }

  get status(): ConnectionStatus {
    return this.#status;
  }

  get queueDepth(): number {
    return this.#queue.length;
  }

  setStatus(status: ConnectionStatus): void {
    if (status === this.#status) return;
    const previous = this.#status;
    this.#status = status;
    this.events.emit('connection:status', { status, previous });
    if (status === 'online') void this.flush();
  }

  enqueue(mutation: Omit<QueuedMutation, 'attempts'>): void {
    this.#queue.push({ ...mutation, attempts: 0 });
    this.events.emit('connection:queued', {
      id: mutation.id,
      label: mutation.label,
      depth: this.#queue.length,
    });
  }

  /** Replays queued mutations oldest-first. Stops at the first failure. */
  async flush(): Promise<void> {
    if (this.#flushing || this.#queue.length === 0) return;
    this.#flushing = true;
    let succeeded = 0;
    let failed = 0;

    try {
      while (this.#queue.length > 0) {
        const next = this.#queue[0];
        if (!next) break;
        try {
          await next.run();
          this.#queue.shift();
          succeeded += 1;
        } catch {
          next.attempts += 1;
          failed += 1;
          if (next.attempts >= this.maxAttempts) {
            // Give up on a poisoned item rather than blocking the queue forever.
            this.#queue.shift();
            console.warn(
              `[ConnectionState] dropping "${next.label}" after ${next.attempts} attempts.`,
            );
            continue;
          }
          this.setStatus('reconnecting');
          break;
        }
      }
    } finally {
      this.#flushing = false;
      this.events.emit('connection:flushed', { succeeded, failed });
    }
  }
}
