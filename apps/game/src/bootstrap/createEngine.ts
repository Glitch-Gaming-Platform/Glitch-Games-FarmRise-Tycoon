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
import { resolveDebugFlags } from '@engine/debug/DebugFlags.js';
import { DEFAULT_BINDINGS, type GameAction } from '@game/GameActions.js';
import { isTouchPrimaryDevice } from '@engine/render/capabilities.js';
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
  readonly progressionReviewStage: 3 | 5 | null;
  readonly incidentReviewId: string | null;
  readonly mobileOptimized: boolean;
}

export function createEngine(container: HTMLElement, isDev: boolean): EngineBundle {
  const flags = resolveDebugFlags(typeof location !== 'undefined' ? location.search : '', isDev);
  const mobileOptimized = isTouchPrimaryDevice();
  container.dataset['mobileOptimized'] = String(mobileOptimized);

  // The simulation frequency comes from the shared package so the client and
  // the server cannot drift apart on what "one tick" means.
  const engine = new Engine({ fixedHz: TICK_HZ, maxSubSteps: MAX_TICKS_PER_FRAME });

  const renderer = new RendererSystem({
    container,
    maxPixelRatio: mobileOptimized ? 1.5 : 2,
    antialias: mobileOptimized ? false : undefined,
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
    progressionReviewStage: isDev ? flags.progressionReviewStage : null,
    incidentReviewId: isDev ? flags.incidentReviewId : null,
    mobileOptimized,
  };
}
