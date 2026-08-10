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
import { CORE_MANIFEST } from '@assets/manifests/core.manifest.js';
import { UiRoot } from '@ui/UiRoot.js';
import { loadSettings } from '@ui/settings/SettingsPanel.js';
import { createEngine } from './createEngine.js';
import { createNetworking } from './createNetworking.js';
import { bindHud } from './bindHud.js';
import { bindSession } from './bindSession.js';
import { bindAnalytics } from './bindAnalytics.js';
import {
  AnalyticsClient,
  createConsoleSink,
  randomId,
  resolveAnonId,
} from '@analytics/AnalyticsClient.js';
import { PROTOCOL_VERSION } from '@farmrise/shared';
import { OutcomeState } from '@game/states/phases.js';
import { GlitchPlatform } from '@platform/glitch/GlitchPlatform.js';
import { SaveDirector } from '@platform/save/SaveDirector.js';
import { bindGlitchAnalytics } from './bindGlitch.js';
import { AUTOSAVE_INTERVAL_TICKS } from '@game/rules/sessionRules.js';
import { bindSceneAudio, bindStateAudio, prepareAudio } from './bindAudio.js';
import { SOUND, type SoundId } from '@assets/audio/soundIds.js';

export interface StartGameOptions {
  readonly container: HTMLElement;
  readonly isDev?: boolean;
  readonly apiBaseUrl?: string;
}

export interface RunningGame {
  stop(): void;
}

