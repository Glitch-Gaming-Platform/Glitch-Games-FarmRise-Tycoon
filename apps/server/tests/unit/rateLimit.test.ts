import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRateLimiter } from '@/http/rateLimit';

afterEach(() => {
  vi.useRealTimers();
});

describe('MemoryRateLimiter', () => {
  it('allows requests up to the limit', () => {
    const limiter = new MemoryRateLimiter();
    for (let i = 0; i < 5; i += 1) {
      expect(limiter.consume('key', 5).allowed).toBe(true);
    }
  });

  it('blocks the request past the limit', () => {
    const limiter = new MemoryRateLimiter();
    for (let i = 0; i < 5; i += 1) limiter.consume('key', 5);
    expect(limiter.consume('key', 5).allowed).toBe(false);
  });

  it('keeps separate keys independent', () => {
    const limiter = new MemoryRateLimiter();
    limiter.consume('a', 1);
    expect(limiter.consume('a', 1).allowed).toBe(false);
    expect(limiter.consume('b', 1).allowed).toBe(true);
  });

  it('resets after the window elapses', () => {
    vi.useFakeTimers();
    const limiter = new MemoryRateLimiter(1000);
    limiter.consume('key', 1);
    expect(limiter.consume('key', 1).allowed).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(limiter.consume('key', 1).allowed).toBe(true);
  });

  it('reports a reset time in the future', () => {
    const limiter = new MemoryRateLimiter();
    expect(limiter.consume('key', 1).resetAtMs).toBeGreaterThan(Date.now());
  });
});
