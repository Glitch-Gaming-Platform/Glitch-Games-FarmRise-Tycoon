/**
 * Decides where a player's progress lives.
 *
 * Three tiers, in increasing order of durability. A player always gets the
 * highest tier available to them, and the lower tiers keep working
 * underneath - so signing in upgrades storage without ever being required,
 * and signing out downgrades without losing the run.
 *
 *   local    Browser localStorage. Everyone, immediately, no account, no
 *            network. This is what makes "jump straight in and play" true.
 *   account  Our own Next.js backend, server-authoritative with optimistic
 *            concurrency. Unlocked by creating an account with an email and
 *            password. Survives clearing the browser and moves between devices.
 *   cloud    Glitch Cloud Save, additionally, when a Glitch title token is
 *            present AND Glitch resolved a real user from the account email.
 *
 * The local tier is never skipped. Even a signed-in player writes locally
 * first, because a save that only exists on a server is a save that is gone
 * the moment the network is.
 */
import type { SaveState } from '@farmrise/shared';
import { EventBus } from '@engine/core/EventBus.js';
import type { Disposable } from '@engine/core/types.js';
import type { AuthClient } from '@net/AuthClient.js';
import type { GameApi } from '@net/GameApi.js';
import type { GlitchPlatform } from '../glitch/GlitchPlatform.js';
import type { CloudSaveConflict } from '../glitch/GlitchCloudSave.js';

export type SaveTier = 'local' | 'account' | 'cloud';

const LOCAL_KEY = 'farmrise:save:v1';
const CLOUD_SLOT = 0;

export interface LocalSaveEnvelope {
  readonly schemaVersion: 1;
  readonly savedAt: number;
  readonly revision: number;
  readonly state: SaveState;
}

export interface SaveDirectorEvents extends Record<string, unknown> {
  'save:written': { tiers: readonly SaveTier[]; at: number };
  'save:tier-changed': { tier: SaveTier };
  'save:conflict': { conflict: CloudSaveConflict };
  'save:error': { tier: SaveTier; reason: string };
}

export class SaveDirector implements Disposable {
  readonly events = new EventBus<SaveDirectorEvents>();
  #revision = 0;
  #lastTier: SaveTier = 'local';
  #syncing = false;

  constructor(
    private readonly auth: AuthClient,
    private readonly api: GameApi,
    private readonly glitch: GlitchPlatform | null,
  ) {}

  /** The best tier currently available to this player. */
  get tier(): SaveTier {
    if (this.glitch?.canUseCloudFeatures) return 'cloud';
    if (this.auth.signedIn) return 'account';
    return 'local';
  }

  get revision(): number {
    return this.#revision;
  }

  // -- local -------------------------------------------------------------

  /**
   * Writes locally. Synchronous, never fails loudly, always runs.
   *
   * Called on every autosave regardless of tier, because it is the only
   * storage guaranteed to be there.
   */
  writeLocal(state: SaveState): boolean {
    try {
      const envelope: LocalSaveEnvelope = {
        schemaVersion: 1,
        savedAt: Date.now(),
        revision: this.#revision,
        state,
      };
      globalThis.localStorage?.setItem(LOCAL_KEY, JSON.stringify(envelope));
      return true;
    } catch (error) {
      // Quota exceeded or private mode. The run continues in memory.
      this.events.emit('save:error', {
        tier: 'local',
        reason: error instanceof Error ? error.message : 'Local storage unavailable.',
      });
      return false;
    }
  }

