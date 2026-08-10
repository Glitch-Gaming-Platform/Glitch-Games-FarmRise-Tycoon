/**
 * Buffered analytics client.
 *
 * Deliberately transport-agnostic. It buffers events in memory and hands
 * batches to whatever sinks are registered, so the same client serves the
 * console during development, a test spy in CI, and an HTTP endpoint in
 * production - without gameplay code knowing which.
 *
 * There is no analytics vendor in this project yet, and adding one is a
 * business decision rather than an engineering one. What matters now is that
 * the instrumentation exists and is correct; where it is posted can change
 * in one file.
 */
import { EventBus } from '@engine/core/EventBus.js';
import type { Disposable } from '@engine/core/types.js';
import type { AnalyticsContext, AnalyticsEvent, RecordedEvent } from './events.js';

export interface AnalyticsSink {
  readonly id: string;
  deliver(events: readonly RecordedEvent[], context: AnalyticsContext): void | Promise<void>;
}

export interface AnalyticsClientEvents extends Record<string, unknown> {
  recorded: RecordedEvent;
}

export interface AnalyticsOptions {
  readonly context: AnalyticsContext;
  /** Flush when this many events are buffered. */
  readonly batchSize?: number;
  /** Or when this long has passed, whichever comes first. */
  readonly flushIntervalMs?: number;
  /** Hard cap so a long session cannot grow memory without bound. */
  readonly maxBuffer?: number;
}

export class AnalyticsClient implements Disposable {
  readonly events = new EventBus<AnalyticsClientEvents>();
  readonly #sinks: AnalyticsSink[] = [];
  readonly #buffer: RecordedEvent[] = [];
  readonly #context: AnalyticsContext;
  readonly #batchSize: number;
  readonly #maxBuffer: number;
  readonly #startedAt = Date.now();
  #seq = 0;
  #timer: ReturnType<typeof setInterval> | null = null;
  /** Names already recorded, so "first_*" events can only fire once. */
  readonly #once = new Set<string>();

  constructor(options: AnalyticsOptions) {
    this.#context = options.context;
    this.#batchSize = options.batchSize ?? 25;
    this.#maxBuffer = options.maxBuffer ?? 500;
    const interval = options.flushIntervalMs ?? 15_000;
    if (interval > 0 && typeof setInterval === 'function') {
      this.#timer = setInterval(() => void this.flush(), interval);
    }
  }

  get context(): AnalyticsContext {
    return this.#context;
  }

  get buffered(): readonly RecordedEvent[] {
    return this.#buffer;
  }

  addSink(sink: AnalyticsSink): void {
    this.#sinks.push(sink);
  }

  /** Records an event. Typed so a payload cannot drift from its name. */
  track<E extends AnalyticsEvent>(name: E['name'], payload: E['payload']): void {
    const recorded: RecordedEvent = {
      name,
      payload: payload as Record<string, unknown>,
      at: Date.now() - this.#startedAt,
      seq: this.#seq++,
    };
    this.#buffer.push(recorded);
    // Drop the OLDEST on overflow: the tail of a session is where drop-off
    // happens, and that is the part worth keeping.
    if (this.#buffer.length > this.#maxBuffer) this.#buffer.shift();
    this.events.emit('recorded', recorded);
    if (this.#buffer.length >= this.#batchSize) void this.flush();
  }

  /**
   * Records an event at most once per session.
   *
   * Used for every `first_*` metric. Without this, "time to first success"
   * would be re-reported on every subsequent success and the median would be
   * meaningless.
   */
  trackOnce<E extends AnalyticsEvent>(name: E['name'], payload: E['payload']): boolean {
    if (this.#once.has(name)) return false;
    this.#once.add(name);
    this.track(name, payload);
    return true;
  }

  has(name: string): boolean {
    return this.#once.has(name);
  }

  /** Milliseconds since the client was created. The basis of every time-to-X. */
  elapsedMs(): number {
    return Date.now() - this.#startedAt;
  }

  async flush(): Promise<void> {
    if (this.#buffer.length === 0 || this.#sinks.length === 0) return;
    const batch = this.#buffer.splice(0, this.#buffer.length);
    for (const sink of this.#sinks) {
      try {
        await sink.deliver(batch, this.#context);
      } catch (error) {
        // Analytics must never break the game. A failed delivery is dropped.
        console.warn(`[analytics] sink "${sink.id}" failed`, error);
      }
    }
  }

  dispose(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    void this.flush();
    this.events.clear();
    this.#sinks.length = 0;
  }
}

/**
 * Development sink: prints a readable timeline to the console.
 *
 * Grouped and time-stamped relative to session start, because the questions
 * being asked are all about ORDER and TIMING, and a flat list of JSON blobs
 * makes both invisible.
 */
export function createConsoleSink(): AnalyticsSink {
  return {
    id: 'console',
    deliver(events) {
      /* eslint-disable no-console */
      console.groupCollapsed(`[analytics] ${events.length} events`);
      for (const event of events) {
        const seconds = (event.at / 1000).toFixed(1).padStart(6);
        console.log(`${seconds}s  ${event.name}`, event.payload);
      }
      console.groupEnd();
      /* eslint-enable no-console */
    },
  };
}

/** In-memory sink for tests: keeps everything, asserts nothing. */
export function createMemorySink(): AnalyticsSink & { readonly all: RecordedEvent[] } {
  const all: RecordedEvent[] = [];
  return {
    id: 'memory',
    all,
    deliver(events) {
      all.push(...events);
    },
  };
}

/**
 * A stable anonymous id.
 *
 * Random, stored locally, never derived from anything about the person, and
 * regenerated silently if storage is unavailable. Its only purpose is to
 * distinguish a returning player from a new one.
 */
export function resolveAnonId(): string {
  const key = 'farmrise:anon';
  try {
    const existing = globalThis.localStorage?.getItem(key);
    if (existing) return existing;
    const created = randomId();
    globalThis.localStorage?.setItem(key, created);
    return created;
  } catch {
    return randomId();
  }
}

export function randomId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
