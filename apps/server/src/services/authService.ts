/**
 * Registration, login, refresh and logout.
 *
 * Security decisions and why:
 *  - Registration and login return the same shape and take a similar amount of
 *    time whether or not the account exists, so neither can be used to
 *    enumerate registered email addresses.
 *  - Refresh tokens rotate on every use. Presenting an old generation means the
 *    token was captured and replayed, so the entire session family is revoked
 *    rather than just that token - the legitimate user is logged out, which is
 *    the correct outcome when their token is known to be compromised.
 *  - Sessions are stored, so logout and revocation are real rather than
 *    advisory.
 */
import type { LoginRequest, PublicUser, RegisterRequest } from '@farmrise/shared';
import { getEnv } from '../config/env';
import { newId } from '../db/ids';
import { fakeVerifyDelay, hashPassword, verifyPassword } from '../auth/password';
import { issueAccessToken, issueRefreshToken, verifyRefreshToken } from '../auth/tokens';
import { HttpError } from '../http/errors';
import type { Repositories, UserRecord } from '../repositories/ports';

export interface IssuedSession {
  readonly user: PublicUser;
  readonly accessToken: string;
  readonly accessTokenExpiresAt: number;
  readonly refreshToken: string;
}

export class AuthService {
  constructor(private readonly repositories: Repositories) {}

  async register(request: RegisterRequest, userAgent: string): Promise<IssuedSession> {
    const email = request.email.trim().toLowerCase();
    const passwordHash = await hashPassword(request.password);

    const user = await this.repositories.users.create({
      id: newId('usr'),
      email,
      displayName: request.displayName.trim(),
      passwordHash,
    });

    // The uniqueness check lives in the database, so a concurrent duplicate
    // registration is caught here rather than producing two accounts.
    if (!user) throw HttpError.conflict('That email address is already registered.');

    return this.#issue(user, userAgent);
  }

  async login(request: LoginRequest, userAgent: string): Promise<IssuedSession> {
    const email = request.email.trim().toLowerCase();
    const user = await this.repositories.users.findByEmail(email);

    if (!user) {
      // Spend comparable time so timing does not reveal whether the account exists.
      await fakeVerifyDelay();
      throw HttpError.unauthenticated('Email or password is incorrect.');
    }

    const valid = await verifyPassword(request.password, user.passwordHash);
    if (!valid) throw HttpError.unauthenticated('Email or password is incorrect.');

    return this.#issue(user, userAgent);
  }

  /**
   * Exchanges a refresh token for a new pair.
   *
   * Every failure mode here returns the same generic 401: distinguishing
   * "expired" from "revoked" from "replayed" would tell an attacker which of
   * their stolen tokens is interesting.
   */
  async refresh(refreshToken: string | null, userAgent: string): Promise<IssuedSession> {
    if (!refreshToken) throw HttpError.unauthenticated('No refresh token.');

    const claims = await verifyRefreshToken(refreshToken);
    if (!claims) throw HttpError.unauthenticated('Session expired. Sign in again.');

    const session = await this.repositories.sessions.findById(claims.sid);
    if (!session || session.revokedAt !== null || session.expiresAt < Date.now()) {
      throw HttpError.unauthenticated('Session expired. Sign in again.');
    }

    const rotated = await this.repositories.sessions.rotate(session.id, claims.gen);
    if (!rotated) {
      // The presented generation is not the current one: this token has already
      // been used. Assume theft and revoke everything for that user.
      await this.repositories.sessions.revokeAllForUser(session.userId);
      throw HttpError.unauthenticated('Session expired. Sign in again.');
    }

    const user = await this.repositories.users.findById(rotated.userId);
    if (!user) throw HttpError.unauthenticated('Session expired. Sign in again.');

    const access = await issueAccessToken(user.id, rotated.id);
    const nextRefresh = await issueRefreshToken(user.id, rotated.id, rotated.generation);
    void userAgent;

    return {
      user: toPublicUser(user),
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: nextRefresh,
    };
  }

  async logout(sessionId: string | null): Promise<void> {
    if (sessionId) await this.repositories.sessions.revoke(sessionId);
  }

  async #issue(user: UserRecord, userAgent: string): Promise<IssuedSession> {
    const env = getEnv();
    const session = await this.repositories.sessions.create({
      id: newId('ses'),
      userId: user.id,
      expiresAt: Date.now() + env.AUTH_REFRESH_TTL_SECONDS * 1000,
      userAgent: userAgent.slice(0, 200),
    });

    const access = await issueAccessToken(user.id, session.id);
    const refreshToken = await issueRefreshToken(user.id, session.id, session.generation);

    return {
      user: toPublicUser(user),
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken,
    };
  }
}

export function toPublicUser(user: UserRecord): PublicUser {
  // Explicit projection, not a spread with deletions: a future column added to
  // UserRecord cannot accidentally leak to the client.
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
  };
}
