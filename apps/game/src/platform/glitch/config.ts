/**
 * Glitch is OPTIONAL. Everything in this folder degrades to a no-op.
 *
 * The game must be fully playable on a plain website with no Glitch account,
 * no title token and no network. So the rule throughout this layer is: if the
 * title token is absent, or a call fails, the player never finds out. Glitch
 * adds telemetry, cloud saves and progression on top of a game that already
 * works without them.
 *
 * Token discipline (from the Glitch integration docs):
 *   TITLE token   - the ONLY credential that may reach a browser. Runtime
 *                   installs, validation, cloud saves, progression, events.
 *   DEPLOY token  - build uploads. CI/developer machine only.
 *   HOSTING token - website publishing. CI/developer machine only.
 *   MCP token     - local MCP client only.
 * Only the title token is read here, and only from build-time env.
 */

export const GLITCH_API_BASE_URL = 'https://api.glitch.fun/api';

export interface GlitchLaunchContext {
  /** Glitch title UUID. */
  readonly titleId: string;
  /** Runtime title token. The only Glitch credential allowed in a client. */
  readonly titleToken: string;
  /**
   * Glitch install UUID supplied by the Desktop App via query string.
   * When present it is authoritative and no install needs creating.
   */
  readonly installId: string | null;
  /** The game's own stable local id, supplied by the Desktop App if it knows one. */
  readonly userInstallId: string | null;
  /** Session id supplied by the Desktop App for retention grouping. */
  readonly sessionId: string | null;
  readonly gameVersion: string;
  readonly buildType: 'production' | 'demo' | 'playtest';
}

const QUERY_KEYS = ['title_id', 'game_id', 'install_id', 'user_install_id', 'session_id'] as const;

function readQuery(): Partial<Record<(typeof QUERY_KEYS)[number], string>> {
  if (typeof location === 'undefined') return {};
  const params = new URLSearchParams(location.search);
  const out: Partial<Record<(typeof QUERY_KEYS)[number], string>> = {};
  for (const key of QUERY_KEYS) {
    const value = params.get(key);
    if (value) out[key] = value;
  }
  return out;
}

function env(name: string): string | undefined {
  // Vite inlines import.meta.env at build time. Reading it defensively keeps
  // this module importable from Node tests where import.meta.env is absent.
  const source = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return source?.[name];
}

/**
 * Resolves the launch context, or null when Glitch is not configured.
 *
 * Returning null is the normal case for the plain-website build, and every
 * caller in this layer treats null as "do nothing".
 */
export function resolveGlitchContext(): GlitchLaunchContext | null {
  const query = readQuery();
  const titleId = query.title_id ?? env('VITE_GLITCH_TITLE_ID') ?? '';
  const titleToken = env('VITE_GLITCH_TITLE_TOKEN') ?? '';

  if (!titleId || !titleToken) return null;

  const buildType = (env('VITE_GLITCH_BUILD_TYPE') ?? 'production') as
    'production' | 'demo' | 'playtest';

  return {
    titleId,
    titleToken,
    installId: query.install_id ?? null,
    userInstallId: query.user_install_id ?? null,
    sessionId: query.session_id ?? null,
    gameVersion: env('VITE_APP_VERSION') ?? '0.1.0',
    buildType: ['production', 'demo', 'playtest'].includes(buildType) ? buildType : 'production',
  };
}

export const STORAGE_KEYS = {
  /** Our own stable local id. Created once, reused forever. */
  userInstallId: 'farmrise:glitch:user_install_id',
  /** The Glitch install UUID returned by createInstall. */
  installId: 'farmrise:glitch:install_id',
  /** Last known cloud-save version per slot, for optimistic concurrency. */
  saveVersions: 'farmrise:glitch:save_versions',
} as const;

/**
 * Loads or creates the stable local install id.
 *
 * The single most common Glitch integration bug is generating a new
 * user_install_id every launch, which turns one returning player into a
 * hundred separate installs and destroys retention reporting. Created once,
 * persisted, reused.
 */
export function loadOrCreateUserInstallId(supplied?: string | null): string {
  if (supplied) return supplied;
  try {
    const existing = globalThis.localStorage?.getItem(STORAGE_KEYS.userInstallId);
    if (existing) return existing;
  } catch {
    /* private mode - fall through to an ephemeral id */
  }
  const created =
    globalThis.crypto?.randomUUID?.() ??
    `ui_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEYS.userInstallId, created);
  } catch {
    /* ephemeral for this session only */
  }
  return created;
}
