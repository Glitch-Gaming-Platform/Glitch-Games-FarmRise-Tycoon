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
 *   cloud    Glitch Cloud Save, when a title token is present and the validated
 *            install resolves to a real Glitch user. On a Glitch launch this
 *            is the first source checked when resuming.
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

export type SaveTier = 'local' | 'account' | 'cloud';

const LOCAL_KEY = 'farmrise:save:v1';
const CLOUD_SLOT = 0;

export interface LocalSaveEnvelope {
  /**
   * Version of the *envelope*, not of the save inside it. The document's own
   * schemaVersion is what the migration chain reads, so an old career keeps
   * loading after the save format changes.
   */
  readonly schemaVersion: 1;
  readonly savedAt: number;
  readonly revision: number;
  readonly state: unknown;
}

export interface SaveDirectorEvents extends Record<string, unknown> {
  'save:written': { tiers: readonly SaveTier[]; at: number };
  'save:tier-changed': { tier: SaveTier };
  'save:error': { tier: SaveTier; reason: string };
}

export type SavedDocumentResult =
  | {
      readonly document: unknown;
      readonly careerId: string;
      readonly tier: SaveTier;
    }
  | { readonly error: string; readonly tier: SaveTier }
  | null;

export class SaveDirector implements Disposable {
  readonly events = new EventBus<SaveDirectorEvents>();
  #revision = 0;
  #lastTier: SaveTier = 'local';
  #syncing = false;
  #preparedCloudInstallId: string | null = null;
  #blockedCloudInstallId: string | null = null;

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

  /** Prevents this session from replacing a cloud document it could not safely read. */
  blockCloudWrites(): void {
    const installId = this.glitch?.installId;
    if (installId) this.#blockedCloudInstallId = installId;
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
   * authoritative revision. Then Glitch, which provides the cross-device
   * career that is checked first the next time the title launches from Glitch.
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
    if (this.#blockedCloudInstallId === installId) return false;
    if (this.#preparedCloudInstallId !== installId) {
      const records = await platform.cloudSave.list(installId);
      if (!records) {
        this.events.emit('save:error', {
          tier: 'cloud',
          reason: 'Could not read the current cloud save version.',
        });
        return false;
      }
      this.#preparedCloudInstallId = installId;
    }

    const bytes = new TextEncoder().encode(JSON.stringify(state));
    const outcome = await platform.cloudSave.store(installId, CLOUD_SLOT, bytes, {
      saveType: 'auto',
      slotName: 'FarmRise season',
      metadata: {
        balance: state.balance,
        tick: state.tick,
        stage: state.stage,
        parcels: state.sites[0]?.ownedParcelIds.length ?? 1,
      },
    });

    if (outcome.kind === 'conflict') {
      // Saving is background infrastructure, not a player decision. The game
      // loaded the cloud career before play began, so the active session is the
      // continuation to keep when its optimistic base becomes stale. Resolve
      // that captured write in place and never interrupt play with a dialog.
      const resolved = await platform.cloudSave.resolveConflict(
        installId,
        outcome.conflict,
        'use_client',
        CLOUD_SLOT,
      );
      if (resolved) return true;
      this.events.emit('save:error', {
        tier: 'cloud',
        reason: 'Cloud sync will retry later.',
      });
      return false;
    }
    if (outcome.kind === 'unavailable') {
      this.events.emit('save:error', { tier: 'cloud', reason: outcome.reason });
      return false;
    }
    return true;
  }

  // -- load --------------------------------------------------------------

  /**
   * Chooses the best save to resume.
   *
   * A validated Glitch cloud slot wins when present, because that is the
   * cross-device career the Glitch player launched. The account tier wins over
   * local otherwise; local remains the offline fallback.
   */
  async loadBest(): Promise<{ state: SaveState; tier: SaveTier } | null> {
    const document = await this.loadBestDocument();
    return document && 'document' in document
      ? { state: document.document as SaveState, tier: document.tier }
      : null;
  }

  /**
   * The best saved document, in whatever format it was written.
   *
   * Returns the raw value on purpose: deciding whether it can be upgraded is
   * the migration chain's job, and reading it as the current schema here would
   * silently discard every save written by an older build.
   */
  async loadBestDocument(): Promise<SavedDocumentResult> {
    const cloudFailure = await this.#loadFromGlitch();
    if (cloudFailure && 'document' in cloudFailure) return cloudFailure;

    if (this.auth.signedIn) {
      const remote = await this.#loadFromAccount();
      if (remote) {
        this.#revision = remote.revision;
        return {
          document: remote.state,
          careerId: this.auth.user?.id ?? 'account-career',
          tier: 'account',
        };
      }
    }
    const local = this.readLocal();
    if (local) return { document: local.state, careerId: 'local-career', tier: 'local' };
    return cloudFailure;
  }

  async #loadFromGlitch(): Promise<SavedDocumentResult> {
    const platform = this.glitch;
    const installId = platform?.installId;
    if (!platform?.canUseCloudFeatures || !installId) return null;

    const outcome = await platform.cloudSave.loadSlot(installId, CLOUD_SLOT);
    if (outcome.kind === 'empty') return null;
    if (outcome.kind === 'unavailable') {
      this.#blockedCloudInstallId = installId;
      return { error: outcome.reason, tier: 'cloud' };
    }
    this.#preparedCloudInstallId = installId;

    try {
      const document = JSON.parse(new TextDecoder().decode(outcome.rawBytes)) as unknown;
      const careerId =
        typeof document === 'object' &&
        document !== null &&
        typeof (document as { careerId?: unknown }).careerId === 'string'
          ? (document as { careerId: string }).careerId
          : `glitch-${installId}`;
      return { document, careerId, tier: 'cloud' };
    } catch {
      this.#blockedCloudInstallId = installId;
      return { error: 'The cloud save is not valid FarmRise JSON.', tier: 'cloud' };
    }
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
