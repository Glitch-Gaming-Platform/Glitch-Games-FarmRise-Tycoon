/**
 * JWT issuing and verification.
 *
 * Design decisions worth knowing:
 *  - Access tokens are short-lived (15 min default) and stateless. There is no
 *    revocation list; revocation is handled by the refresh token, which is
 *    stateful and stored.
 *  - Refresh tokens are opaque-ish JWTs carrying a session id, and every use
 *    rotates them. Reuse of a rotated token is treated as theft and kills the
 *    whole session family (see AuthService).
 *  - Access and refresh are signed with different secrets, so compromising one
 *    verification key does not yield the other class of token.
 *  - AUTH_JWT_SECRET_PREVIOUS lets a secret be rotated without logging everyone
 *    out: new tokens use the current secret, old ones still verify for one
 *    deploy window.
 */
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { getEnv } from '../config/env';

const ISSUER = 'farmrise-tycoon';
const ACCESS_AUDIENCE = 'farmrise-client';
const REFRESH_AUDIENCE = 'farmrise-refresh';

export interface AccessTokenClaims extends JWTPayload {
  sub: string;
  sid: string;
}

export interface RefreshTokenClaims extends JWTPayload {
  sub: string;
  sid: string;
  /** Rotation counter. Any value below the stored one means a replayed token. */
  gen: number;
}

const encoder = new TextEncoder();
const key = (secret: string): Uint8Array => encoder.encode(secret);

export async function issueAccessToken(
  userId: string,
  sessionId: string,
): Promise<{ token: string; expiresAt: number }> {
  const env = getEnv();
  const expiresAt = Date.now() + env.AUTH_ACCESS_TTL_SECONDS * 1000;
  const token = await new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(ACCESS_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .sign(key(env.AUTH_JWT_SECRET));
  return { token, expiresAt };
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  const env = getEnv();
  const secrets = [env.AUTH_JWT_SECRET, env.AUTH_JWT_SECRET_PREVIOUS].filter(Boolean) as string[];

  for (const secret of secrets) {
    try {
      const { payload } = await jwtVerify(token, key(secret), {
        issuer: ISSUER,
        audience: ACCESS_AUDIENCE,
        algorithms: ['HS256'],
      });
      if (typeof payload.sub === 'string' && typeof payload['sid'] === 'string') {
        return payload as AccessTokenClaims;
      }
    } catch {
      // Try the previous secret before giving up.
    }
  }
  return null;
}

export async function issueRefreshToken(
  userId: string,
  sessionId: string,
  generation: number,
): Promise<string> {
  const env = getEnv();
  return new SignJWT({ sid: sessionId, gen: generation })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(REFRESH_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + env.AUTH_REFRESH_TTL_SECONDS * 1000) / 1000))
    .sign(key(env.AUTH_REFRESH_SECRET));
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenClaims | null> {
  const env = getEnv();
  try {
    const { payload } = await jwtVerify(token, key(env.AUTH_REFRESH_SECRET), {
      issuer: ISSUER,
      audience: REFRESH_AUDIENCE,
      algorithms: ['HS256'],
    });
    if (
      typeof payload.sub === 'string' &&
      typeof payload['sid'] === 'string' &&
      typeof payload['gen'] === 'number'
    ) {
      return payload as RefreshTokenClaims;
    }
    return null;
  } catch {
    return null;
  }
}
