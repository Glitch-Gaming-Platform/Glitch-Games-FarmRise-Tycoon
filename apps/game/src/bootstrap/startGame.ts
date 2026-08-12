/**
 * The application composition root.
 *
 * Everything the game is made of is constructed here and nowhere else. Modules
 * receive their dependencies as arguments and never reach for a global, which
 * is what keeps them individually testable and stops a "GameManager" singleton
 * forming (see docs/AI_INSTRUCTIONS.md, "Files that must not become monolithic").
 */
import type { Unsubscribe } from '@engine/core/types.js';
import { WebGLUnavailableError } from '@engine/render/capabilities.js';
import { FarmScene, FARM_SCENE_ID } from '@game/scenes/FarmScene.js';
import { GameStateMachine } from '@game/states/GameStateMachine.js';
import { GameStateSystem } from '@game/systems/GameStateSystem.js';
import {
  BootState,
  LoadingState,
  MenuState,
  PausedState,
  PlayingState,
} from '@game/states/phases.js';
import { AssetLoader } from '@assets/loaders/AssetLoader.js';
import { CORE_MANIFEST, LOW_CORE_MANIFEST } from '@assets/manifests/core.manifest.js';
import { UiRoot } from '@ui/UiRoot.js';
import { loadSettings } from '@ui/settings/SettingsPanel.js';
import { createEngine } from './createEngine.js';
import { createNetworking } from './createNetworking.js';
import { bindHud } from './bindHud.js';
import { bindSession } from './bindSession.js';
import { bindAnalytics } from './bindAnalytics.js';
import type { CareerSaveState } from '@farmrise/shared';
import { OutcomeState } from '@game/states/phases.js';
import { SaveDirector } from '@platform/save/SaveDirector.js';
import { AutosaveController } from '@platform/save/AutosaveController.js';
import { loadCareer } from '@platform/save/CareerLoader.js';
import { bindSceneAudio, bindStateAudio, prepareAudio } from './bindAudio.js';
import { SOUND, type SoundId } from '@assets/audio/soundIds.js';
import { DEFAULT_MUSIC_ID } from '@assets/audio/musicIds.js';
import { bindMobileLifecycle } from './bindMobileLifecycle.js';
import { createProgressionReviewCareer } from '@game/debug/progressionReview.js';
import { createIncidentReviewCareer } from '@game/debug/incidentReview.js';
import { bindRuntimeAnalytics } from './bindRuntimeAnalytics.js';
import { createAnalyticsRuntime } from './createAnalytics.js';

export interface StartGameOptions {
  readonly container: HTMLElement;
  readonly isDev?: boolean;
  readonly isProduction?: boolean;
  readonly apiBaseUrl?: string;
}

export interface RunningGame {
  stop(): void;
}

