/**
 * Leaderboards and achievements.
 *
 * Both go through ONE endpoint: `/installs/{install_id}/submit`, with scores
 * under `payload.scores` and stats under `payload.stats`.
 *
 * IMPORTANT: this title currently has NO leaderboard or achievement
 * definitions in the Glitch dashboard, and the integration docs are explicit
 * that api_keys must never be invented. So the key lists below are empty and
 * configuration-driven: submitting with no configured keys is a no-op that
 * costs nothing. Once a developer creates definitions in the dashboard they
 * add the exact keys to LEADERBOARD_KEYS / STAT_KEYS and submission starts
 * working with no other change.
 */
import type { GlitchClient } from './GlitchClient.js';

/**
 * Leaderboard api_keys defined in the Glitch dashboard for this title.
 *
 * EMPTY ON PURPOSE. Populate only with keys that exist in the dashboard;
 * submitting an undefined key returns 404. Suggested boards for this game,
 * to be created in the dashboard first:
 *   fastest_expansion  (sort_order: asc,  display_type: time_ms)
 *   peak_balance       (sort_order: desc, display_type: currency)
 *   crops_harvested    (sort_order: desc, display_type: score)
 */
export const LEADERBOARD_KEYS: Readonly<Record<string, string>> = Object.freeze({});

/**
 * Stat api_keys defined in the dashboard. Achievements unlock when a stat
 * crosses its threshold, so these are what drive trophies.
 *
 * EMPTY ON PURPOSE, for the same reason. Suggested stats:
 *   crops_harvested, goods_sold, buildings_built, events_prevented,
 *   seasons_completed
 */
export const STAT_KEYS: Readonly<Record<string, string>> = Object.freeze({});

export interface AchievementDefinition {
  readonly id: string;
  readonly api_key: string;
  readonly name: string;
  readonly description: string;
  readonly icon_unlocked_url: string | null;
}

export interface SubmitOutcome {
  readonly ok: boolean;
  readonly duplicate: boolean;
  readonly newlyUnlocked: readonly AchievementDefinition[];
  readonly reason: string | null;
}

const IDLE: SubmitOutcome = { ok: true, duplicate: false, newlyUnlocked: [], reason: null };

export class GlitchProgression {
  constructor(
    private readonly client: GlitchClient,
    private readonly titleId: string,
  ) {}

  /** True when any board or stat has been configured. */
  get configured(): boolean {
    return Object.keys(LEADERBOARD_KEYS).length > 0 || Object.keys(STAT_KEYS).length > 0;
  }

  /**
   * Submits one gameplay run.
   *
   * `idempotencyKey` must be unique per run. Reusing it returns 409, which is
   * treated as success for retry purposes - the run already counted.
   */
  async submitRun(
    installId: string,
    idempotencyKey: string,
    scores: Record<string, number>,
    stats: Record<string, number>,
    metadata?: Record<string, unknown>,
  ): Promise<SubmitOutcome> {
    // Only send keys that are actually defined in the dashboard.
    const safeScores = pick(scores, LEADERBOARD_KEYS);
    const safeStats = pick(stats, STAT_KEYS);
    if (Object.keys(safeScores).length === 0 && Object.keys(safeStats).length === 0) return IDLE;

    const result = await this.client.post<{
      status?: string;
      player_feedback?: { newly_unlocked?: AchievementDefinition[] };
    }>(`/titles/${this.titleId}/installs/${installId}/submit`, {
      idempotency_key: idempotencyKey,
      payload: {
        ...(Object.keys(safeScores).length ? { scores: safeScores } : {}),
        ...(Object.keys(safeStats).length ? { stats: safeStats } : {}),
        ...(metadata ? { metadata } : {}),
      },
      platform: 'web',
    });

    if (result.status === 409) {
      return { ok: true, duplicate: true, newlyUnlocked: [], reason: null };
    }
    if (!result.ok) {
      return { ok: false, duplicate: false, newlyUnlocked: [], reason: result.error };
    }
    return {
      ok: true,
      duplicate: false,
      newlyUnlocked: result.data?.player_feedback?.newly_unlocked ?? [],
      reason: null,
    };
  }

  async playerAchievements(installId: string): Promise<unknown[] | null> {
    const result = await this.client.get<{ data?: unknown[] }>(
      `/titles/${this.titleId}/installs/${installId}/achievements`,
    );
    return result.ok ? (result.data?.data ?? []) : null;
  }
}

/** Keeps only entries whose key is a configured dashboard api_key. */
function pick(
  values: Record<string, number>,
  allowed: Readonly<Record<string, string>>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, value] of Object.entries(values)) {
    const key = allowed[name];
    if (key && Number.isFinite(value)) out[key] = value;
  }
  return out;
}
