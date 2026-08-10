/**
 * Minimal HTTP client for the Glitch API.
 *
 * Deliberately not the game's own HttpTransport: that one speaks the FarmRise
 * envelope ({ ok, data }) and refreshes our own JWTs. Glitch has a different
 * contract, a different auth model and different error shapes, and pretending
 * otherwise would mean special-casing our transport for a third party.
 *
 * Every method resolves rather than throws for expected failures, because no
 * Glitch failure may ever interrupt play.
 */
import { GLITCH_API_BASE_URL } from './config.js';

export interface GlitchResult<T> {
  readonly ok: boolean;
  readonly status: number;
  readonly data: T | null;
  /** Machine-readable denial code when Glitch supplied one. */
  readonly code: string | null;
  readonly error: string | null;
}

export class GlitchClient {
  constructor(
    private readonly titleToken: string,
    private readonly baseUrl: string = GLITCH_API_BASE_URL,
    private readonly timeoutMs = 12_000,
  ) {}

  async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<GlitchResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    signal?.addEventListener('abort', () => controller.abort(), { once: true });

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${this.titleToken}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        // Glitch returns an HTML error page on 500. Treat it as an opaque failure
        // rather than letting a JSON parse error escape into gameplay.
        return {
          ok: false,
          status: response.status,
          data: null,
          code: 'NON_JSON_RESPONSE',
          error: `Glitch returned a non-JSON ${response.status} response.`,
        };
      }

      const record = (parsed ?? {}) as Record<string, unknown>;
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          data: parsed as T,
          code: (record['code'] as string) ?? (record['reason'] as string) ?? null,
          error:
            (record['error'] as string) ??
            (record['message'] as string) ??
            `Glitch request failed with ${response.status}.`,
        };
      }

      return { ok: true, status: response.status, data: parsed as T, code: null, error: null };
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      return {
        ok: false,
        status: 0,
        data: null,
        code: aborted ? 'TIMEOUT' : 'NETWORK',
        error: aborted ? 'Glitch request timed out.' : 'Could not reach Glitch.',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  get<T>(path: string, signal?: AbortSignal): Promise<GlitchResult<T>> {
    return this.request<T>('GET', path, undefined, signal);
  }

  post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<GlitchResult<T>> {
    return this.request<T>('POST', path, body, signal);
  }
}
