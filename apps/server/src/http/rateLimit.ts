/**
 * Fixed-window rate limiter, in process memory.
 *
 * Honest about its limits: this counts per Node process, so with more than one
 * instance the effective limit is N times the configured value. That is an
 * acceptable trade for a single-player game's launch scale, and the interface
 * is deliberately the one a Redis implementation would have, so swapping it is
 * a single file change. See docs/BACKEND.md, "Scaling".
 *
 * It is a blunt-force control against credential stuffing and save spam, not a
 * quota system.
 */
export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAtMs: number;
}

export interface RateLimiter {
  consume(key: string, limitPerMinute: number): RateLimitResult;
}

interface Bucket {
  count: number;
  resetAtMs: number;
}

export class MemoryRateLimiter implements RateLimiter {
  readonly #buckets = new Map<string, Bucket>();
  #lastSweep = 0;

  constructor(private readonly windowMs = 60_000) {}

  consume(key: string, limitPerMinute: number): RateLimitResult {
    const now = Date.now();
    this.#sweep(now);

    const bucket = this.#buckets.get(key);
    if (!bucket || bucket.resetAtMs <= now) {
      const fresh = { count: 1, resetAtMs: now + this.windowMs };
      this.#buckets.set(key, fresh);
      return { allowed: true, remaining: limitPerMinute - 1, resetAtMs: fresh.resetAtMs };
    }

    bucket.count += 1;
    return {
      allowed: bucket.count <= limitPerMinute,
      remaining: Math.max(0, limitPerMinute - bucket.count),
      resetAtMs: bucket.resetAtMs,
    };
  }

  reset(): void {
    this.#buckets.clear();
  }

  /** Evicts expired buckets so a long-running process cannot grow unbounded. */
  #sweep(now: number): void {
    if (now - this.#lastSweep < this.windowMs) return;
    this.#lastSweep = now;
    for (const [key, bucket] of this.#buckets) {
      if (bucket.resetAtMs <= now) this.#buckets.delete(key);
    }
  }
}

export const rateLimiter = new MemoryRateLimiter();
