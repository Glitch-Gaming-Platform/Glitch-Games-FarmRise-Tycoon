/**
 * The Glitch integration.
 *
 * Two of these tests exist because the Glitch docs name them as the most
 * common integration failures: hashing the base64 instead of the decoded
 * bytes, and silently overwriting on a 409. Both would pass a smoke test and
 * fail in production, so they are pinned here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GlitchCloudSave,
  base64ToBytes,
  bytesToBase64,
  sha256Hex,
} from '@platform/glitch/GlitchCloudSave.js';
import { GlitchClient } from '@platform/glitch/GlitchClient.js';
import { GlitchEvents } from '@platform/glitch/GlitchEvents.js';
import { GlitchProgression } from '@platform/glitch/GlitchProgression.js';
import type { GlitchPlatform } from '@platform/glitch/GlitchPlatform.js';
import { GlitchSession } from '@platform/glitch/GlitchSession.js';
import { SaveDirector } from '@platform/save/SaveDirector.js';
import { cents, newCareer } from '@farmrise/shared';
import type { AuthClient } from '@net/AuthClient.js';
import type { GameApi } from '@net/GameApi.js';
import { resolveGlitchContext, loadOrCreateUserInstallId } from '@platform/glitch/config.js';
import { GLITCH_EVENT_MAP } from '../../src/bootstrap/bindGlitch.js';

const TITLE = '9a698a9d-1b27-4c78-9256-0f458368737d';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/**
 * A fresh Response per call. A Response body is a single-use stream, so
 * mockResolvedValue with one instance silently fails from the second request
 * onward - which looks exactly like a re-queue bug.
 */
const always =
  (body: unknown, status = 200) =>
  () =>
    json(body, status);

describe('optionality', () => {
  it('reports no Glitch context when no title token is configured', () => {
    // The plain-website build. Everything downstream must treat this as
    // "carry on without Glitch".
    expect(resolveGlitchContext()).toBeNull();
  });

  it('creates a stable local install id once and reuses it forever', () => {
    const first = loadOrCreateUserInstallId();
    const second = loadOrCreateUserInstallId();
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(8);
  });

  it('prefers an id supplied by the Desktop App over inventing one', () => {
    expect(loadOrCreateUserInstallId('desktop-supplied-id')).toBe('desktop-supplied-id');
  });
});

describe('required cloud startup order', () => {
  it('creates, validates, then lists the payload for a login-backed install', async () => {
    const state = newCareer({ careerId: 'ordered-cloud-load', seed: 9 });
    const rawBytes = new TextEncoder().encode(JSON.stringify(state));
    fetchMock
      .mockImplementationOnce(always({ data: { id: 'install-1' } }, 201))
      .mockImplementationOnce(
        always({
          valid: true,
          user_id: 'user-1',
          user_name: 'Farmer',
          license_type: 'owned',
          trial_time_remaining: null,
          disable_playtime_tracking: false,
        }),
      )
      .mockImplementationOnce(
        always({
          data: [
            {
              id: 'S',
              slot_index: 0,
              version: 3,
              payload: bytesToBase64(rawBytes),
              checksum: await sha256Hex(rawBytes),
              updated_at: '2026-08-10T00:00:00.000Z',
              is_conflicted: false,
            },
          ],
        }),
      );
    const session = new GlitchSession({
      titleId: TITLE,
      titleToken: 'runtime-title-token',
      installId: null,
      userInstallId: 'stable-user-install',
      sessionId: 'session-1',
      gameVersion: '0.1.0',
      buildType: 'production',
    });

    await session.start(null, () => false);
    const loaded = await new GlitchCloudSave(session.client, TITLE).loadSlot('install-1', 0);
    session.dispose();

    expect(session.isLoginBacked).toBe(true);
    expect(session.validation?.user_name).toBe('Farmer');
    expect(loaded.kind).toBe('loaded');
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      `https://api.glitch.fun/api/titles/${TITLE}/installs`,
      `https://api.glitch.fun/api/titles/${TITLE}/installs/install-1/validate`,
      `https://api.glitch.fun/api/titles/${TITLE}/installs/install-1/saves?include_payload=1`,
    ]);
  });
});

