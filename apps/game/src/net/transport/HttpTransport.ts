/**
 * The single place the client talks to the server.
 *
 * Everything that must be true of every request lives here exactly once:
 *   - the protocol version header, so a stale cached bundle is rejected loudly
 *     instead of corrupting a save quietly
 *   - the bearer token, pulled fresh each call from the auth store, never
 *     captured in a closure that can go stale
 *   - `credentials: 'include'`, because the refresh token is an httpOnly cookie
 *   - a timeout, because fetch has none by default and a hung request would
 *     leave the game "saving" forever
 *   - envelope unwrapping and schema validation, so callers get typed data or
 *     a typed error and never a raw Response
 */
import {
  ErrorCode,
  PROTOCOL_HEADER,
  PROTOCOL_VERSION,
  apiFailureSchema,
  isRetryable,
  type ApiFailure,
} from '@farmrise/shared';
import type { z } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    readonly details?: Record<string, string[]>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get retryable(): boolean {
    return isRetryable(this.code);
  }
}

export interface HttpTransportOptions {
  readonly baseUrl?: string;
  readonly getAccessToken?: () => string | null;
  /** Called on 401 so the caller can refresh and retry once. */
  readonly onUnauthenticated?: () => Promise<boolean>;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
}

export interface RequestOptions<TResponse> {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  readonly schema?: z.ZodType<TResponse>;
  readonly signal?: AbortSignal;
  /** Skips the auth header. Used for login/register. */
  readonly anonymous?: boolean;
}

export class HttpTransport {
  readonly #options: Required<Pick<HttpTransportOptions, 'baseUrl' | 'timeoutMs' | 'maxRetries'>> &
    HttpTransportOptions;

  constructor(options: HttpTransportOptions = {}) {
    this.#options = {
      baseUrl: options.baseUrl ?? '',
      timeoutMs: options.timeoutMs ?? 10_000,
      maxRetries: options.maxRetries ?? 2,
      ...options,
    };
  }

  async request<TResponse>(
    path: string,
    options: RequestOptions<TResponse> = {},
  ): Promise<TResponse> {
    let attempt = 0;
    let refreshed = false;

    for (;;) {
      try {
        return await this.#attempt<TResponse>(path, options);
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;

        // One transparent refresh-and-retry on 401. More than one would loop
        // forever against a genuinely invalid session.
        if (error.code === ErrorCode.UNAUTHENTICATED && !refreshed && !options.anonymous) {
          refreshed = true;
          if (await this.#options.onUnauthenticated?.()) continue;
        }

        if (!error.retryable || attempt >= this.#options.maxRetries) throw error;
        attempt += 1;
        // Exponential backoff with jitter, so a server hiccup does not turn
        // into a synchronised stampede from every client at once.
        const delay = 250 * 2 ** (attempt - 1) * (0.5 + Math.random());
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  async #attempt<TResponse>(path: string, options: RequestOptions<TResponse>): Promise<TResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#options.timeoutMs);
    options.signal?.addEventListener('abort', () => controller.abort(), { once: true });

    const headers: Record<string, string> = {
      accept: 'application/json',
      [PROTOCOL_HEADER]: PROTOCOL_VERSION,
    };
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (!options.anonymous) {
      const token = this.#options.getAccessToken?.();
      if (token) headers['authorization'] = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await fetch(`${this.#options.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        credentials: 'include',
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timeout);
      // Network failure and timeout are indistinguishable here, and both mean
      // the same thing to the caller: try again later.
      throw new ApiError(
        ErrorCode.INTERNAL,
        'Could not reach the server.',
        0,
        undefined,
        undefined,
      );
    } finally {
      clearTimeout(timeout);
    }

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok || !isEnvelope(payload) || payload.ok === false) {
      const failure = apiFailureSchema.safeParse(payload);
      const error: ApiFailure['error'] = failure.success
        ? failure.data.error
        : { code: ErrorCode.INTERNAL, message: `Request failed with HTTP ${response.status}.` };
      throw new ApiError(
        error.code,
        error.message,
        response.status,
        error.details,
        error.requestId,
      );
    }

    const data = (payload as { data: unknown }).data;
    if (!options.schema) return data as TResponse;

    const parsed = options.schema.safeParse(data);
    if (!parsed.success) {
      // The server sent something this client does not understand. Treated as a
      // protocol mismatch rather than a generic error, because the fix is
      // almost always "reload to get the matching bundle".
      throw new ApiError(
        ErrorCode.PROTOCOL_MISMATCH,
        'The server response did not match the expected format. Try reloading.',
        response.status,
      );
    }
    return parsed.data;
  }
}

function isEnvelope(value: unknown): value is { ok: boolean; data?: unknown } {
  return typeof value === 'object' && value !== null && 'ok' in value;
}

/** Idempotency keys for money-moving requests. */
export function newIdempotencyKey(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}
