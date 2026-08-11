/**
 * The single entry point for everything Glitch.
 *
 * One object the rest of the game can hold, whose methods are all safe to call
 * whether or not Glitch is configured, reachable, or the player is signed in.
 * `GlitchPlatform.create()` returns null when there is no title token, and
 * every call site treats null as "no Glitch, carry on".
 */
import type { Disposable } from '@engine/core/types.js';
import { resolveGlitchContext, type GlitchLaunchContext } from './config.js';
import { GlitchSession } from './GlitchSession.js';
import { GlitchCloudSave } from './GlitchCloudSave.js';
import { GlitchProgression } from './GlitchProgression.js';
import { GlitchEvents } from './GlitchEvents.js';

export class GlitchPlatform implements Disposable {
  readonly session: GlitchSession;
  readonly cloudSave: GlitchCloudSave;
  readonly progression: GlitchProgression;
  readonly events: GlitchEvents;

  private constructor(context: GlitchLaunchContext) {
    this.session = new GlitchSession(context);
    this.cloudSave = new GlitchCloudSave(this.session.client, context.titleId);
    this.progression = new GlitchProgression(this.session.client, context.titleId);
    this.events = new GlitchEvents(this.session.client, context.titleId);

    // Events can only be delivered once an install exists.
    this.session.events.on('glitch:ready', ({ installId }) => this.events.start(installId));
  }

  /** Returns null when Glitch is not configured. That is the normal web case. */
  static create(): GlitchPlatform | null {
    const context = resolveGlitchContext();
    return context ? new GlitchPlatform(context) : null;
  }

  get installId(): string | null {
    return this.session.installId;
  }

  /** The validated Glitch identity. Glitch owns this authentication session. */
  get identity(): { readonly id: string; readonly displayName: string | null } | null {
    const validation = this.session.validation;
    if (validation?.valid !== true || !validation.user_id) return null;
    return { id: validation.user_id, displayName: validation.user_name };
  }

  /** True when cloud saves and progression are permitted for this player. */
  get canUseCloudFeatures(): boolean {
    return Boolean(this.session.installId) && this.session.isLoginBacked;
  }

  async start(email: string | null, isActive: () => boolean): Promise<void> {
    await this.session.start(email, isActive);
  }

  async setAccountEmail(email: string | null): Promise<void> {
    await this.session.setAccountEmail(email);
  }

  /** Best-effort final delivery. Called on page hide, never awaited by the UI. */
  async flush(): Promise<void> {
    await Promise.allSettled([this.events.flush(), this.session.flush()]);
  }

  dispose(): void {
    void this.flush();
    this.events.dispose();
    this.session.dispose();
  }
}

export { resolveGlitchContext } from './config.js';
export type { GlitchLaunchContext } from './config.js';