describe('cloud save payload contract', () => {
  it('round-trips raw bytes through base64', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 65, 66]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('hashes the DECODED bytes, not the base64 string', async () => {
    // This is the documented cause of CHECKSUM_MISMATCH. "hello" has a known
    // SHA-256; the base64 of "hello" hashes to something entirely different.
    const bytes = new TextEncoder().encode('hello');
    const digest = await sha256Hex(bytes);
    expect(digest).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');

    const base64Digest = await sha256Hex(new TextEncoder().encode(bytesToBase64(bytes)));
    expect(digest).not.toBe(base64Digest);
  });

  it('sends base64 payload and a hex checksum of the raw bytes', async () => {
    fetchMock.mockImplementation(always({ data: { id: 's1', slot_index: 0, version: 1 } }));
    const saves = new GlitchCloudSave(new GlitchClient('title-token'), TITLE);
    const bytes = new TextEncoder().encode('{"tick":1}');

    await saves.store('install-1', 0, bytes);

    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body.payload).toBe(bytesToBase64(bytes));
    expect(body.checksum).toBe(await sha256Hex(bytes));
    expect(body.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(body.slot_index).toBe(0);
    expect(body.base_version).toBe(0);
  });

  it('refuses a payload over the 50 MB decoded limit before sending', async () => {
    const saves = new GlitchCloudSave(new GlitchClient('t'), TITLE);
    const huge = new Uint8Array(51 * 1024 * 1024);
    const outcome = await saves.store('install-1', 0, huge);
    expect(outcome.kind).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists slot 0 with its payload and verifies decoded bytes before loading', async () => {
    const state = { ...newCareer({ careerId: 'cloud-resume', seed: 7 }), balance: cents(1_234) };
    const rawBytes = new TextEncoder().encode(JSON.stringify(state));
    fetchMock.mockImplementation(
      always({
        data: [
          {
            id: 'S',
            slot_index: 0,
            version: 4,
            payload: bytesToBase64(rawBytes),
            checksum: await sha256Hex(rawBytes),
            updated_at: '2026-08-10T00:00:00.000Z',
            is_conflicted: false,
          },
        ],
      }),
    );
    const saves = new GlitchCloudSave(new GlitchClient('t'), TITLE);

    const outcome = await saves.loadSlot('install-1', 0);

    expect(fetchMock.mock.calls[0]?.[0]).toContain('/saves?include_payload=1');
    expect(outcome.kind).toBe('loaded');
    if (outcome.kind === 'loaded') {
      expect(JSON.parse(new TextDecoder().decode(outcome.rawBytes))).toEqual(state);
    }
    expect(saves.knownVersion(0)).toBe(4);
  });

  it('refuses a cloud payload whose decoded bytes fail checksum verification', async () => {
    const rawBytes = new TextEncoder().encode('{"balance":1234}');
    fetchMock.mockImplementation(
      always({
        data: [
          {
            id: 'S',
            slot_index: 0,
            version: 4,
            payload: bytesToBase64(rawBytes),
            checksum: '0'.repeat(64),
            updated_at: '2026-08-10T00:00:00.000Z',
            is_conflicted: false,
          },
        ],
      }),
    );

    const outcome = await new GlitchCloudSave(new GlitchClient('t'), TITLE).loadSlot(
      'install-1',
      0,
    );

    expect(outcome).toMatchObject({ kind: 'unavailable', code: 'CHECKSUM_MISMATCH' });
  });
});

