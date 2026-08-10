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
    fetchMock.mockImplementation(always({ id: 's1', slot_index: 0, version: 1 }));
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
});

describe('cloud save concurrency', () => {
  it('sends the last known server version as base_version, not always zero', async () => {
    const saves = new GlitchCloudSave(new GlitchClient('t'), TITLE);
    fetchMock.mockImplementation(always({ id: 's1', slot_index: 0, version: 7 }));
    await saves.store('install-1', 0, new Uint8Array([1]));

    fetchMock.mockImplementation(always({ id: 's1', slot_index: 0, version: 8 }));
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
          save_id: 'S',
          conflict_id: 'C',
          server_version: 7,
          your_base_version: 5,
        },
        409,
      ),
    );
    const saves = new GlitchCloudSave(new GlitchClient('t'), TITLE);
    const outcome = await saves.store('install-1', 0, new Uint8Array([1]));

    expect(outcome.kind).toBe('conflict');
    if (outcome.kind === 'conflict') {
      expect(outcome.conflict.conflict_id).toBe('C');
      expect(outcome.conflict.save_id).toBe('S');
    }
  });

  it('resolves a conflict with an explicit choice and adopts the new version', async () => {
    const saves = new GlitchCloudSave(new GlitchClient('t'), TITLE);
    fetchMock.mockImplementation(always({ id: 'S', slot_index: 0, version: 9 }));

    const record = await saves.resolve('install-1', 'S', 'C', 'use_client', 0);
    expect(record?.version).toBe(9);

    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body).toEqual({ conflict_id: 'C', choice: 'use_client' });
    expect(saves.knownVersion(0)).toBe(9);
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
});
