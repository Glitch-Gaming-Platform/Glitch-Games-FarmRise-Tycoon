import { beforeEach, describe, expect, it } from 'vitest';
import {
  issueAccessToken,
  issueRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '@/auth/tokens';
import { resetEnvCache } from '@/config/env';

beforeEach(() => {
  resetEnvCache();
});

describe('access tokens', () => {
  it('round-trips subject and session id', async () => {
    const { token } = await issueAccessToken('usr_1', 'ses_1');
    const claims = await verifyAccessToken(token);
    expect(claims?.sub).toBe('usr_1');
    expect(claims?.sid).toBe('ses_1');
  });

  it('rejects a tampered token', async () => {
    const { token } = await issueAccessToken('usr_1', 'ses_1');
    const tampered = `${token.slice(0, -3)}aaa`;
    await expect(verifyAccessToken(tampered)).resolves.toBeNull();
  });

  it('rejects a refresh token presented as an access token', async () => {
    // Different audience and different signing key: neither check may be skipped.
    const refresh = await issueRefreshToken('usr_1', 'ses_1', 0);
    await expect(verifyAccessToken(refresh)).resolves.toBeNull();
  });

  it('rejects an unsigned "alg: none" token', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'usr_1', sid: 'ses_1' })).toString(
      'base64url',
    );
    await expect(verifyAccessToken(`${header}.${payload}.`)).resolves.toBeNull();
  });

  it('reports an expiry in the future', async () => {
    const { expiresAt } = await issueAccessToken('usr_1', 'ses_1');
    expect(expiresAt).toBeGreaterThan(Date.now());
  });
});

describe('refresh tokens', () => {
  it('carries the rotation generation', async () => {
    const token = await issueRefreshToken('usr_1', 'ses_1', 3);
    const claims = await verifyRefreshToken(token);
    expect(claims?.gen).toBe(3);
  });

  it('rejects an access token presented as a refresh token', async () => {
    const { token } = await issueAccessToken('usr_1', 'ses_1');
    await expect(verifyRefreshToken(token)).resolves.toBeNull();
  });
});
