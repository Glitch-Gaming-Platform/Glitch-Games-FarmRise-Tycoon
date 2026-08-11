/**
 * The Glitch install lifecycle: create, validate, heartbeat.
 *
 * This is the foundation every other Glitch feature stands on. Cloud saves,
 * progression and events all address the player by the install UUID this
 * class obtains and persists.
 *
 * Two ids, easy to confuse, never interchangeable:
 *   user_install_id - OUR stable local id. We invent it, persist it, reuse it.
 *   install_id      - GLITCH's UUID, returned by createInstall. Used in paths.
 */
import { EventBus } from '@engine/core/EventBus.js';
import type { Disposable } from '@engine/core/types.js';
import { STORAGE_KEYS, loadOrCreateUserInstallId, type GlitchLaunchContext } from './config.js';
import { GlitchClient } from './GlitchClient.js';

/** Heartbeat cadence from the Glitch retention docs. */
const HEARTBEAT_MS = 30_000;

export interface GlitchValidation {
  readonly valid: boolean;
  readonly user_id: string | null;
  readonly user_name: string | null;
  readonly license_type: string | null;
  readonly trial_time_remaining: number | null;
  readonly disable_playtime_tracking: boolean | null;
  readonly reason?: string | null;
  readonly code?: string | null;
}

export interface GlitchSessionEvents extends Record<string, unknown> {
  'glitch:ready': { installId: string; loggedIn: boolean };
  'glitch:validated': { validation: GlitchValidation };
  'glitch:denied': { reason: string; code: string | null };
  'glitch:unavailable': { reason: string };
}

export class GlitchSession implements Disposable {
  readonly events = new EventBus<GlitchSessionEvents>();
  readonly #client: GlitchClient;
  readonly #context: GlitchLaunchContext;
  readonly #userInstallId: string;
  readonly #sessionId: string;

  #installId: string | null = null;
  #validation: GlitchValidation | null = null;
  #heartbeat: ReturnType<typeof setInterval> | null = null;
  #email: string | null = null;
  #isActive = () => true;

  constructor(context: GlitchLaunchContext) {
    this.#context = context;
    this.#client = new GlitchClient(context.titleToken);
    this.#userInstallId = loadOrCreateUserInstallId(context.userInstallId);
    this.#sessionId =
      context.sessionId ?? globalThis.crypto?.randomUUID?.() ?? `s_${Date.now().toString(36)}`;
  }

  get installId(): string | null {
    return this.#installId;
  }
  get validation(): GlitchValidation | null {
    return this.#validation;
  }
  get client(): GlitchClient {
    return this.#client;
  }
  get titleId(): string {
    return this.#context.titleId;
  }
  /** True only when Glitch resolved a real user - the gate for saves/progression. */
  get isLoginBacked(): boolean {
    return this.#validation?.valid === true && Boolean(this.#validation.user_id);
  }

  /**
   * Creates or reuses the install, then validates it.
   *
   * `email` links the install to a real Glitch user, which is what unlocks
   * cloud saves and progression. It comes from OUR account system, so a player
   * who signs up in our game gets Glitch features without a second signup.
   */
  async start(email: string | null, isActive: () => boolean): Promise<void> {
    this.#email = email;
    this.#isActive = isActive;

    const restored = this.#restoreInstallId();
    // A Desktop-App-supplied install id is authoritative and skips creation.
    if (this.#context.installId) {
      this.#installId = this.#context.installId;
    } else {
      const created = await this.#createInstall();
      if (!created) {
        // Fall back to a previously stored id so a temporary outage does not
        // orphan the session.
        this.#installId = restored;
        if (!this.#installId) {
          this.events.emit('glitch:unavailable', { reason: 'Could not create a Glitch install.' });
          return;
        }
      }
    }

    await this.validate();
    if (this.#installId) {
      this.events.emit('glitch:ready', {
        installId: this.#installId,
        loggedIn: this.isLoginBacked,
      });
      this.#startHeartbeat();
    }
  }

  /**
   * Re-links the install after the player signs in or out.
   *
   * Reuses the SAME user_install_id, so this updates the existing install
   * rather than creating a second one for the same person.
   */
  async setAccountEmail(email: string | null): Promise<void> {
    if (email === this.#email) return;
    this.#email = email;
    await this.#createInstall();
    await this.validate();
    if (this.#installId) {
      this.events.emit('glitch:ready', {
        installId: this.#installId,
        loggedIn: this.isLoginBacked,
      });
    }
  }

  async validate(): Promise<GlitchValidation | null> {
    if (!this.#installId) return null;
    const result = await this.#client.post<GlitchValidation>(
      `/titles/${this.#context.titleId}/installs/${this.#installId}/validate`,
      {},
    );

    if (result.status === 404) {
      // The stored install id is unknown to this title. Create a fresh one.
      this.#forgetInstallId();
      if (await this.#createInstall()) return this.validate();
      return null;
    }

    if (!result.data) {
      this.events.emit('glitch:unavailable', { reason: result.error ?? 'Validation failed.' });
      return null;
    }

    this.#validation = result.data;
    this.events.emit('glitch:validated', { validation: result.data });
    if (!result.data.valid) {
      this.events.emit('glitch:denied', {
        reason: result.data.reason ?? 'Access denied.',
        code: result.data.code ?? null,
      });
    }
    return result.data;
  }

  /**
   * The heartbeat IS a repeat install call - Glitch has no separate retention
   * endpoint. Reusing the same user_install_id and session_id groups these
   * into one play session.
   */
  #startHeartbeat(): void {
    if (this.#heartbeat) return;
    this.#heartbeat = setInterval(() => {
      // Only beat while the game is actually being played. Beating through a
      // paused or backgrounded tab manufactures fake playtime.
      if (this.#isActive()) void this.#createInstall();
    }, HEARTBEAT_MS);
  }

  async #createInstall(): Promise<boolean> {
    const body: Record<string, unknown> = {
      user_install_id: this.#userInstallId,
      platform: 'web',
      device_type: 'desktop',
      operating_system:
        typeof navigator === 'undefined' ? 'browser' : navigator.platform || 'browser',
      game_version: this.#context.gameVersion,
      build_type: this.#context.buildType,
      session_id: this.#sessionId,
    };
    // Only send an email when we have one; an empty value would fail validation.
    if (this.#email) body['user_email'] = this.#email;

    const result = await this.#client.post<{ data?: { id?: string } }>(
      `/titles/${this.#context.titleId}/installs`,
      body,
    );
    const id = result.data?.data?.id;
    if (!result.ok || !id) return false;

    this.#installId = id;
    this.#persistInstallId(id);
    return true;
  }

  #restoreInstallId(): string | null {
    try {
      return globalThis.localStorage?.getItem(STORAGE_KEYS.installId) ?? null;
    } catch {
      return null;
    }
  }
  #persistInstallId(id: string): void {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEYS.installId, id);
    } catch {
      /* ephemeral */
    }
  }
  #forgetInstallId(): void {
    this.#installId = null;
    try {
      globalThis.localStorage?.removeItem(STORAGE_KEYS.installId);
    } catch {
      /* ephemeral */
    }
  }

  /** Final heartbeat so the last session length is not truncated. */
  async flush(): Promise<void> {
    if (this.#installId) await this.#createInstall();
  }

  dispose(): void {
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#heartbeat = null;
    this.events.clear();
  }
}