export async function startGame(options: StartGameOptions): Promise<RunningGame> {
  const { container } = options;
  const isDev = options.isDev ?? false;
  const isProduction = options.isProduction ?? !isDev;
  const bundle = createEngine(container, isDev);
  const net = createNetworking(options.apiBaseUrl ?? '');
  // One loader for the whole session, so a scene reload re-uses the meshes
  // already in memory instead of re-fetching them.
  const assets = new AssetLoader(
    bundle.quality === 'low' ? LOW_CORE_MANIFEST : CORE_MANIFEST,
    import.meta.env.BASE_URL ?? '/',
  );
  const machine = new GameStateMachine();
  const settings = loadSettings();
  const preparedAudio = prepareAudio(bundle.audio, assets, {
    lowMemoryMusic: bundle.mobileOptimized,
    initialMusicTrack: DEFAULT_MUSIC_ID,
    disabledMusicTracks: settings.disabledMusicTracks,
  });
  const unbindStateAudio = bindStateAudio(machine, bundle.audio);

  let activeScene: FarmScene | null = null;
  let unbindHud: Unsubscribe | null = null;
  let unbindSceneAudio: Unsubscribe | null = null;
  let unbindSession: Unsubscribe | null = null;
  let autosave: AutosaveController | null = null;
  /**
   * The career to resume, chosen before any scene is built.
   *
   * Null means "start a new one", and that is the only path that hands out the
   * starter livestock - which is why the decision cannot be made inside the
   * scene (docs/PROGRESSION_GAMEPLAY_PLAN.md §32.1).
   */
  let resumeState: CareerSaveState | null = null;
  let unbindAnalytics: Unsubscribe | null = null;
  let unbindMobileLifecycle: Unsubscribe = () => {};
  const incidentReview = bundle.incidentReviewId
    ? createIncidentReviewCareer(bundle.incidentReviewId)
    : null;

  const telemetry = createAnalyticsRuntime({ isDev, isProduction });
  const { analytics, glitch } = telemetry;
  const saves = new SaveDirector(net.auth, net.api, glitch);
  let unbindRuntimeAnalytics: Unsubscribe = () => {};
  let accountBusy = false;
  let accountError: string | null = null;

  const playUi = (id: SoundId, volume = 0.75): void => {
    bundle.audio.play(id, { bus: 'ui', volume, detuneJitter: 12 });
  };

  const refreshAccount = (): void => {
    const glitchIdentity = glitch?.identity ?? null;
    ui.account.update({
      provider: glitchIdentity ? 'glitch' : net.auth.signedIn ? 'farmrise' : null,
      email: glitchIdentity ? null : (net.auth.user?.email ?? null),
      displayName: glitchIdentity?.displayName ?? net.auth.user?.displayName ?? null,
      busy: accountBusy,
      error: accountError,
    });
  };

  /**
   * Runs an account action, keeping the panel honest about progress and
   * failure, and re-linking Glitch afterwards so cloud features follow the
   * signed-in identity.
   */
  const runAccountAction = async (
    actionName: 'register' | 'login' | 'logout',
    action: () => Promise<void>,
  ): Promise<void> => {
    accountBusy = true;
    accountError = null;
    analytics.track('account_action', { action: actionName, outcome: 'started' });
    refreshAccount();
    try {
      await action();
      await telemetry.setAccountEmail(net.auth.user?.email ?? null);
      analytics.track('account_action', { action: actionName, outcome: 'succeeded' });
    } catch (error) {
      analytics.track('account_action', { action: actionName, outcome: 'failed' });
      accountError =
        error instanceof Error && error.message
          ? error.message
          : 'That did not work. Please check your details and try again.';
    } finally {
      accountBusy = false;
      refreshAccount();
    }
  };

  const ui = new UiRoot({
    container,
    shortcuts: {
      onMarket: () => activeScene?.session?.togglePanel('market'),
      onBuild: () => activeScene?.session?.togglePanel('build'),
      onCareer: () => activeScene?.session?.togglePanel('career'),
      onTown: () => activeScene?.session?.togglePanel('town'),
    },
    menu: {
      onPlay: () => {
        playUi(SOUND.uiConfirm);
        machine.transitionTo('loading', 'menu-play');
      },
      onSettings: () => {
        playUi(SOUND.uiOpen, 0.7);
        analytics.track('panel_viewed', { panel: 'settings', action: 'opened' });
        ui.openSettings('menu');
      },
      onAccount: () => {
        playUi(SOUND.uiOpen, 0.7);
        analytics.track('panel_viewed', { panel: 'account', action: 'opened' });
        refreshAccount();
        ui.account.setVisible(true);
      },
    },
    pause: {
      onResume: () => machine.transitionTo('playing', 'ui-resume'),
      onSettings: () => {
        playUi(SOUND.uiOpen, 0.7);
        analytics.track('panel_viewed', { panel: 'settings', action: 'opened' });
        ui.openSettings('pause');
      },
      onAccount: () => {
        playUi(SOUND.uiOpen, 0.7);
        analytics.track('panel_viewed', { panel: 'account', action: 'opened' });
        refreshAccount();
        ui.account.setVisible(true);
      },
      onQuit: () => machine.transitionTo('menu', 'ui-quit'),
    },
    market: {
      onSellSpot: (itemId, quantity) => activeScene?.session?.sell(itemId, quantity),
      // One button for two intents: an id from the board is an offer to take,
      // anything else is a promise already made and now being delivered.
      onFulfil: (orderId, action) => {
        const session = activeScene?.session;
        if (!session) return;
        if (action === 'accept') {
          session.accept(orderId);
          return;
        }
        const contract = activeScene?.career?.contracts.find((entry) => entry.id === orderId);
        if (contract) {
          const outstanding = contract.quantity - contract.delivered;
          const held = activeScene?.career?.world.stores.totalOf(contract.itemId) ?? 0;
          session.deliver(orderId, Math.min(held, outstanding));
        }
      },
      onClose: () => activeScene?.session?.openPanel('none'),
    },
    build: {
      onSelectBuilding: (kind) => activeScene?.session?.chooseBuilding(kind),
      onBuyAnimal: (species) => activeScene?.session?.purchaseAnimal(species),
      onBuyLand: (parcelId) => activeScene?.session?.purchaseLand(parcelId),
      onBuyCarrier: (kind) => activeScene?.session?.purchaseCarrier(kind),
      onClose: () => activeScene?.session?.openPanel('none'),
    },
    career: {
      onClaimMilestone: (milestoneId) => activeScene?.session?.claimMilestone(milestoneId),
      onChooseSpecialization: (id) => activeScene?.session?.specialize(id),
      onQueueProcessing: (buildingId, recipeId) =>
        activeScene?.session?.queueBatch(buildingId, recipeId),
      onHireWorker: (role) => activeScene?.session?.employ(role),
      onTakeLoan: (offerId) => activeScene?.session?.takeLoan(offerId),
      onRepayLoan: (loanId, amount) => activeScene?.session?.repayLoan(loanId, amount),
      onBuyInsurance: (policyId) => activeScene?.session?.insure(policyId),
      onCancelInsurance: () => activeScene?.session?.cancelPolicy(),
      onClose: () => activeScene?.session?.openPanel('none'),
    },
    town: {
      onStartProject: (projectId) => activeScene?.session?.fundTownProject(projectId),
      onClose: () => activeScene?.session?.openPanel('none'),
    },
    account: {
      onRegister: (email, displayName, password) =>
        void runAccountAction('register', async () => {
          await net.auth.register({ email, displayName, password });
          // Push the current run straight up so the account is immediately
          // worth having.
          const state = activeScene?.saveState();
          if (state) await saves.save(state);
        }),
      onLogin: (email, password) =>
        void runAccountAction('login', async () => {
          await net.auth.login({ email, password });
          const restored = await loadCareer(saves);
          if (restored.kind === 'resume' && restored.tier === 'account') {
            resumeState = restored.state;
            ui.hud.toast('Signed in. Your farm is ready from the menu.');
          }
        }),
      onLogout: () =>
        void runAccountAction('logout', async () => {
          await net.auth.logout();
        }),
      onClose: () => {
        playUi(SOUND.uiClick, 0.6);
        analytics.track('panel_viewed', { panel: 'account', action: 'closed' });
        ui.account.setVisible(false);
      },
    },
    outcome: {
      onPlayAgain: () => {
        playUi(SOUND.uiConfirm);
        machine.transitionTo('playing', 'season-continue');
      },
      onBackToMenu: () => {
        playUi(SOUND.uiClick, 0.6);
        machine.transitionTo('menu', 'outcome-menu');
      },
    },
    settings: {
      onVolumeChange: (bus, value) => {
        bundle.audio.setVolume(bus, value);
        analytics.track('setting_changed', {
          setting: `volume_${bus}`,
          value: Math.round(value * 100),
        });
      },
      onMusicTrackChange: (trackId) => {
        preparedAudio.music.select(trackId);
        analytics.track('setting_changed', { setting: 'music_track', value: trackId });
      },
      onMusicTrackEnabledChange: (trackId, enabled) => {
        preparedAudio.music.setEnabled(trackId, enabled);
        analytics.track('setting_changed', {
          setting: `music_track_${trackId}`,
          value: enabled,
        });
      },
      onQualityChange: (quality) =>
        analytics.track('setting_changed', { setting: 'graphics_quality', value: quality }),
      onDebugToggle: (enabled) => {
        playUi(SOUND.uiClick, 0.55);
        analytics.track('setting_changed', { setting: 'performance_overlay', value: enabled });
        /* Overlay visibility is resolved at boot; the toggle persists for next launch. */
      },
      ...(telemetry.privacy ? { onPrivacy: () => ui.openPrivacyPreferences() } : {}),
      onClose: () => {
        playUi(SOUND.uiClick, 0.6);
        analytics.track('panel_viewed', { panel: 'settings', action: 'closed' });
        ui.closeSettings();
      },
    },
    ...(bundle.mobileOptimized
      ? {
          touchControls: {
            setAction: (action, down) => bundle.input.setActionState(action, down),
            setActionValue: (action, value) => bundle.input.setActionValue(action, value),
          },
        }
      : {}),
    ...(telemetry.privacy ? { privacy: telemetry.privacy } : {}),
  });

  ui.settings.setMusicTrack(preparedAudio.music.selectedTrack);
  const unbindMusicSettings = preparedAudio.music.events.on('music:track-changed', ({ trackId }) =>
    ui.settings.setMusicTrack(trackId),
  );

  // Apply persisted audio preferences before anything can play a sound.
  bundle.audio.setVolume('master', settings.master);
  bundle.audio.setVolume('music', settings.music);
  bundle.audio.setVolume('sfx', settings.sfx);

  bundle.sceneManager.register(FARM_SCENE_ID, () => {
    activeScene = new FarmScene({
      seed: net.auth.user?.id ?? 'local-session',
      assets,
      // Resuming, when there is something to resume. Decided before the scene
      // is constructed so that starter grants only happen for a new career.
      ...(resumeState ? { career: resumeState } : {}),
      // A resumed career has already passed through its first-session teaching.
      ...(bundle.actionReview
        ? { skipOnboarding: false }
        : resumeState
          ? { skipOnboarding: resumeState.onboardingCompleted }
          : {}),
      ...(bundle.actionReview ? { reviewActions: true } : {}),
      ...(bundle.reviewCamera ? { reviewCamera: bundle.reviewCamera } : {}),
      ...(incidentReview ? { reviewSpawnTile: incidentReview.spawnTile } : {}),
      ...(bundle.mobileOptimized ? { shadowMapSize: 512 } : {}),
      // Null on the low tier; the scene and its views then take exactly the
      // branches they took before the pipeline existed.
      ...(bundle.pipeline ? { pipeline: bundle.pipeline } : {}),
    });
    return activeScene;
  });

  bundle.sceneManager.events.on('scene:load-progress', ({ fraction, label }) =>
    ui.loading.setProgress(fraction, label),
  );
  bundle.sceneManager.events.on('scene:activated', () => {
    unbindHud?.();
    unbindSceneAudio?.();
    unbindSession?.();
    unbindAnalytics?.();

    const scene = activeScene;
    const session = scene?.session ?? null;
    if (!scene || !session) return;

    analytics.track('scene_ready', {
      loadMs: analytics.elapsedMs(),
      artLoaded: scene.hasAuthoredArt,
    });

    unbindHud = bindHud(scene, ui.hud, session);
    unbindSceneAudio = bindSceneAudio(scene, bundle.audio);
    unbindAnalytics = bindAnalytics(scene, session, analytics);
    unbindSession = bindSession(scene, session, ui, bundle.audio, () =>
      machine.transitionTo('outcome', 'run-finished'),
    ).unsubscribe;

    // Autosave on a wall clock rather than on a money event, plus immediate
    // checkpoints after the decisions a player would hate to repeat.
    const career = scene.career;
    autosave?.dispose();
    autosave = null;
    if (bundle.progressionReviewStage !== null || incidentReview) return;
    autosave = new AutosaveController(saves, () => scene.saveState());
    autosave.watch((onChange) => career!.events.on('career:balance-changed', onChange));
    autosave.watch((onChange) => career!.world.events.on('world:plot-changed', onChange));
    autosave.watch((onChange) => career!.world.events.on('world:carry-changed', onChange));
    autosave.watch((onChange) => career!.world.events.on('world:building-placed', onChange));
    autosave.watch((onChange) => session.onboarding.events.on('onboarding:complete', onChange));
    const checkpoint = (): void => {
      autosave?.markDirty();
      void autosave?.save();
    };
    autosave.watch((onChange) => {
      void onChange;
      return career!.world.events.on('world:parcel-acquired', checkpoint);
    });
    autosave.watch((onChange) => {
      void onChange;
      return career!.events.on('career:stage-changed', checkpoint);
    });
    autosave.watch((onChange) => {
      void onChange;
      return career!.events.on('career:restructured', checkpoint);
    });
    autosave.start();
  });
  bundle.sceneManager.events.on('scene:load-error', ({ error }) => {
    console.error('[startGame] scene failed to load', error);
    analytics.track('runtime_error', { area: 'scene', code: 'load_failed' });
    playUi(SOUND.uiDeny, 0.8);
    ui.hud.toast('The farm failed to load. Returning to the menu.', 'error');
  });

  const deps = {
    sceneManager: bundle.sceneManager,
    farmSceneId: FARM_SCENE_ID,
    showScreen: (screen: 'none' | 'menu' | 'loading' | 'pause' | 'outcome') => ui.show(screen),
    setSimulationRunning: (running: boolean) => activeScene?.setRunning(running),
  };

  machine
    .register(new BootState(deps))
    .register(new MenuState(deps))
    .register(new LoadingState(deps))
    .register(new PlayingState(deps))
    .register(new PausedState(deps))
    .register(new OutcomeState(deps));

  bundle.engine.register(
    new GameStateSystem(machine, bundle.input, () => {
      const session = activeScene?.session;
      return !session || (session.panel === 'none' && !session.placement.active);
    }),
  );

  unbindRuntimeAnalytics = bindRuntimeAnalytics({
    analytics,
    machine,
    saves,
    engine: bundle.engine,
    renderer: bundle.renderer,
    quality: bundle.quality,
  });

  try {
    await bundle.engine.start();
    unbindMobileLifecycle = bindMobileLifecycle({
      enabled: bundle.mobileOptimized,
      loop: bundle.engine.loop,
      input: bundle.input,
      audio: bundle.audio,
    });
  } catch (error) {
    ui.dispose();
    if (error instanceof WebGLUnavailableError) renderFatal(container, error.message);
    else renderFatal(container, 'FarmRise Tycoon failed to start. Check the console for details.');
    throw error;
  }

  await telemetry.activate(net.auth.user?.email ?? null, () => machine.current === 'playing');

  // Best-effort final delivery of events and the last heartbeat.
  const onHide = (): void => {
    autosave?.flushLocal();
    telemetry.end('unload');
    telemetry.flush();
  };
  globalThis.addEventListener?.('pagehide', onHide);

  // Decide what we are resuming before the player can press Work the farm.
  // A save that cannot be read is surfaced as a choice, never overwritten:
  // silently replacing a career is indistinguishable from deleting it.
  const restored = await loadCareer(saves);
  if (bundle.progressionReviewStage !== null) {
    resumeState = createProgressionReviewCareer(bundle.progressionReviewStage);
    ui.hud.toast('Progression review career loaded. Saving is disabled.', 'warn');
  } else if (incidentReview) {
    resumeState = incidentReview.state;
    ui.hud.toast('Incident review career loaded. Saving is disabled.', 'warn');
  } else if (restored.kind === 'resume') {
    resumeState = restored.state;
    if (restored.tier === 'cloud') saves.writeLocal(restored.state);
  } else if (restored.kind === 'unreadable') {
    console.warn('[startGame] persisted career could not be restored', restored.reason);
  }

  await machine.begin('boot');

  return {
    stop(): void {
      telemetry.end('manual');
      telemetry.flush();
      unbindHud?.();
      unbindSceneAudio?.();
      unbindSession?.();
      unbindAnalytics?.();
      unbindRuntimeAnalytics();
      autosave?.dispose();
      unbindStateAudio();
      unbindMusicSettings();
      unbindMobileLifecycle();
      preparedAudio.dispose();
      globalThis.removeEventListener?.('pagehide', onHide);
      ui.dispose();
      bundle.engine.dispose();
      telemetry.dispose();
      saves.dispose();
      assets.dispose();
    },
  };
}

/** Last-resort message for a browser that cannot run the game at all. */
function renderFatal(container: HTMLElement, message: string): void {
  const panel = document.createElement('div');
  panel.setAttribute('role', 'alert');
  Object.assign(panel.style, {
    position: 'absolute',
    inset: '0',
    display: 'grid',
    placeItems: 'center',
    padding: '24px',
    textAlign: 'center',
    font: '16px/1.6 ui-sans-serif, system-ui, sans-serif',
    color: '#eaf5ea',
    background: '#0b1014',
  } satisfies Partial<CSSStyleDeclaration>);
  panel.textContent = message;
  container.appendChild(panel);
}
