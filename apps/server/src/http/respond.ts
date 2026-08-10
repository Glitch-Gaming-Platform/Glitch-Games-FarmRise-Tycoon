/**
 * Response construction. Every route returns through here so the envelope
 * shape, the cache headers and the request id are impossible to forget.
 */
import { ERROR_STATUS, ErrorCode, type ApiFailure } from '@farmrise/shared';
import { HttpError } from './errors';

export function jsonOk<T>(data: T, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    ...init,
    status: init.status ?? 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Game state is per-user and changes constantly. Caching it anywhere is
      // a correctness bug, and on a shared proxy it is a data leak.
      'cache-control': 'no-store',
      ...init.headers,
    },
  });
}

export function jsonError(error: unknown, requestId: string): Response {
  const httpError =
    error instanceof HttpError
      ? error
      : new HttpError(ErrorCode.INTERNAL, 'Something went wrong on our end.');

  if (!(error instanceof HttpError)) {
    // Full detail to the log, generic message to the client.
    console.error(`[api] unhandled error requestId=${requestId}`, error);
  }

  const body: ApiFailure = {
    ok: false,
    error: {
      code: httpError.code,
      message: httpError.message,
      ...(httpError.details ? { details: httpError.details } : {}),
      requestId,
    },
  };

  return new Response(JSON.stringify(body), {
    status: ERROR_STATUS[httpError.code],
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-request-id': requestId,
    },
  });
}
