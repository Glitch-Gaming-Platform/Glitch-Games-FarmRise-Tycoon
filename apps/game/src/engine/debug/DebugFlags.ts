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
  /**
   * Frames the camera on the character for animation review.
   *
   * A locomotion or work-pose defect is a few dozen pixels tall at the
   * shipping 13.25 m camera, which is why two consecutive animation audits
   * were argued from screenshots that could not have shown the fault either
   * way. This flag implies the action-review fixture (no tutorial card over
   * the actor, no random incidents stealing the interaction) and pulls the
   * follow camera in to a character close-up. It changes nothing else: the
   * same views, the same rig and the same clips run.
   */
  readonly actorReview: boolean;
  /** Explicit follow-camera override, `?cam=distance,pitchDeg,yawDeg,targetY`. */
  readonly reviewCamera: ReviewCameraOverride | null;
  /** Loads a non-persistent late-game career for progression acceptance review. */
  readonly progressionReviewStage: 2 | 3 | 4 | 5 | null;
  /** Loads one named incident through the normal career hydration path. */
  readonly incidentReviewId: string | null;
}

export interface ReviewCameraOverride {
  readonly distance: number;
  readonly pitchDegrees: number;
  readonly yawDegrees: number;
  /** Height of the look-at point above the player's feet, in metres. */
  readonly targetY: number;
  /**
   * When false the camera holds the spawn point instead of following.
   *
   * A following camera cannot show foot slip: the character stays in the
   * middle of the frame and the ground slides past, which is exactly the
   * ambiguity being tested. Pinning the camera puts a fixed ground feature in
   * shot and lets the character walk across it.
   */
  readonly follow: boolean;
}

/** Character close-up: waist-height look-at, low pitch, one body length back. */
const ACTOR_REVIEW_CAMERA: ReviewCameraOverride = {
  distance: 4.4,
  pitchDegrees: 12,
  yawDegrees: -42,
  targetY: 0.85,
  follow: true,
};

function parseReviewCamera(
  params: URLSearchParams,
  fallback: ReviewCameraOverride | null,
): ReviewCameraOverride | null {
  const raw = params.get('cam');
  if (!raw) return fallback;
  const parts = raw.split(',').map((part) => Number(part.trim()));
  if (parts.length < 3 || parts.some((value) => !Number.isFinite(value))) return fallback;
  return {
    distance: parts[0]!,
    pitchDegrees: parts[1]!,
    yawDegrees: parts[2]!,
    targetY: Number.isFinite(parts[3]) ? parts[3]! : ACTOR_REVIEW_CAMERA.targetY,
    follow: parts[4] !== 0,
  };
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
  const actorReview = has('actor');

  return {
    overlay: has('overlay') || (isDev && requested.size === 0),
    physics: has('physics'),
    wireframe: has('wireframe'),
    logEvents: has('events'),
    actionReview: has('actions') || actorReview,
    actorReview,
    reviewCamera: parseReviewCamera(params, actorReview ? ACTOR_REVIEW_CAMERA : null),
    progressionReviewStage: has('estate')
      ? 5
      : has('regional')
        ? 4
        : has('progression')
          ? 3
          : has('licensed')
            ? 2
            : null,
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
