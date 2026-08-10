/**
 * Behavioural event reporting.
 *
 * This is the one Glitch feature that works for EVERY player, signed in or
 * not - the probe confirmed guest installs accept events with a 201 while
 * cloud save and progression return 403. So this is where the visibility into
 * "what are players actually doing" comes from.
 *
 * Glitch models an event as (step_key, action_key): where the player was, and
 * what they did there. Ordered step_keys become funnels in the dashboard.
 *
 * Delivery rules:
 *  - Events are queued and flushed on a timer, not sent one-per-action. A
 *    farming game generates a lot of small actions and one request each would
 *    be wasteful and rate-limit-prone.
 *  - A failed flush puts events BACK on the queue, so a dropped connection
 *    delays reporting rather than losing it.
 *  - The queue is capped. Losing the oldest events is better than growing
 *    memory without bound in a long session.
 */
import type { GlitchClient } from './GlitchClient.js';

export interface GlitchEventInput {
  readonly step_key: string;
  readonly action_key: string;
  readonly step_label?: string;
  readonly step_description?: string;
  readonly event_label?: string;
  readonly event_description?: string;
  readonly previous_step_key?: string;
  readonly metadata?: Record<string, unknown>;
  readonly event_timestamp?: string;
}

const FLUSH_INTERVAL_MS = 10_000;
const MAX_QUEUE = 200;

export class GlitchEvents {
  readonly #queue: GlitchEventInput[] = [];
  #timer: ReturnType<typeof setInterval> | null = null;
  #installId: string | null = null;
  #previousStep: string | null = null;
  #flushing = false;
  #dropped = 0;

  constructor(
    private readonly client: GlitchClient,
    private readonly titleId: string,
  ) {}

  get queueDepth(): number {
    return this.#queue.length;
  }
  get droppedCount(): number {
    return this.#dropped;
  }

  start(installId: string): void {
    this.#installId = installId;
    if (this.#timer) return;
    this.#timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
  }

  /**
   * Queues an event.
   *
   * Safe to call before the install exists: events queue up and are sent once
   * `start` supplies an install id, so nothing from the first seconds of a
   * session is lost.
   */
  track(event: GlitchEventInput): void {
    const enriched: GlitchEventInput = {
      ...event,
      // Linking steps explicitly makes flow reporting independent of
      // timestamp resolution; Glitch would otherwise infer it.
      ...(this.#previousStep && this.#previousStep !== event.step_key
        ? { previous_step_key: this.#previousStep }
        : {}),
      event_timestamp: event.event_timestamp ?? new Date().toISOString(),
    };
    this.#previousStep = event.step_key;

    this.#queue.push(enriched);
    if (this.#queue.length > MAX_QUEUE) {
      this.#queue.shift();
      this.#dropped += 1;
    }
  }

  async flush(): Promise<void> {
    const installId = this.#installId;
    if (!installId || this.#flushing || this.#queue.length === 0) return;
    this.#flushing = true;

    // The bulk route requires an admin JWT, which must never ship in a client,
    // so the single-event route is used. Sent sequentially and re-queued on
    // failure rather than fired in parallel, which would reorder the funnel.
    const batch = this.#queue.splice(0, this.#queue.length);
    try {
      for (let index = 0; index < batch.length; index += 1) {
        const event = batch[index]!;
        const result = await this.client.post(`/titles/${this.titleId}/events`, {
          game_install_id: installId,
          ...event,
        });
        if (!result.ok) {
          // Put this event and everything after it back, preserving order.
          this.#queue.unshift(...batch.slice(index));
          break;
        }
      }
    } finally {
      this.#flushing = false;
    }
  }

  dispose(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }
}