  readLocal(): LocalSaveEnvelope | null {
    try {
      const raw = globalThis.localStorage?.getItem(LOCAL_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as LocalSaveEnvelope;
      if (parsed?.schemaVersion !== 1 || !parsed.state) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  clearLocal(): void {
    try {
      globalThis.localStorage?.removeItem(LOCAL_KEY);
    } catch {
      /* nothing to clear */
    }
  }

  // -- sync --------------------------------------------------------------

  /**
   * Writes to every tier available.
   *
   * Local first and always. Then the account backend, which owns the
   * authoritative revision. Then Glitch, which is additive telemetry-grade
   * durability rather than the source of truth.
   */
  async save(state: SaveState): Promise<readonly SaveTier[]> {
    const written: SaveTier[] = [];
    if (this.writeLocal(state)) written.push('local');

    if (this.#syncing) return written;
    this.#syncing = true;
    try {
      if (this.auth.signedIn) {
        const ok = await this.#saveToAccount(state);
        if (ok) written.push('account');
      }
      if (this.glitch?.canUseCloudFeatures) {
        const ok = await this.#saveToGlitch(state);
        if (ok) written.push('cloud');
      }
    } finally {
      this.#syncing = false;
    }

    this.events.emit('save:written', { tiers: written, at: Date.now() });
    this.#announceTier();
    return written;
  }

  async #saveToAccount(state: SaveState): Promise<boolean> {
    try {
      const envelope = await this.api.putSave(this.#revision, state);
      this.#revision = envelope.revision;
      return true;
    } catch (error) {
      const status = (error as { code?: string }).code;
      if (status === 'STALE_WRITE') {
        // Another device wrote first. Reload rather than clobber; the player
        // keeps playing locally in the meantime.
        const remote = await this.#loadFromAccount();
        if (remote) this.#revision = remote.revision;
        this.events.emit('save:error', {
          tier: 'account',
          reason: 'Your progress was updated on another device.',
        });
        return false;
      }
      this.events.emit('save:error', { tier: 'account', reason: 'Could not reach your account.' });
      return false;
    }
  }

  async #saveToGlitch(state: SaveState): Promise<boolean> {
    const platform = this.glitch;
    const installId = platform?.installId;
    if (!platform || !installId) return false;

    const bytes = new TextEncoder().encode(JSON.stringify(state));
    const outcome = await platform.cloudSave.store(installId, CLOUD_SLOT, bytes, {
      saveType: 'auto',
      slotName: 'FarmRise season',
      metadata: { balance: state.balance, tick: state.tick, parcels: state.landParcels },
    });

    if (outcome.kind === 'conflict') {
      // Never silently overwrite. Surface it and let the player choose.
      this.events.emit('save:conflict', { conflict: outcome.conflict });
      return false;
    }
    if (outcome.kind === 'unavailable') {
      this.events.emit('save:error', { tier: 'cloud', reason: outcome.reason });
      return false;
    }
    return true;
  }

  /** Applies a player's answer to a cloud-save conflict. */
  async resolveCloudConflict(
    conflict: CloudSaveConflict,
    choice: 'keep_server' | 'use_client',
  ): Promise<boolean> {
    const platform = this.glitch;
    const installId = platform?.installId;
    if (!platform || !installId) return false;
    const record = await platform.cloudSave.resolve(
      installId,
      conflict.save_id,
      conflict.conflict_id,
      choice,
      CLOUD_SLOT,
    );
    return record !== null;
  }

  // -- load --------------------------------------------------------------

  /**
   * Chooses the best save to resume.
   *
   * The account tier wins over local when signed in, because it is the
   * authoritative one and the reason a player made an account. Local wins
   * when there is nothing else, which is the common case.
   */
  async loadBest(): Promise<{ state: SaveState; tier: SaveTier } | null> {
    if (this.auth.signedIn) {
      const remote = await this.#loadFromAccount();
      if (remote) {
        this.#revision = remote.revision;
        return { state: remote.state, tier: 'account' };
      }
    }
    const local = this.readLocal();
    return local ? { state: local.state, tier: 'local' } : null;
  }

  async #loadFromAccount(): Promise<{ state: SaveState; revision: number } | null> {
    try {
      const envelope = await this.api.loadSave();
      return { state: envelope.state, revision: envelope.revision };
    } catch {
      return null;
    }
  }

  #announceTier(): void {
    const tier = this.tier;
    if (tier === this.#lastTier) return;
    this.#lastTier = tier;
    this.events.emit('save:tier-changed', { tier });
  }

  dispose(): void {
    this.events.clear();
  }
}
