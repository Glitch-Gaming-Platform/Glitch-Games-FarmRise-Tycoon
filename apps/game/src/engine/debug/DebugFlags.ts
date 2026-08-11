/**
 * Debug switches, resolved once at boot from (in order of precedence):
 *   1. the URL query string, e.g. ?debug=overlay,physics
 *   2. localStorage, so a flag survives a reload
 *   3. import.meta.env.DEV
 *
 * Everything here must be safe to leave in a production build: flags default
 * off and only ever add diagnostics.
 */
export interface DebugFlags {
  readonly overlay: boolean;
  readonly physics: boolean;
  readonly wireframe: boolean;
  readonly logEvents: boolean;
  /** Starts the player beside a crop bed for deterministic action review. */
  readonly actionReview: boolean;
  /** Loads a non-persistent late-game career for progression acceptance review. */
  readonly progressionReviewStage: 3 | 5 | null;
  /** Loads one named incident through the normal career hydration path. */
  readonly incidentReviewId: string | null;
}

const INCIDENT_REVIEW_FLAGS = [
  'incident-drought',
  'incident-fox-raid',
  'incident-cart-axle',
  'incident-blocked-road',
  'incident-blight',
  'incident-processor-breakdown',
  'incident-cold-snap',
] as const;

const STORAGE_KEY = 'farmrise:debug';

export function resolveDebugFlags(
  search: string = typeof location !== 'undefined' ? location.search : '',
  isDev = false,
): DebugFlags {
  const requested = new Set<string>();

  const params = new URLSearchParams(search);
  for (const value of params.getAll('debug')) {
    for (const part of value.split(',')) if (part) requested.add(part.trim());
  }

  if (requested.size === 0) {
    try {
      const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (stored) for (const part of stored.split(',')) if (part) requested.add(part.trim());
    } catch {
      // localStorage throws in private mode on some browsers. Not worth failing boot over.
    }
  }

  const has = (flag: string) => requested.has(flag) || requested.has('all');

  return {
    overlay: has('overlay') || (isDev && requested.size === 0),
    physics: has('physics'),
    wireframe: has('wireframe'),
    logEvents: has('events'),
    actionReview: has('actions'),
    progressionReviewStage: has('estate') ? 5 : has('progression') ? 3 : null,
    incidentReviewId: INCIDENT_REVIEW_FLAGS.find((flag) => has(flag)) ?? null,
  };
}

export function persistDebugFlags(flags: readonly string[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, flags.join(','));
  } catch {
    // Ignore: persistence is a convenience, not a requirement.
  }
}
