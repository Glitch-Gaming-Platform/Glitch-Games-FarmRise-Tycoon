/**
 * Auth routes, including the authorization failures. A route test that only
 * covers the happy path proves very little about a security boundary.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ErrorCode } from '@farmrise/shared';
import { POST as register } from '@app/api/v1/auth/register/route';
import { POST as login } from '@app/api/v1/auth/login/route';
import { POST as refresh } from '@app/api/v1/auth/refresh/route';
import { POST as logout } from '@app/api/v1/auth/logout/route';
import { GET as me } from '@app/api/v1/auth/me/route';
import { GET as health } from '@app/api/v1/health/route';
import { installHarness, readBody, request, signUp, teardownHarness, type Harness } from './setup';

let harness: Harness;

beforeEach(() => {
  harness = installHarness();
});
afterEach(teardownHarness);

const body = {
  email: 'player@example.com',
  displayName: 'Player',
  password: 'a-sufficiently-long-password',
};

describe('POST /auth/register', () => {
  it('creates an account and sets an httpOnly refresh cookie', async () => {
    const response = await register(
      request('/api/v1/auth/register', { method: 'POST', json: body }),
    );
    expect(response.status).toBe(201);

    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');

    const payload = await readBody<{ ok: boolean; data: { accessToken: string } }>(response);
    expect(payload.ok).toBe(true);
    expect(payload.data.accessToken).toBeTruthy();
  });

  it('never puts the refresh token in the response body', async () => {
    const response = await register(
      request('/api/v1/auth/register', { method: 'POST', json: body }),
    );
    const text = JSON.stringify(await response.json());
    expect(text).not.toContain('refreshToken');
  });

  it('rejects a short password with field-level detail', async () => {
    const response = await register(
      request('/api/v1/auth/register', { method: 'POST', json: { ...body, password: 'short' } }),
    );
    expect(response.status).toBe(422);
    const payload = await readBody<{ error: { code: string; details: Record<string, string[]> } }>(
      response,
    );
    expect(payload.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(payload.error.details['password']).toBeDefined();
  });

  it('rejects a malformed email', async () => {
    const response = await register(
      request('/api/v1/auth/register', {
        method: 'POST',
        json: { ...body, email: 'not-an-email' },
      }),
    );
    expect(response.status).toBe(422);
  });

  it('rejects a body that is not JSON', async () => {
    const response = await register(
      request('/api/v1/auth/register', {
        method: 'POST',
        body: 'not json',
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(response.status).toBe(400);
  });

  it('rejects a duplicate registration', async () => {
    await register(request('/api/v1/auth/register', { method: 'POST', json: body }));
    const second = await register(request('/api/v1/auth/register', { method: 'POST', json: body }));
    expect(second.status).toBe(409);
  });
});

describe('POST /auth/login', () => {
  it('signs in with correct credentials', async () => {
    await signUp(harness);
    const response = await login(
      request('/api/v1/auth/login', {
        method: 'POST',
        json: { email: body.email, password: body.password },
      }),
    );
    expect(response.status).toBe(200);
  });

  it('rejects a wrong password with 401 and no detail about which field failed', async () => {
    await signUp(harness);
    const response = await login(
      request('/api/v1/auth/login', {
        method: 'POST',
        json: { email: body.email, password: 'wrong-password-here' },
      }),
    );
    expect(response.status).toBe(401);
    const payload = await readBody<{ error: { message: string } }>(response);
    expect(payload.error.message).toBe('Email or password is incorrect.');
  });

  it('rate limits repeated attempts', async () => {
    await signUp(harness);
    const attempt = () =>
      login(
        request('/api/v1/auth/login', {
          method: 'POST',
          json: { email: body.email, password: 'wrong-password-here' },
        }),
      );

    let limited = false;
    for (let i = 0; i < 15; i += 1) {
      const response = await attempt();
      if (response.status === 429) limited = true;
    }
    expect(limited).toBe(true);
  });
});

describe('authenticated routes', () => {
  it('rejects /auth/me without a token', async () => {
    const response = await me(request('/api/v1/auth/me'));
    expect(response.status).toBe(401);
  });

  it('rejects /auth/me with a garbage token', async () => {
    const response = await me(request('/api/v1/auth/me', { token: 'not-a-real-token' }));
    expect(response.status).toBe(401);
  });

  it('returns the caller identified by the token, not by any input', async () => {
    const session = await signUp(harness);
    const response = await me(
      request('/api/v1/auth/me?id=someone-else', { token: session.accessToken }),
    );
    const payload = await readBody<{ data: { id: string } }>(response);
    expect(payload.data.id).toBe(session.user.id);
  });

  it('logs out and clears the cookie', async () => {
    const session = await signUp(harness);
    const response = await logout(
      request('/api/v1/auth/logout', { method: 'POST', token: session.accessToken }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});

describe('POST /auth/refresh', () => {
  it('rejects a request with no cookie', async () => {
    const response = await refresh(request('/api/v1/auth/refresh', { method: 'POST' }));
    expect(response.status).toBe(401);
  });

  it('issues a new access token from a valid cookie', async () => {
    const registered = await register(
      request('/api/v1/auth/register', { method: 'POST', json: body }),
    );
    const cookie = registered.headers.get('set-cookie')!.split(';')[0]!;

    const response = await refresh(
      request('/api/v1/auth/refresh', { method: 'POST', headers: { cookie } }),
    );
    expect(response.status).toBe(200);
  });
});

describe('protocol negotiation', () => {
  it('rejects an incompatible client', async () => {
    const bad = new Request('http://localhost/api/v1/health', {
      headers: { 'x-farmrise-protocol': '99.0' },
    });
    const response = await health(bad);
    expect(response.status).toBe(426);
  });

  it('allows a request with no protocol header at all', async () => {
    const response = await health(new Request('http://localhost/api/v1/health'));
    expect(response.status).toBe(200);
  });
}, 40_000);
