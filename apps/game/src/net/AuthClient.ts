/**
 * Authentication from the client's side.
 *
 * Token handling rules, and why:
 *   - The access token is held in memory only. Putting it in localStorage makes
 *     any XSS a permanent account takeover; a memory-only token dies with the tab.
 *   - The refresh token is never seen by JavaScript at all: the server sets it
 *     as an httpOnly, SameSite cookie and the browser returns it automatically.
 *   - Refresh is single-flight, so ten parallel 401s cause one refresh, not ten.
 */
import {
  Routes,
  authSessionSchema,
  type AuthSession,
  type LoginRequest,
  type PublicUser,
  type RegisterRequest,
} from '@farmrise/shared';
import { EventBus } from '@engine/core/EventBus.js';
import type { HttpTransport } from './transport/HttpTransport.js';

export interface AuthEvents extends Record<string, unknown> {
  'auth:signed-in': { user: PublicUser };
  'auth:signed-out': undefined;
  'auth:refreshed': { expiresAt: number };
}

export class AuthClient {
  readonly events = new EventBus<AuthEvents>();
  #accessToken: string | null = null;
  #expiresAt = 0;
  #user: PublicUser | null = null;
  #refreshInFlight: Promise<boolean> | null = null;

  constructor(private readonly transport: HttpTransport) {}

  get user(): PublicUser | null {
    return this.#user;
  }

  get signedIn(): boolean {
    return this.#accessToken !== null;
  }

  /** Read by HttpTransport on every request. */
  getAccessToken = (): string | null => this.#accessToken;

  async register(request: RegisterRequest): Promise<PublicUser> {
    return this.#adopt(
      await this.transport.request(Routes.authRegister(), {
        method: 'POST',
        body: request,
        schema: authSessionSchema,
        anonymous: true,
      }),
    );
  }

  async login(request: LoginRequest): Promise<PublicUser> {
    return this.#adopt(
      await this.transport.request(Routes.authLogin(), {
        method: 'POST',
        body: request,
        schema: authSessionSchema,
        anonymous: true,
      }),
    );
  }

  /**
   * Exchanges the refresh cookie for a new access token.
   * Returns false when the session is genuinely over, which the transport
   * treats as "stop retrying and surface the 401".
   */
  refresh = async (): Promise<boolean> => {
    this.#refreshInFlight ??= this.#doRefresh().finally(() => {
      this.#refreshInFlight = null;
    });
    return this.#refreshInFlight;
  };

  async logout(): Promise<void> {
    try {
      await this.transport.request(Routes.authLogout(), { method: 'POST', body: {} });
    } finally {
      this.#accessToken = null;
      this.#user = null;
      this.#expiresAt = 0;
      this.events.emit('auth:signed-out', undefined);
    }
  }

  /** True when the token is within 30s of expiry; callers refresh pre-emptively. */
  get needsRefresh(): boolean {
    return this.#accessToken !== null && Date.now() > this.#expiresAt - 30_000;
  }

  async #doRefresh(): Promise<boolean> {
    try {
      const session = await this.transport.request(Routes.authRefresh(), {
        method: 'POST',
        body: {},
        schema: authSessionSchema,
        anonymous: true,
      });
      this.#adopt(session);
      this.events.emit('auth:refreshed', { expiresAt: session.accessTokenExpiresAt });
      return true;
    } catch {
      this.#accessToken = null;
      this.#user = null;
      this.events.emit('auth:signed-out', undefined);
      return false;
    }
  }

  #adopt(session: AuthSession): PublicUser {
    this.#accessToken = session.accessToken;
    this.#expiresAt = session.accessTokenExpiresAt;
    this.#user = session.user;
    this.events.emit('auth:signed-in', { user: session.user });
    return session.user;
  }
}
