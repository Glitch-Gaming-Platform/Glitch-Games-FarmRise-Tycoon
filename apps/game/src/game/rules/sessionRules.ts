/**
 * Client-side session rules.
 *
 * The distinction this file exists to hold:
 *   - Rules that decide MONEY or PROGRESSION live in @farmrise/shared, because
 *     the server must run the identical code to validate them.
 *   - Rules that only shape the local session - how often we autosave, how long
 *     a toast stays up, what counts as "nearly full" storage - live here,
 *     because the server does not care and shipping them in the shared package
 *     would imply a contract that does not exist.
 *
 * If you are about to add something here that changes what the player earns or
 * owns, it belongs in @farmrise/shared/rules instead.
 */
import { secondsToTicks, type Ticks } from '@farmrise/shared';

/**
 * Gameplay camera framing.
 *
 * These numbers are ART DIRECTION, not preference - see
 * docs/decisions/0011-camera-and-tone-mapping.md. They are duplicated in
 * tools/blender/palette.py so the Blender review renders judge the same
 * framing the engine ships, and apps/game/tests/unit/cameraFraming.test.ts
 * fails if the two copies ever drift apart.
 */
export const GAMEPLAY_CAMERA = {
  /** Metres from the player. */
  distance: 20,
  /** Degrees above the horizon. 61 read as near-top-down and was wrong. */
  pitchDegrees: 38,
  /** Vertical field of view, degrees. */
  fovDegrees: 48,
} as const;

export const GAMEPLAY_CAMERA_PITCH_RADIANS = (GAMEPLAY_CAMERA.pitchDegrees * Math.PI) / 180;

/** How often the client pushes a save to the server while playing. */
export const AUTOSAVE_INTERVAL_TICKS: Ticks = secondsToTicks(30);

/** Storage fraction at which the HUD starts warning about spoilage/overflow. */
export const STORAGE_WARNING_FRACTION = 0.85;

/** How long a transient HUD message stays visible. */
export const TOAST_SECONDS = 3.5;

/** Ticks of grace after a warning before the HUD escalates its styling. */
export const WARNING_URGENT_TICKS: Ticks = secondsToTicks(10);

/**
 * Client-side prediction budget. If the server's balance differs from the
 * predicted one by more than this, the client stops predicting and snaps to the
 * server value rather than showing a number that will visibly jump later.
 */
export const MAX_PREDICTION_DRIFT_CENTS = 500;
