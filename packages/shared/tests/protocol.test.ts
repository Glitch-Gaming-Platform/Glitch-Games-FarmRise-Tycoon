/**
 * Wire-protocol contract tests.
 *
 * These guard the boundary between two independently deployable programs. A
 * change that breaks one of these is a breaking change for every client that is
 * already in someone's browser cache.
 */
import { describe, expect, it } from 'vitest';
import {
  ERROR_STATUS,
  ErrorCode,
  PROTOCOL_VERSION,
  Routes,
  SAVE_SCHEMA_VERSION,
  apiFailureSchema,
  apiResponseSchema,
  isProtocolCompatible,
  isRetryable,
  isSuccess,
  saveStateSchema,
  putSaveRequestSchema,
  spotSellRequestSchema,
  marketOrderSchema,
  newCareer,
  type FarmSiteSaveState,
  type SaveState,
} from '../src/index.js';
import { z } from 'zod';

describe('protocol version', () => {
  it('accepts a client on the same major version', () => {
    expect(isProtocolCompatible('1.0')).toBe(true);
    expect(isProtocolCompatible('1.7')).toBe(true);
  });

  it('rejects a different major version', () => {
    expect(isProtocolCompatible('2.0')).toBe(false);
    expect(isProtocolCompatible('0.9')).toBe(false);
  });

  it('pins the current version, so a bump is a deliberate edit', () => {
    expect(PROTOCOL_VERSION).toBe('1.0');
    expect(SAVE_SCHEMA_VERSION).toBe(3);
  });
});

describe('routes', () => {
  it('are all under the versioned prefix', () => {
    for (const build of Object.values(Routes)) {
      expect(build('x')).toMatch(/^\/api\/v1\//);
    }
  });

  it('encodes path parameters', () => {
    expect(Routes.marketFulfill('a/b')).toBe('/api/v1/market/orders/a%2Fb/fulfill');
  });
});

describe('envelope', () => {
  it('narrows a success response', () => {
    const response = { ok: true as const, data: { value: 1 } };
    expect(isSuccess(response)).toBe(true);
  });

  it('parses a failure envelope', () => {
    const parsed = apiFailureSchema.safeParse({
      ok: false,
      error: { code: ErrorCode.RULE_VIOLATION, message: 'nope' },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown error code', () => {
    const parsed = apiFailureSchema.safeParse({
      ok: false,
      error: { code: 'MADE_UP', message: 'x' },
    });
    expect(parsed.success).toBe(false);
  });

  it('validates a typed success payload', () => {
    const schema = apiResponseSchema(z.object({ id: z.string() }));
    expect(schema.safeParse({ ok: true, data: { id: 'a' } }).success).toBe(true);
    expect(schema.safeParse({ ok: true, data: { id: 42 } }).success).toBe(false);
  });

  it('maps every error code to a status, and only retries the transient ones', () => {
    for (const code of Object.values(ErrorCode)) {
      expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
    expect(isRetryable(ErrorCode.RATE_LIMITED)).toBe(true);
    expect(isRetryable(ErrorCode.RULE_VIOLATION)).toBe(false);
  });
});

describe('save schema hardening', () => {
  const validState = newCareer({ careerId: 'protocol-career', seed: 12 });

  const updateSite = (
    state: SaveState,
    mutate: (site: FarmSiteSaveState) => FarmSiteSaveState,
  ): SaveState => ({
    ...state,
    sites: state.sites.map((site) => (site.id === state.activeSiteId ? mutate(site) : site)),
  });

  it('accepts a well-formed save', () => {
    expect(saveStateSchema.safeParse(validState).success).toBe(true);
    expect(validState.onboardingCompleted).toBe(false);
  });

  it('treats a save from before the tutorial flag as already onboarded', () => {
    const previousFormat = { ...validState } as Record<string, unknown>;
    delete previousFormat['onboardingCompleted'];
    expect(saveStateSchema.parse(previousFormat).onboardingCompleted).toBe(true);
  });

  it('rejects fractional money', () => {
    expect(saveStateSchema.safeParse({ ...validState, balance: 10.5 }).success).toBe(false);
  });

  it('rejects negative money', () => {
    expect(saveStateSchema.safeParse({ ...validState, balance: -1 }).success).toBe(false);
  });

  it('rejects an unknown crop id', () => {
    const state = updateSite(validState, (site) => ({
      ...site,
      plots: site.plots.map((plot, index) =>
        index === 0 ? { ...plot, cropId: 'diamonds' as never } : plot,
      ),
    }));
    expect(saveStateSchema.safeParse(state).success).toBe(false);
  });

  it('rejects an unbounded inventory', () => {
    const inventory: Record<string, number> = {};
    for (let i = 0; i < 100; i += 1) inventory[`item${i}`] = 1;
    const state = updateSite(validState, (site) => ({
      ...site,
      stores: site.stores.map((store, index) =>
        index === 0 ? { ...store, items: inventory } : store,
      ),
    }));
    expect(saveStateSchema.safeParse(state).success).toBe(false);
  });

  it('rejects an inventory key that is not a safe id', () => {
    expect(
      saveStateSchema.safeParse(
        updateSite(validState, (site) => ({
          ...site,
          stores: site.stores.map((store, index) =>
            index === 0 ? { ...store, items: { '../../etc/passwd': 1 } } : store,
          ),
        })),
      ).success,
    ).toBe(false);
  });

  it('rejects a save with too many plots', () => {
    const plots = Array.from({ length: 300 }, (_, index) => ({
      id: `p${index}`,
      cropId: null,
      grownTicks: 0,
      tendCount: 0,
      water: 1,
      irrigated: false,
      diseased: false,
      eventMultiplier: 1,
    }));
    expect(
      saveStateSchema.safeParse(updateSite(validState, (site) => ({ ...site, plots }))).success,
    ).toBe(false);
  });

  it('requires an expected revision on writes', () => {
    expect(putSaveRequestSchema.safeParse({ state: validState }).success).toBe(false);
  });
});

describe('market request hardening', () => {
  it('requires a long enough idempotency key', () => {
    expect(
      spotSellRequestSchema.safeParse({ idempotencyKey: 'short', itemId: 'wheat', quantity: 1 })
        .success,
    ).toBe(false);
  });

  it('rejects a zero or negative quantity', () => {
    const base = { idempotencyKey: 'a'.repeat(16), itemId: 'wheat' };
    expect(spotSellRequestSchema.safeParse({ ...base, quantity: 0 }).success).toBe(false);
    expect(spotSellRequestSchema.safeParse({ ...base, quantity: -3 }).success).toBe(false);
  });

  it('has no field through which a client could propose a payout', () => {
    // If this ever fails, someone added a price to a client-sent payload.
    const keys = Object.keys(spotSellRequestSchema.shape);
    expect(keys).toEqual(['idempotencyKey', 'itemId', 'quantity']);
  });

  it('validates a server-sent order', () => {
    const parsed = marketOrderSchema.safeParse({
      id: 'ord_1',
      buyerId: 'millbrook_grocers',
      itemId: 'wheat',
      quantity: 5,
      unitPrice: 60,
      deadlineTick: 100,
      status: 'open',
    });
    expect(parsed.success).toBe(true);
  });
});
