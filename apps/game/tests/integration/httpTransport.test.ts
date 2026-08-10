/**
 * Client-side protocol handling, against a stubbed fetch.
 *
 * These are the behaviours that decide whether a flaky network turns into a
 * corrupted save or a harmless retry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ErrorCode, PROTOCOL_HEADER, PROTOCOL_VERSION } from '@farmrise/shared';
import { ApiError, HttpTransport, newIdempotencyKey } from '@net/transport/HttpTransport.js';

/**
 * A fresh Response per call. Response bodies are single-use streams, so a mock
 * that resolves to one shared instance quietly fails on the second request.
 */
const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const alwaysJson =
  (body: unknown, status = 200) =>
  async () =>
    jsonResponse(body, status);

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('HttpTransport', () => {
  it('unwraps a success envelope', async () => {
    fetchMock.mockImplementation(alwaysJson({ ok: true, data: { value: 7 } }));
    const transport = new HttpTransport();
    await expect(transport.request('/api/v1/thing')).resolves.toEqual({ value: 7 });
  });

  it('sends the protocol version header on every request', async () => {
    fetchMock.mockImplementation(alwaysJson({ ok: true, data: {} }));
    await new HttpTransport().request('/api/v1/thing');
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers[PROTOCOL_HEADER]).toBe(PROTOCOL_VERSION);
  });

  it('attaches the bearer token but omits it for anonymous calls', async () => {
    fetchMock.mockImplementation(alwaysJson({ ok: true, data: {} }));
    const transport = new HttpTransport({ getAccessToken: () => 'tok' });

    await transport.request('/api/v1/thing');
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>)['authorization']).toBe(
      'Bearer tok',
    );

    await transport.request('/api/v1/public', { anonymous: true });
    expect(
      (fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>)['authorization'],
    ).toBeUndefined();
  });

  it('includes credentials so the refresh cookie is sent', async () => {
    fetchMock.mockImplementation(alwaysJson({ ok: true, data: {} }));
    await new HttpTransport().request('/api/v1/thing');
    expect(fetchMock.mock.calls[0]?.[1]?.credentials).toBe('include');
  });

  it('turns a failure envelope into a typed ApiError', async () => {
    fetchMock.mockImplementation(
      alwaysJson({ ok: false, error: { code: ErrorCode.RULE_VIOLATION, message: 'nope' } }, 422),
    );
    await expect(new HttpTransport().request('/api/v1/thing')).rejects.toMatchObject({
      code: ErrorCode.RULE_VIOLATION,
      message: 'nope',
    });
  });

  it('does not retry a non-retryable error', async () => {
    fetchMock.mockImplementation(
      alwaysJson({ ok: false, error: { code: ErrorCode.RULE_VIOLATION, message: 'nope' } }, 422),
    );
    await expect(new HttpTransport().request('/api/v1/thing')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a rate-limited request and eventually succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          { ok: false, error: { code: ErrorCode.RATE_LIMITED, message: 'slow down' } },
          429,
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { value: 1 } }));

    const transport = new HttpTransport({ maxRetries: 2 });
    await expect(transport.request('/api/v1/thing')).resolves.toEqual({ value: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refreshes once on 401 and replays the request', async () => {
    const onUnauthenticated = vi.fn().mockResolvedValue(true);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          { ok: false, error: { code: ErrorCode.UNAUTHENTICATED, message: 'expired' } },
          401,
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { value: 2 } }));

    const transport = new HttpTransport({ onUnauthenticated });
    await expect(transport.request('/api/v1/thing')).resolves.toEqual({ value: 2 });
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it('gives up when the refresh fails, instead of looping', async () => {
    const onUnauthenticated = vi.fn().mockResolvedValue(false);
    fetchMock.mockImplementation(
      alwaysJson(
        { ok: false, error: { code: ErrorCode.UNAUTHENTICATED, message: 'expired' } },
        401,
      ),
    );
    await expect(
      new HttpTransport({ onUnauthenticated }).request('/api/v1/thing'),
    ).rejects.toMatchObject({ code: ErrorCode.UNAUTHENTICATED });
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it('reports a network failure as a retryable internal error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      new HttpTransport({ maxRetries: 0 }).request('/api/v1/thing'),
    ).rejects.toMatchObject({
      code: ErrorCode.INTERNAL,
    });
  });

  it('rejects a response that does not match the expected schema', async () => {
    fetchMock.mockImplementation(alwaysJson({ ok: true, data: { value: 'not a number' } }));
    const schema = z.object({ value: z.number() });
    await expect(new HttpTransport().request('/api/v1/thing', { schema })).rejects.toMatchObject({
      code: ErrorCode.PROTOCOL_MISMATCH,
    });
  });

  it('rejects malformed JSON that is not an envelope at all', async () => {
    fetchMock.mockImplementation(async () => new Response('not json', { status: 200 }));
    await expect(
      new HttpTransport({ maxRetries: 0 }).request('/api/v1/thing'),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('newIdempotencyKey', () => {
  it('is long enough for the wire schema and unique per call', () => {
    const first = newIdempotencyKey();
    expect(first.length).toBeGreaterThanOrEqual(8);
    expect(first).not.toBe(newIdempotencyKey());
  });
});