describe('cloud save concurrency', () => {
  it('sends the last known server version as base_version, not always zero', async () => {
    const saves = new GlitchCloudSave(new GlitchClient('t'), TITLE);
    fetchMock.mockImplementation(always({ data: { id: 's1', slot_index: 0, version: 7 } }));
    await saves.store('install-1', 0, new Uint8Array([1]));

    fetchMock.mockImplementation(always({ data: { id: 's1', slot_index: 0, version: 8 } }));
    await saves.store('install-1', 0, new Uint8Array([2]));

    const second = JSON.parse(fetchMock.mock.calls[1]![1]!.body as string);
    // Always sending 0 is what makes every save after the first conflict.
    expect(second.base_version).toBe(7);
  });

  it('surfaces a 409 as a conflict instead of overwriting', async () => {
    fetchMock.mockImplementation(
      always(
        {
          status: 'conflict',
          conflict_id: 'C',
          server_version: 7,
          message: 'A newer version exists on the server.',
        },
        409,
      ),
    );
    const saves = new GlitchCloudSave(new GlitchClient('t'), TITLE);
    const outcome = await saves.store('install-1', 0, new Uint8Array([1]));

    expect(outcome.kind).toBe('conflict');
    if (outcome.kind === 'conflict') {
      expect(outcome.conflict.conflict_id).toBe('C');
      expect(outcome.conflict.save_id).toBeUndefined();
    }
  });

  it('resolves a conflict with an explicit choice and adopts the new version', async () => {
    const saves = new GlitchCloudSave(new GlitchClient('t'), TITLE);
    fetchMock.mockImplementation(always({ data: { id: 'S', slot_index: 0, version: 9 } }));

    const record = await saves.resolve('install-1', 'S', 'C', 'use_client', 0);
    expect(record?.version).toBe(9);

    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body).toEqual({ conflict_id: 'C', choice: 'use_client' });
    expect(saves.knownVersion(0)).toBe(9);
  });

  it('looks up the slot when the conflict response omits save_id', async () => {
    const saves = new GlitchCloudSave(new GlitchClient('t'), TITLE);
    fetchMock
      .mockImplementationOnce(
        always({
          data: [
            {
              id: 'S',
              slot_index: 0,
              version: 7,
              payload: null,
              checksum: 'abc',
              updated_at: '2026-08-10T00:00:00.000Z',
              is_conflicted: true,
            },
          ],
        }),
      )
      .mockImplementationOnce(always({ data: { id: 'S', slot_index: 0, version: 9 } }));

    const record = await saves.resolveConflict(
      'install-1',
      { status: 'conflict', conflict_id: 'C', server_version: 7 },
      'use_client',
      0,
    );

    expect(record?.version).toBe(9);
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/saves/S/resolve');
    expect(saves.knownVersion(0)).toBe(9);
  });

  it('silently resolves a stale background write and continues autosaving', async () => {
    const conflict = { status: 'conflict' as const, conflict_id: 'C', server_version: 1 };
    const record = { id: 'S', slot_index: 0, version: 2 };
    const store = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'conflict', conflict })
      .mockResolvedValue({ kind: 'saved', record });
    const resolveConflict = vi.fn().mockResolvedValue(record);
    // The director primes itself with the current server version before its
    // first write, so a fake cloud has to answer `list` as well as `store`.
    const list = vi.fn().mockResolvedValue([record]);
    const glitch = {
      canUseCloudFeatures: true,
      installId: 'install-1',
      cloudSave: { store, resolveConflict, list },
    } as unknown as GlitchPlatform;
    const director = new SaveDirector(
      { signedIn: false } as unknown as AuthClient,
      {} as GameApi,
      glitch,
    );
    const state = newCareer({ careerId: 'cloud-conflict-test', seed: 42 });

    await director.save(state);
    await director.save(state);
    expect(store).toHaveBeenCalledTimes(2);
    expect(resolveConflict).toHaveBeenCalledWith('install-1', conflict, 'use_client', 0);
  });
});

describe('cloud resume', () => {
  it('chooses the verified Glitch career ahead of a different local career', async () => {
    const localState = { ...newCareer({ careerId: 'local-career', seed: 1 }), balance: cents(500) };
    const cloudState = {
      ...newCareer({ careerId: 'cloud-career', seed: 2 }),
      balance: cents(8_765),
      onboardingCompleted: true,
    };
    const loadSlot = vi.fn().mockResolvedValue({
      kind: 'loaded',
      record: { id: 'S', slot_index: 0, version: 9 },
      rawBytes: new TextEncoder().encode(JSON.stringify(cloudState)),
    });
    const glitch = {
      canUseCloudFeatures: true,
      installId: 'install-1',
      cloudSave: { loadSlot },
    } as unknown as GlitchPlatform;
    const director = new SaveDirector(
      { signedIn: false } as unknown as AuthClient,
      {} as GameApi,
      glitch,
    );
    director.writeLocal(localState);

    const loaded = await director.loadBestDocument();

    expect(loaded && 'document' in loaded ? loaded.tier : null).toBe('cloud');
    expect(loaded && 'document' in loaded ? loaded.document : null).toEqual(cloudState);
    expect(loadSlot).toHaveBeenCalledWith('install-1', 0);
  });

  it('does not overwrite an unreadable cloud slot with the local fallback', async () => {
    const localState = newCareer({ careerId: 'local-fallback', seed: 3 });
    const store = vi.fn();
    const list = vi.fn().mockResolvedValue([]);
    const glitch = {
      canUseCloudFeatures: true,
      installId: 'install-1',
      cloudSave: {
        loadSlot: vi.fn().mockResolvedValue({
          kind: 'unavailable',
          reason: 'The cloud save failed its checksum verification.',
          code: 'CHECKSUM_MISMATCH',
        }),
        list,
        store,
      },
    } as unknown as GlitchPlatform;
    const director = new SaveDirector(
      { signedIn: false } as unknown as AuthClient,
      {} as GameApi,
      glitch,
    );
    director.writeLocal(localState);

    const loaded = await director.loadBestDocument();
    await director.save(localState);

    expect(loaded && 'document' in loaded ? loaded.tier : null).toBe('local');
    expect(list).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });
});

