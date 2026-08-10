/**
 * Per-request context: a correlation id, the caller's address and the parsed
 * protocol version.
 */
import { PROTOCOL_HEADER, PROTOCOL_VERSION, isProtocolCompatible } from '@farmrise/shared';
import { HttpError } from './errors';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  readonly requestId: string;
  readonly ip: string;
  readonly userAgent: string;
}

export function createRequestContext(request: Request): RequestContext {
  return {
    requestId: request.headers.get('x-request-id') ?? randomUUID(),
    ip: clientIp(request),
    userAgent: request.headers.get('user-agent')?.slice(0, 200) ?? 'unknown',
  };
}

/**
 * Best-effort client address.
 *
 * x-forwarded-for is trivially spoofable unless the proxy in front is trusted
 * and overwrites it. It is used here only for rate limiting, where the worst
 * case of a spoofed value is that an attacker rate-limits themselves less
 * effectively - never for authorisation.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';
  return request.headers.get('x-real-ip') ?? 'unknown';
}

/**
 * Rejects clients built against an incompatible protocol major version, so a
 * stale cached bundle fails fast and visibly instead of writing a save the
 * server will misinterpret.
 */
export function assertProtocolCompatible(request: Request): void {
  const header = request.headers.get(PROTOCOL_HEADER);
  if (!header) return; // Tolerated: lets curl and health checks work.
  if (!isProtocolCompatible(header)) {
    throw HttpError.protocolMismatch(
      `This client speaks protocol ${header}, the server speaks ${PROTOCOL_VERSION}. Reload to update.`,
    );
  }
}
