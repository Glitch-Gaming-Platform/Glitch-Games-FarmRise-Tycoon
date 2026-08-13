/**
 * Engine composition.
 *
 * This is the only file that decides which systems exist and in what order they
 * are registered. Registration order is dependency order (renderer before the
 * camera that reads its viewport); frame order comes from each system's
 * priority. See the comment in engine/core/Engine.ts for why those are separate.
 */
import { Engine } from '@engine/core/Engine.js';
import { TICK_HZ, MAX_TICKS_PER_FRAME } from '@farmrise/shared';
import { RendererSystem } from '@engine/render/RendererSystem.js';
import { CameraRig } from '@engine/camera/CameraRig.js';
import { SceneManager } from '@engine/scene/SceneManager.js';
import { InputSystem } from '@engine/input/InputSystem.js';
import { AudioSystem } from '@engine/audio/AudioSystem.js';
import { DebugOverlaySystem } from '@engine/debug/DebugOverlaySystem.js';
import { resolveDebugFlags, type ReviewCameraOverride } from '@engine/debug/DebugFlags.js';
import { DEFAULT_BINDINGS, type GameAction } from '@game/GameActions.js';
import { isTouchPrimaryDevice } from '@engine/render/capabilities.js';
import { RenderPipeline } from '@engine/render/RenderPipeline.js';
import {
  qualityProfile,
  resolveQualityTier,
  type QualityTier,
} from '@engine/render/quality/QualityTier.js';
import { resolveRenderTuning } from '@engine/render/quality/RenderTuning.js';
import { GAMEPLAY_CAMERA } from '@game/rules/sessionRules.js';

export interface EngineBundle {
  readonly engine: Engine;
  readonly renderer: RendererSystem;
  readonly cameraRig: CameraRig;
  readonly sceneManager: SceneManager;
  readonly input: InputSystem<GameAction>;
  readonly audio: AudioSystem;
  readonly debugEnabled: boolean;
  readonly actionReview: boolean;
  readonly reviewCamera: ReviewCameraOverride | null;
  readonly progressionReviewStage: 2 | 3 | 4 | 5 | null;
  readonly incidentReviewId: string | null;
  readonly mobileOptimized: boolean;
  readonly quality: QualityTier;
  /** Null on the low tier - see engine/render/RenderPipeline.ts. */
  readonly pipeline: RenderPipeline | null;
}

export function createEngine(container: HTMLElement, isDev: boolean): EngineBundle {
  const search = typeof location !== 'undefined' ? location.search : '';
  const flags = resolveDebugFlags(search, isDev);
  const mobileOptimized = isTouchPrimaryDevice();
  container.dataset['mobileOptimized'] = String(mobileOptimized);

  // Tier first: it decides the renderer's construction flags, and those cannot
  // be changed after the context exists.
  const quality = resolveQualityTier({ search, touchPrimary: mobileOptimized });
  const profile = qualityProfile(quality);
  container.dataset['quality'] = quality;
  // The pipeline is only constructed on ultra. That absence, not a flag inside
  // it, is what makes the low path provably identical to the pre-pipeline one.
  const pipeline =
    quality === 'low'
      ? null
      : new RenderPipeline({ tier: quality, ...resolveRenderTuning(search) });

  // The simulation frequency comes from the shared package so the client and
  // the server cannot drift apart on what "one tick" means.
  const engine = new Engine({ fixedHz: TICK_HZ, maxSubSteps: MAX_TICKS_PER_FRAME });

  // The `low` arm of these two expressions is the pre-pipeline code verbatim.
  // Do not "simplify" it into the profile: `?quality=low` on a desktop must
  // produce the same frame as the build that existed before this pipeline, and
  // that includes the context's MSAA flag and the pixel-ratio cap.
  const renderer = new RendererSystem({
    container,
    maxPixelRatio: mobileOptimized ? 1.5 : pipeline ? profile.maxPixelRatio : 2,
    antialias: mobileOptimized ? false : pipeline ? profile.contextAntialias : undefined,
    ...(pipeline ? { pipeline } : {}),
  });
  const cameraRig = new CameraRig({ fov: GAMEPLAY_CAMERA.fovDegrees, near: 0.5, far: 400 });
  const sceneManager = new SceneManager();
  const input = new InputSystem<GameAction>({ target: container, bindings: DEFAULT_BINDINGS });
  const audio = new AudioSystem();

  engine
    .register(renderer)
    .register(cameraRig)
    .register(sceneManager)
    .register(input)
    .register(audio);

  if (flags.overlay) {
    engine.register(new DebugOverlaySystem({ container, loop: engine.loop }));
  }

  return {
    engine,
    renderer,
    cameraRig,
    sceneManager,
    input,
    audio,
    debugEnabled: flags.overlay,
    actionReview: flags.actionReview,
    reviewCamera: flags.reviewCamera,
    progressionReviewStage: isDev ? flags.progressionReviewStage : null,
    incidentReviewId: isDev ? flags.incidentReviewId : null,
    mobileOptimized,
    quality,
    pipeline,
  };
}