export async function startGame(options: StartGameOptions): Promise<RunningGame> {
  const { container } = options;
  const bundle = createEngine(container, options.isDev ?? false);
  const net = createNetworking(options.apiBaseUrl ?? '');
  // One loader for the whole session, so a scene reload re-uses the meshes
  // already in memory instead of re-fetching them.
  const assets = new AssetLoader(CORE_MANIFEST, import.meta.env.BASE_URL ?? '/');
  const machine = new GameStateMachine();
  const stopPreparingAudio = prepareAudio(bundle.audio, assets);
  const unbindStateAudio = bindStateAudio(machine, bundle.audio);

  let activeScene: FarmScene | null = null;
  let unbindHud: Unsubscribe | null = null;
  let unbindSceneAudio: Unsubscribe | null = null;
  let unbindSession: Unsubscribe | null = null;
  let unbindAutosave: Unsubscribe | null = null;
  let unbindAnalytics: Unsubscribe | null = null;
  /** Set after a finished run so the replay does not re-teach the tutorial. */
  let replaying = false;

  const analytics = new AnalyticsClient({
    context: {
      anonId: resolveAnonId(),
      sessionId: randomId(),
      protocolVersion: PROTOCOL_VERSION,
      appVersion: '0.1.0',
    },
  });
  if (options.isDev) analytics.addSink(createConsoleSink());

  // Glitch is optional. `create()` returns null on a plain website with no
  // title token, and every call below tolerates that.
  const glitch = GlitchPlatform.create();
  const saves = new SaveDirector(net.auth, net.api, glitch);
  // Assigned when Glitch is configured; released in stop().
  let unbindGlitchAnalytics: Unsubscribe | null = null;
  void unbindGlitchAnalytics;
  let accountBusy = false;
  let accountError: string | null = null;
  analytics.track('session_start', {
    referrer: typeof document === 'undefined' ? '' : document.referrer,
    viewport: `${globalThis.innerWidth ?? 0}x${globalThis.innerHeight ?? 0}`,
    touch: (globalThis.navigator?.maxTouchPoints ?? 0) > 0,
  });

  const playUi = (id: SoundId, volume = 0.75): void => {
    bundle.audio.play(id, { bus: 'ui', volume, detuneJitter: 12 });
  };

  const refreshAccount = (): void => {
    ui.account.update({
      signedIn: net.auth.signedIn,
      email: net.auth.user?.email ?? null,
      displayName: net.auth.user?.displayName ?? null,
      tier: saves.tier,
      busy: accountBusy,
      error: accountError,
      cloudAvailable: glitch !== null,
    });
  };

  /**
   * Runs an account action, keeping the panel honest about progress and
   * failure, and re-linking Glitch afterwards so cloud features follow the
   * signed-in identity.
   */
  const runAccountAction = async (action: () => Promise<void>): Promise<void> => {
    accountBusy = true;
    accountError = null;
    refreshAccount();
    try {
      await action();
      await glitch?.setAccountEmail(net.auth.user?.email ?? null);
    } catch (error) {
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
    },
    menu: {
      onPlay: () => {
        playUi(SOUND.uiConfirm);
        machine.transitionTo('loading', 'menu-play');
      },
      onSettings: () => {
        playUi(SOUND.uiOpen, 0.7);
        ui.openSettings('menu');
      },
      onAccount: () => {
        playUi(SOUND.uiOpen, 0.7);
        refreshAccount();
        ui.account.setVisible(true);
      },
    },
    pause: {
      onResume: () => machine.transitionTo('playing', 'ui-resume'),
      onSettings: () => {
        playUi(SOUND.uiOpen, 0.7);
        ui.openSettings('pause');
      },
      onAccount: () => {
        playUi(SOUND.uiOpen, 0.7);
        refreshAccount();
        ui.account.setVisible(true);
      },
      onQuit: () => machine.transitionTo('menu', 'ui-quit'),
    },
    market: {
      onSellSpot: (itemId, quantity) => activeScene?.session?.sell(itemId, quantity),
      onFulfil: (orderId) => activeScene?.session?.fulfil(orderId),
      onClose: () => activeScene?.session?.openPanel('none'),
    },
    build: {
      onSelectBuilding: (kind) => activeScene?.session?.chooseBuilding(kind),
      onBuyChicken: () => activeScene?.session?.purchaseChicken(),
      onBuyLand: () => activeScene?.session?.purchaseLand(),
      onClose: () => activeScene?.session?.openPanel('none'),
    },
    account: {
      onRegister: (email, displayName, password) =>
        void runAccountAction(async () => {
          await net.auth.register({ email, displayName, password });
          // Push the current run straight up so the account is immediately
          // worth having.
          const state = activeScene?.world?.toSaveState();
          if (state) await saves.save(state);
        }),
      onLogin: (email, password) =>
        void runAccountAction(async () => {
          await net.auth.login({ email, password });
          const restored = await saves.loadBest();
          if (restored?.tier === 'account') {
            ui.hud.toast('Signed in. Your saved farm is ready from the menu.');
          }
        }),
      onLogout: () =>
        void runAccountAction(async () => {
          await net.auth.logout();
        }),
      onClose: () => {
        playUi(SOUND.uiClick, 0.6);
        ui.account.setVisible(false);
      },
    },
    outcome: {
      onPlayAgain: () => {
        playUi(SOUND.uiConfirm);
        replaying = true;
        machine.transitionTo('loading', 'outcome-replay');
      },
      onBackToMenu: () => {
        playUi(SOUND.uiClick, 0.6);
        machine.transitionTo('menu', 'outcome-menu');
      },
    },
    settings: {
      onVolumeChange: (bus, value) => bundle.audio.setVolume(bus, value),
      onDebugToggle: () => {
        playUi(SOUND.uiClick, 0.55);
        /* Overlay visibility is resolved at boot; the toggle persists for next launch. */
      },
      onClose: () => {
        playUi(SOUND.uiClick, 0.6);
        ui.closeSettings();
      },
    },
  });

  saves.events.on('save:tier-changed', ({ tier }) => {
    refreshAccount();
    if (tier === 'account' || tier === 'cloud') {
      ui.hud.toast('Your farm is now saved to your account.');
    }
  });
  saves.events.on('save:conflict', () => {
    // Never silently overwrite. The player's own device wins by default
    // because they are looking at it, but they are told what happened.
    ui.hud.toast("Your farm was also saved elsewhere. Keeping this device's version.", 'warn');
  });

  // Apply persisted audio preferences before anything can play a sound.
  const settings = loadSettings();
  bundle.audio.setVolume('master', settings.master);
  bundle.audio.setVolume('music', settings.music);
  bundle.audio.setVolume('sfx', settings.sfx);

  bundle.sceneManager.register(FARM_SCENE_ID, () => {
    activeScene = new FarmScene({
      seed: net.auth.user?.id ?? 'local-session',
      assets,
      // A replay after a finished run never re-teaches the tutorial. The
      // player has demonstrably just played the whole loop.
      skipOnboarding: replaying,
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

    // Autosave. Local always, remote tiers when available.
    const world = scene.world;
    if (world) {
      let lastSaveTick = 0;
      unbindAutosave?.();
      unbindAutosave = world.events.on('world:balance-changed', () => {
        if (world.tick - lastSaveTick < AUTOSAVE_INTERVAL_TICKS) return;
        lastSaveTick = world.tick;
        void saves.save(world.toSaveState());
      });
    }
  });
  bundle.sceneManager.events.on('scene:load-error', ({ error }) => {
    console.error('[startGame] scene failed to load', error);
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

  try {
    await bundle.engine.start();
  } catch (error) {
    ui.dispose();
    if (error instanceof WebGLUnavailableError) renderFatal(container, error.message);
    else renderFatal(container, 'FarmRise Tycoon failed to start. Check the console for details.');
    throw error;
  }

  // Start Glitch after the engine is up so a slow network cannot delay the
  // first frame. Nothing below blocks play.
  if (glitch) {
    unbindGlitchAnalytics = bindGlitchAnalytics(analytics, glitch);
    glitch.session.events.on('glitch:denied', ({ reason }) => {
      // Glitch declined access (trial expired, licence missing). Say so
      // plainly; do not pretend the game is broken.
      ui.hud.toast(`Glitch access: ${reason}`, 'warn');
    });
    void glitch.start(net.auth.user?.email ?? null, () => machine.current === 'playing');
  }

  // Best-effort final delivery of events and the last heartbeat.
  const onHide = (): void => {
    if (activeScene?.world) saves.writeLocal(activeScene.world.toSaveState());
    void glitch?.flush();
  };
  globalThis.addEventListener?.('pagehide', onHide);

  await machine.begin('boot');

  return {
    stop(): void {
      unbindHud?.();
      unbindSceneAudio?.();
      unbindStateAudio();
      stopPreparingAudio();
      ui.dispose();
      bundle.engine.dispose();
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