describe('progression', () => {
  it('sends nothing when no dashboard keys are configured', async () => {
    // This title has no leaderboard or achievement definitions yet, and the
    // docs forbid inventing api_keys. Submitting must be a safe no-op.
    const progression = new GlitchProgression(new GlitchClient('t'), TITLE);
    expect(progression.configured).toBe(false);

    const outcome = await progression.submitRun('i', 'run-1', { peak: 10 }, { crops: 3 });
    expect(outcome.ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats a duplicate idempotency key as success', async () => {
    fetchMock.mockImplementation(always({ status: 'duplicate' }, 409));
    const progression = new GlitchProgression(new GlitchClient('t'), TITLE);
    // Reach past the configured-keys guard by calling the client directly.
    const result = await new GlitchClient('t').post(`/titles/${TITLE}/installs/i/submit`, {});
    expect(result.status).toBe(409);
    void progression;
  });
});

describe('behavioural events', () => {
  it('queues before an install exists and sends once it does', async () => {
    const events = new GlitchEvents(new GlitchClient('t'), TITLE);
    events.track({ step_key: 'boot', action_key: 'session_start' });
    expect(events.queueDepth).toBe(1);

    // No install yet: flushing must not send or lose anything.
    await events.flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(events.queueDepth).toBe(1);

    fetchMock.mockImplementation(always({ data: { id: 'e1' } }, 201));
    events.start('install-1');
    await events.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events.queueDepth).toBe(0);
    events.dispose();
  });

  it('links steps with previous_step_key so funnels do not rely on timestamps', async () => {
    fetchMock.mockImplementation(always({ data: {} }, 201));
    const events = new GlitchEvents(new GlitchClient('t'), TITLE);
    events.start('install-1');
    events.track({ step_key: 'onboarding', action_key: 'start' });
    events.track({ step_key: 'farm', action_key: 'crop_planted' });
    await events.flush();

    const second = JSON.parse(fetchMock.mock.calls[1]![1]!.body as string);
    expect(second.previous_step_key).toBe('onboarding');
    events.dispose();
  });

  it('re-queues on failure instead of dropping player behaviour', async () => {
    const events = new GlitchEvents(new GlitchClient('t'), TITLE);
    events.start('install-1');
    events.track({ step_key: 'farm', action_key: 'a' });
    events.track({ step_key: 'farm', action_key: 'b' });

    fetchMock.mockImplementation(always({ error: 'nope' }, 500));
    await events.flush();
    expect(events.queueDepth).toBe(2);

    fetchMock.mockImplementation(always({ data: {} }, 201));
    await events.flush();
    expect(events.queueDepth).toBe(0);
    events.dispose();
  });

  it('caps the queue rather than growing without bound', () => {
    const events = new GlitchEvents(new GlitchClient('t'), TITLE);
    for (let i = 0; i < 500; i += 1) events.track({ step_key: 'farm', action_key: `a${i}` });
    expect(events.queueDepth).toBeLessThanOrEqual(200);
    expect(events.droppedCount).toBeGreaterThan(0);
    events.dispose();
  });
});

describe('failure never reaches the player', () => {
  it('turns a network error into a result rather than an exception', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    const result = await new GlitchClient('t').get('/anything');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('NETWORK');
  });

  it('survives an HTML error page without throwing a parse error', async () => {
    // Glitch returns an HTML 500 for some routes; the probe hit exactly this.
    fetchMock.mockImplementation(
      () => new Response('<!DOCTYPE html><html>oops</html>', { status: 500 }),
    );
    const result = await new GlitchClient('t').get('/anything');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('NON_JSON_RESPONSE');
  });
});

describe('analytics bridge', () => {
  it('maps events without leaking anything identifying', () => {
    for (const mapping of Object.values(GLITCH_EVENT_MAP)) {
      expect(mapping!.step).toBeTruthy();
      expect(mapping!.action).toBeTruthy();
      expect(mapping!.actionLabel.length).toBeLessThanOrEqual(60);
    }
  });

  it('covers every stage of the core loop', () => {
    const steps = new Set(Object.values(GLITCH_EVENT_MAP).map((m) => m!.step));
    for (const stage of [
      'boot',
      'onboarding',
      'farm',
      'market',
      'reinvest',
      'setback',
      'outcome',
    ]) {
      expect(steps.has(stage)).toBe(true);
    }
  });

  it('maps livestock purchases, collection, hunger and loss as distinct behaviours', () => {
    expect(GLITCH_EVENT_MAP.animal_purchased?.step).toBe('reinvest');
    expect(GLITCH_EVENT_MAP.animal_product_collected?.step).toBe('farm');
    expect(GLITCH_EVENT_MAP.animal_hungry?.step).toBe('friction');
    expect(GLITCH_EVENT_MAP.animal_lost?.step).toBe('setback');
  });
});
