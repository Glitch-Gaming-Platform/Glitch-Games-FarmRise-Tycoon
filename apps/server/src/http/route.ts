/**
 * The route wrapper.
 *
 * Every API route is defined through this function, which is what makes the
 * cross-cutting concerns impossible to forget. In order:
 *
 *   protocol check -> rate limit -> authentication -> body validation ->
 *   handler -> envelope
 *
 * Authentication comes before body validation on purpose: an anonymous caller
 * should not be able to exercise the parser, and an unauthenticated request
 * should cost as little as possible.
 *
 * A route that needs to bypass any of this has to say so explicitly in its
 * config, which makes the exception visible in code review.
 */
import type { z } from 'zod';
import { getEnv } from '../config/env';
import { verifyAccessToken } from '../auth/tokens';
import { HttpError } from './errors';
import { jsonError, jsonOk } from './respond';
import { rateLimiter } from './rateLimit';
import {
  assertProtocolCompatible,
  createRequestContext,
  type RequestContext,
} from './requestContext';

export interface AuthenticatedUser {
  readonly id: string;
  readonly sessionId: string;
}

export interface RouteHandlerInput<TBody> {
  readonly request: Request;
  readonly body: TBody;
  readonly params: Record<string, string>;
  readonly context: RequestContext;
  readonly user: AuthenticatedUser | null;
}

export interface RouteResult<TData> {
  readonly data: TData;
  readonly status?: number;
  readonly headers?: Record<string, string>;
}

export interface RouteConfig<TBody, TData> {
  /** 'required' rejects anonymous callers; 'optional' populates user if present. */
  readonly auth: 'required' | 'optional' | 'none';
  readonly bodySchema?: z.ZodType<TBody>;
  /** Overrides the default per-minute allowance for this route. */
  readonly rateLimitPerMinute?: number;
  /** Stable name used in rate-limit keys and logs. */
  readonly name: string;
  handler(input: RouteHandlerInput<TBody>): Promise<RouteResult<TData>>;
}

type NextRouteContext = { params?: Promise<Record<string, string>> | Record<string, string> };

export function createRoute<TBody, TData>(config: RouteConfig<TBody, TData>) {
  return async function route(request: Request, nextContext?: NextRouteContext): Promise<Response> {
    const context = createRequestContext(request);

    try {
      assertProtocolCompatible(request);

      const user = config.auth === 'none' ? null : await authenticate(request);
      if (config.auth === 'required' && !user) throw HttpError.unauthenticated();

      applyRateLimit(config, context, user);

      const body = await parseBody(request, config);
      const params = await resolveParams(nextContext);

      const result = await config.handler({ request, body, params, context, user });
      return jsonOk(result.data, {
        status: result.status ?? 200,
        headers: { 'x-request-id': context.requestId, ...result.headers },
      });
    } catch (error) {
      return jsonError(error, context.requestId);
    }
  };
}

async function authenticate(request: Request): Promise<AuthenticatedUser | null> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;

  const claims = await verifyAccessToken(header.slice('Bearer '.length).trim());
  if (!claims) return null;
  return { id: claims.sub, sessionId: claims.sid };
}

function applyRateLimit(
  config: RouteConfig<unknown, unknown>,
  context: RequestContext,
  user: AuthenticatedUser | null,
): void {
  const env = getEnv();
  // Authenticated callers are limited per account, anonymous ones per address.
  // Keying anonymous limits on IP is imperfect behind NAT, but the alternative
  // - no limit - makes credential stuffing free.
  const key = user ? `user:${user.id}:${config.name}` : `ip:${context.ip}:${config.name}`;
  const limit =
    config.rateLimitPerMinute ??
    (user ? env.RATE_LIMIT_USER_PER_MINUTE : env.RATE_LIMIT_ANON_PER_MINUTE);

  const result = rateLimiter.consume(key, limit);
  if (!result.allowed) {
    throw HttpError.rateLimited(
      `Too many requests. Try again in ${Math.ceil((result.resetAtMs - Date.now()) / 1000)}s.`,
    );
  }
}

async function parseBody<TBody, TData>(
  request: Request,
  config: RouteConfig<TBody, TData>,
): Promise<TBody> {
  if (!config.bodySchema) return undefined as TBody;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw HttpError.badRequest('Request body must be valid JSON.');
  }

  const parsed = config.bodySchema.safeParse(raw);
  if (!parsed.success) {
    // Field-level messages are safe to return: they describe the client's own
    // input, not server internals.
    const details: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.') || '_';
      (details[path] ??= []).push(issue.message);
    }
    throw HttpError.validation(details);
  }
  return parsed.data;
}

async function resolveParams(nextContext?: NextRouteContext): Promise<Record<string, string>> {
  const params = nextContext?.params;
  if (!params) return {};
  return params instanceof Promise ? await params : params;
}
