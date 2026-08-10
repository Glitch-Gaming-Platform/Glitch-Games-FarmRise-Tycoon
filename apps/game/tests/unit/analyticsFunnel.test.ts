/**
 * The analytics client and the funnel contract.
 *
 * These are the tests that stop the funnel quietly rotting: an event that
 * fires twice, or out of order, produces a dashboard that is confidently
 * wrong, which is worse than no dashboard.
 */
import { describe, expect, it, vi } from 'vitest';
import { AnalyticsClient, createMemorySink } from '@analytics/AnalyticsClient.js';
import { ONBOARDING_FUNNEL } from '@analytics/events.js';

const context = {
  anonId: 'anon-test',
  sessionId: 'session-test',
  protocolVersion: '1.0',
  appVersion: '0.1.0',
};

const makeClient = (batchSize = 1000) =>
  new AnalyticsClient({ context, batchSize, flushIntervalMs: 0 });

describe('AnalyticsClient', () => {
  it('records events in order with a monotonic sequence', () => {
    const client = makeClient();
    client.track('crop_planted', { cropId: 'wheat', plotId: 'p1', balance: 100, cycle: 1 });
    client.track('crop_tended', { plotId: 'p1' });

    const sequences = client.buffered.map((event) => event.seq);
    expect(sequences).toEqual([0, 1]);
    expect(client.buffered.map((e) => e.name)).toEqual(['crop_planted', 'crop_tended']);
  });

  it('fires a first_* metric at most once', () => {
    const client = makeClient();
    expect(client.trackOnce('first_success', { ms: 100, kind: 'harvest' })).toBe(true);
    expect(client.trackOnce('first_success', { ms: 900, kind: 'sale' })).toBe(false);

    const successes = client.buffered.filter((event) => event.name === 'first_success');
    expect(successes).toHaveLength(1);
    // The FIRST value is the one kept, which is the whole point of the metric.
    expect(successes[0]!.payload['ms']).toBe(100);
  });

  it('delivers batches to every sink on flush', async () => {
    const client = makeClient();
    const sink = createMemorySink();
    client.addSink(sink);
    client.track('crop_tended', { plotId: 'p1' });
    await client.flush();

    expect(sink.all).toHaveLength(1);
    expect(client.buffered).toHaveLength(0);
  });

  it('auto-flushes once the batch size is reached', async () => {
    const client = new AnalyticsClient({ context, batchSize: 2, flushIntervalMs: 0 });
    const sink = createMemorySink();
    client.addSink(sink);
    client.track('crop_tended', { plotId: 'a' });
    client.track('crop_tended', { plotId: 'b' });
    await Promise.resolve();
    expect(sink.all.length).toBeGreaterThanOrEqual(2);
  });

  it('never lets a broken sink break the game', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = makeClient();
    client.addSink({
      id: 'broken',
      deliver() {
        throw new Error('network down');
      },
    });
    client.track('crop_tended', { plotId: 'p1' });
    await expect(client.flush()).resolves.toBeUndefined();
  });

  it('drops the oldest events when the buffer overflows', () => {
    const client = new AnalyticsClient({
      context,
      batchSize: 10_000,
      maxBuffer: 3,
      flushIntervalMs: 0,
    });
    for (let i = 0; i < 5; i += 1) client.track('crop_tended', { plotId: `p${i}` });
    // The tail of a session is where drop-off lives, so the tail is kept.
    expect(client.buffered).toHaveLength(3);
    expect(client.buffered.map((e) => e.payload['plotId'])).toEqual(['p2', 'p3', 'p4']);
  });

  it('collects no personal data', () => {
    const client = makeClient();
    client.track('session_start', { referrer: '', viewport: '800x600', touch: false });
    const serialised =
      JSON.stringify(client.buffered.map((e) => e.payload)) + JSON.stringify(client.context);
    // Ids are random and nothing is derived from a person. Checked against
    // the shapes that would actually indicate PII, not the word "name" -
    // which legitimately appears as an event's own field.
    expect(serialised).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/); // email
    expect(serialised).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/); // IPv4
    expect(serialised).not.toMatch(/password|authorization|bearer/i);
    expect(client.context.anonId).not.toBe(client.context.sessionId);
  });
});

describe('the onboarding funnel', () => {
  it('lists every step exactly once', () => {
    expect(new Set(ONBOARDING_FUNNEL).size).toBe(ONBOARDING_FUNNEL.length);
  });

  it('orders the health metrics before the outcomes they measure', () => {
    const index = (name: string) => ONBOARDING_FUNNEL.indexOf(name as never);
    expect(index('session_start')).toBeLessThan(index('scene_ready'));
    expect(index('scene_ready')).toBeLessThan(index('onboarding_start'));
    expect(index('first_input')).toBeLessThan(index('first_meaningful_action'));
    expect(index('crop_planted')).toBeLessThan(index('crop_harvested'));
    expect(index('crop_harvested')).toBeLessThan(index('goods_sold'));
    expect(index('goods_sold')).toBeLessThan(index('onboarding_complete'));
  });
});

// ---------------------------------------------------------------------------

describe('local market contracts', () => {
  it('always presents a choice, even with no backend', async () => {
    const { refreshLocalContracts, createContractRng } =
      await import('@game/world/localContracts.js');
    const contracts = refreshLocalContracts([], 0, createContractRng(7));
    expect(contracts.length).toBeGreaterThanOrEqual(3);
    for (const order of contracts) {
      expect(order.quantity).toBeGreaterThan(0);
      expect(order.deadlineTick).toBeGreaterThan(0);
      expect(order.status).toBe('open');
    }
  });

  it('pays a premium over spot, or the trade-off does not exist', async () => {
    const { refreshLocalContracts, createContractRng } =
      await import('@game/world/localContracts.js');
    const { spotPriceFor } = await import('@farmrise/shared');
    for (const order of refreshLocalContracts([], 0, createContractRng(11))) {
      expect(order.unitPrice).toBeGreaterThan(spotPriceFor(order.itemId));
    }
  });

  it('drops expired orders and tops the list back up', async () => {
    const { refreshLocalContracts, createContractRng } =
      await import('@game/world/localContracts.js');
    const rng = createContractRng(3);
    const initial = refreshLocalContracts([], 0, rng);
    const later = refreshLocalContracts(initial, 1_000_000, rng);
    expect(later.length).toBeGreaterThanOrEqual(3);
    expect(later.every((order) => order.deadlineTick > 1_000_000)).toBe(true);
  });

  it('is deterministic for a given seed, so a reload cannot reroll the market', async () => {
    const { refreshLocalContracts, createContractRng } =
      await import('@game/world/localContracts.js');
    const a = refreshLocalContracts([], 0, createContractRng(99));
    const b = refreshLocalContracts([], 0, createContractRng(99));
    expect(a.map((o) => `${o.itemId}:${o.quantity}:${o.unitPrice}`)).toEqual(
      b.map((o) => `${o.itemId}:${o.quantity}:${o.unitPrice}`),
    );
  });
});
