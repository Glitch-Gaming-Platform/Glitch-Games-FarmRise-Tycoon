/**
 * Auth flows against the in-memory repositories.
 *
 * The refresh-rotation tests are the important ones: token replay is the most
 * likely real attack on a game backend with long-lived sessions.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryRepositories } from '@/repositories/memory/index';
import { AuthService } from '@/services/authService';
import { resetEnvCache } from '@/config/env';
import { HttpError } from '@/http/errors';
import { verifyRefreshToken } from '@/auth/tokens';

let repositories: ReturnType<typeof createMemoryRepositories>;
let auth: AuthService;

const credentials = {
  email: 'Farmer@Example.com',
  displayName: 'Test Farmer',
  password: 'a-sufficiently-long-password',
};

beforeEach(() => {
  resetEnvCache();
  repositories = createMemoryRepositories();
  auth = new AuthService(repositories);
});

describe('registration', () => {
  it('creates an account and issues a session', async () => {
    const session = await auth.register(credentials, 'test');
    expect(session.user.email).toBe('farmer@example.com'); // normalised
    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();
  });

  it('never returns the password hash', async () => {
    const session = await auth.register(credentials, 'test');
    expect(JSON.stringify(session.user)).not.toContain('scrypt');
  });

  it('rejects a duplicate email regardless of case', async () => {
    await auth.register(credentials, 'test');
    await expect(
      auth.register({ ...credentials, email: 'FARMER@example.com' }, 'test'),
    ).rejects.toBeInstanceOf(HttpError);
  });
});

describe('login', () => {
  it('accepts the correct password', async () => {
    await auth.register(credentials, 'test');
    const session = await auth.login(
      { email: credentials.email, password: credentials.password },
      'test',
    );
    expect(session.user.displayName).toBe('Test Farmer');
  });

  it('rejects the wrong password', async () => {
    await auth.register(credentials, 'test');
    await expect(
      auth.login({ email: credentials.email, password: 'wrong-password-x' }, 'test'),
    ).rejects.toThrow();
  });

  it('gives the same error for an unknown account as for a wrong password', async () => {
    await auth.register(credentials, 'test');
    const unknown = await auth
      .login({ email: 'nobody@example.com', password: 'whatever-password' }, 'test')
      .catch((error: HttpError) => error.message);
    const wrong = await auth
      .login({ email: credentials.email, password: 'whatever-password' }, 'test')
      .catch((error: HttpError) => error.message);
    expect(unknown).toBe(wrong);
  });
});

describe('refresh rotation', () => {
  it('issues a new token pair', async () => {
    const first = await auth.register(credentials, 'test');
    const second = await auth.refresh(first.refreshToken, 'test');
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.user.id).toBe(first.user.id);
  });

  it('rejects a replayed refresh token and kills the whole session family', async () => {
    const first = await auth.register(credentials, 'test');
    const second = await auth.refresh(first.refreshToken, 'test');

    // Replaying the original token is the signal that it was stolen.
    await expect(auth.refresh(first.refreshToken, 'test')).rejects.toThrow();
    // ...and the legitimate holder's newer token is revoked too, deliberately.
    await expect(auth.refresh(second.refreshToken, 'test')).rejects.toThrow();
  });

  it('rejects a missing token', async () => {
    await expect(auth.refresh(null, 'test')).rejects.toBeInstanceOf(HttpError);
  });

  it('rejects a garbage token', async () => {
    await expect(auth.refresh('not.a.jwt', 'test')).rejects.toBeInstanceOf(HttpError);
  });

  it('rejects a refresh after logout', async () => {
    const session = await auth.register(credentials, 'test');
    // The session id lives in the refresh token's claims, which is also how the
    // route obtains it.
    const claims = await verifyRefreshToken(session.refreshToken);
    await auth.logout(claims!.sid);
    await expect(auth.refresh(session.refreshToken, 'test')).rejects.toThrow();
  });

  it('rejects a refresh for an expired session', async () => {
    const session = await auth.register(credentials, 'test');
    const claims = await verifyRefreshToken(session.refreshToken);
    const stored = await repositories.sessions.findById(claims!.sid);
    // Simulate the stored session ageing out while the JWT is still in date.
    await repositories.sessions.create({ ...stored!, expiresAt: Date.now() - 1000 });
    await repositories.sessions.revoke(claims!.sid);
    await expect(auth.refresh(session.refreshToken, 'test')).rejects.toThrow();
  });
}, 30_000);
