/**
 * The farm scene: the composition root for a play session.
 *
 * It wires the career, the site, the actors, the controllers and the views
 * together, then ticks them in a fixed order. It owns no rules of its own - if
 * you find yourself writing an `if` about crops or money in this file, it
 * belongs in a command or in the shared rules instead.
 *
 * The change progression forced here is that the scene no longer *creates* a
 * farm. It is handed either a validated career save or an explicit request for
 * a new one, and the starter grants happen only in the second case
 * (docs/PROGRESSION_GAMEPLAY_PLAN.md §32.1).
 */
import * as THREE from 'three';
import {
  newCareer,
  getCrop,
  seasonalCropIds,
  seedFromString,
  seasonAt,
  ticksToSeconds,
  type BuildingKind,
  type CareerSaveState,
  type Season,
} from '@farmrise/shared';
import type { GameScene, SceneLoadContext } from '@engine/scene/GameScene.js';
import type { FixedUpdateContext, RenderContext } from '@engine/core/types.js';
import { CameraRigToken } from '@engine/camera/CameraRig.js';
import { FollowController } from '@engine/camera/FollowController.js';
import { InputToken, type InputSystem } from '@engine/input/InputSystem.js';
import type { ReviewCameraOverride } from '@engine/debug/DebugFlags.js';
import type { RenderPipeline } from '@engine/render/RenderPipeline.js';
import { disposeObject3D } from '@engine/scene/disposeObject3D.js';
import { EventBus } from '@engine/core/EventBus.js';
import type { AssetLoader } from '@assets/loaders/AssetLoader.js';
import {
  cropModelFamilyForSeason,
  ModelLibrary,
  modelFamiliesForSeasons,
} from '@assets/registries/ModelLibrary.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Career } from '../career/Career.js';
import { CareerDirector } from '../career/CareerDirector.js';
import { FarmView } from '../world/view/FarmView.js';
import { SurfaceLibrary } from '@assets/registries/SurfaceLibrary.js';
import { Player } from '../player/Player.js';
import { PlayerController } from '../player/PlayerController.js';
import { PlayerView } from '../player/PlayerView.js';
import { IncidentDirector } from '../events/IncidentDirector.js';
import { EnemyDirector } from '../enemies/EnemyDirector.js';
import { InteractionController } from '../systems/InteractionController.js';
import { SessionController } from '../systems/SessionController.js';
import type { GameAction } from '../GameActions.js';
import {
  GAMEPLAY_CAMERA,
  GAMEPLAY_CAMERA_PITCH_RADIANS,
  GAMEPLAY_CAMERA_YAW_RADIANS,
} from '../rules/sessionRules.js';
import type { DynamicCircleCollider } from '@engine/physics/PhysicsPort.js';
import {
  CHICKEN_COLLISION_RADIUS,
  chickenPose,
  createChickenPose,
} from '../animals/chickenMotion.js';
import { COW_COLLISION_RADIUS, cowPose, createCowPose } from '../animals/cowMotion.js';
import type { TextLocalizer } from '@engine/i18n/Localization.js';

export const FARM_SCENE_ID = 'farm';

export interface FarmSceneEvents extends Record<string, unknown> {
  'farm:ready': { level: string; resumed: boolean };
}

export interface FarmSceneOptions {
  /** Forces onboarding off, e.g. when replaying after a finished run. */
  readonly skipOnboarding?: boolean;
  /**
   * A validated career to resume. When absent the scene starts a new career,
   * which is the only path that hands out starter livestock.
   */
  readonly career?: CareerSaveState;
  /** Stable seed for a brand-new career. Supplied by the server when signed in. */
  readonly seed?: string;
  /**
   * Supplies the authored art. Optional on purpose: the scene falls back to
   * procedural primitives when it is absent or when loading fails, so the
   * game still runs for anyone who has not executed the Blender build.
   */
  readonly assets?: AssetLoader;
  /** Rendering quality chosen by bootstrap from device capabilities. */
  readonly shadowMapSize?: number;
  /**
   * Ultra-tier render pipeline, if one exists.
   *
   * Passed in rather than resolved here so the scene stays constructible in
   * tests, and so the "no pipeline means the previous behaviour" rule is
   * visible at the call site instead of hidden in a service lookup.
   */
  readonly pipeline?: RenderPipeline;
  /** Debug-only: start within interaction range of the first crop bed. */
  readonly reviewActions?: boolean;
  /** Debug-only: start at a specific tile for a focused acceptance fixture. */
  readonly reviewSpawnTile?: { readonly tileX: number; readonly tileZ: number };
  /**
   * Debug-only: replaces the shipping follow-camera framing.
   *
   * Used to judge the character rig, which is a few dozen pixels tall at the
   * 13.25 m gameplay distance. Nothing else in the scene reads it, so a review
   * capture still exercises the shipping views, materials and clips.
   */
  readonly reviewCamera?: ReviewCameraOverride;
  /** Presentation-only copy for loading and world-space status. */
  readonly localization?: TextLocalizer;
}

export class FarmScene implements GameScene {
  readonly id = FARM_SCENE_ID;
  readonly root = new THREE.Scene();
  readonly events = new EventBus<FarmSceneEvents>();

  #career: Career | null = null;
  #careerDirector: CareerDirector | null = null;
  #player: Player | null = null;
  #playerController: PlayerController | null = null;
  #interaction: InteractionController | null = null;
  #incidents: IncidentDirector | null = null;
  #enemyDirector: EnemyDirector | null = null;
  #farmView: FarmView | null = null;
  #playerView: PlayerView | null = null;
  #cameraController: FollowController | null = null;
  #session: SessionController | null = null;
  #library: ModelLibrary | null = null;
  #surfaces: SurfaceLibrary | null = null;
  #unbindScareReaction: (() => void) | null = null;
  #unbindRaidResult: (() => void) | null = null;
  #unbindSeasonArt: (() => void) | null = null;
  readonly #loadedSeasonPacks = new Set<Season>();
  readonly #loadingSeasonPacks = new Set<Season>();
  readonly #seasonArtAbort = new AbortController();
  readonly #dynamicColliders: Array<{
    id: string;
    x: number;
    z: number;
    radius: number;
  }> = [];
  #running = false;

  constructor(private readonly options: FarmSceneOptions = {}) {
    // Mirrors palette.py's sky band. A slightly lighter haze colour lets the
    // horizon soften without a texture or skybox.
    this.root.background = new THREE.Color(0x65bde7);
    this.root.fog = new THREE.Fog(0xa7d7e8, 42, 108);
  }

  get career(): Career | null {
    return this.#career;
  }
  /** The active site. Kept named `world` because that is what every view wants. */
  get world() {
    return this.#career?.world ?? null;
  }
  get player(): Player | null {
    return this.#player;
  }
  get interaction(): InteractionController | null {
    return this.#interaction;
  }
  get incidents(): IncidentDirector | null {
    return this.#incidents;
  }
  get careerDirector(): CareerDirector | null {
    return this.#careerDirector;
  }
  get enemyDirector(): EnemyDirector | null {
    return this.#enemyDirector;
  }
  get playerController(): PlayerController | null {
    return this.#playerController;
  }

  async load(context: SceneLoadContext): Promise<void> {
    context.reportProgress(0.05, this.#text('loading.surveying', 'Surveying the land'));

    const resumed = this.options.career !== undefined;
    const state =
      this.options.career ??
      newCareer({
        careerId: this.options.seed ?? `career-${Date.now()}`,
        seed: seedFromString(this.options.seed ?? 'starter-farm'),
      });
    const initialSeason = seasonAt(state.tick);
    const requiredCropSeasons = new Set<Season>([initialSeason]);
    const activeSite = state.sites.find((site) => site.id === state.activeSiteId);
    for (const plot of activeSite?.plots ?? []) {
      const crop = plot.cropId ? getCrop(plot.cropId) : undefined;
      for (const plantingSeason of crop?.plantingSeasons ?? []) {
        requiredCropSeasons.add(plantingSeason);
      }
    }

    const library = await this.#loadArt(context, [...requiredCropSeasons]);
    this.#library = library;
    // Ultra only, and gated on the pipeline rather than on a tier string, so a
    // reviewer who disables the pipeline gets a farm that behaves as if the
    // texture library was never built. On `low` this line never runs, so not
    // one of its ~960 KiB is requested.
    this.#surfaces = this.options.pipeline?.active ? await this.#loadSurfaces(context) : null;
    if (context.signal.aborted) {
      library?.dispose();
      return;
    }

    const career = Career.fromSaveState(state);
    const world = career.world;
    const level = world.level;
    const reviewPlot = this.options.reviewActions ? world.fields.placements[0] : undefined;
    if (this.options.reviewActions) {
      // Keep the authored action fixture deterministic even when the browser
      // restores an older debug save. Incident responses take interaction
      // priority over crop care, which otherwise swaps the watering pose for
      // a shoo/repair gesture midway through a matched review sequence.
      career.setIncidents([]);
    }
    if (reviewPlot && !world.structures.get(ACTION_REVIEW_IRRIGATION_ID)) {
      // Visual-review fixture only: one completed irrigation point keeps the
      // basin and directional stream beside the action target, so standing and
      // running water are judged from the real gameplay camera instead of a
      // close-up or a separately art-directed scene.
      world.structures.add({
        id: ACTION_REVIEW_IRRIGATION_ID,
        kind: 'irrigation',
        tileX: reviewPlot.tileX,
        tileZ: reviewPlot.tileZ - 1,
        rotation: 0,
        remainingBuildTicks: 0,
        broken: false,
      });
      world.refreshIrrigation();
    }
    const reviewSpawn = this.options.reviewSpawnTile ?? reviewPlot;
    const spawn = reviewSpawn
      ? world.grid.tileToWorld(reviewSpawn.tileX, reviewSpawn.tileZ)
      : world.grid.tileToWorld(level.spawn.tileX, level.spawn.tileZ);
    const player = new Player(spawn.x, spawn.z);

    context.reportProgress(0.55, this.#text('loading.turningSoil', 'Turning the soil'));
    const farmView = new FarmView(world, library, {
      shadowMapSize: this.options.shadowMapSize,
      ...(this.options.pipeline ? { pipeline: this.options.pipeline } : {}),
      ...(this.#surfaces ? { surfaces: this.#surfaces } : {}),
    });
    const playerView = new PlayerView(player, library, Boolean(this.options.pipeline?.active));
    this.root.add(farmView.object, playerView.object);

    context.reportProgress(0.7, this.#text('loading.wakingAnimals', 'Waking the animals'));
    const input = context.services.resolve(InputToken) as InputSystem<GameAction>;
    const playerController = new PlayerController(player, world, world.physics, input);
    const incidents = new IncidentDirector(career);
    const careerDirector = new CareerDirector(career);
    const enemyDirector = new EnemyDirector(
      world,
      player,
      world.physics,
      career.rng('incidents'),
      incidents,
    );
    const interaction = new InteractionController(
      career,
      player,
      playerController,
      incidents,
      input,
    );

    const review = this.options.reviewCamera;
    const anchor = new THREE.Vector3(spawn.x, review?.targetY ?? 1, spawn.z);
    const cameraController = new FollowController({
      getTarget: () =>
        review && !review.follow
          ? anchor
          : new THREE.Vector3(player.position.x, review?.targetY ?? 1, player.position.z),
      distance: review?.distance ?? GAMEPLAY_CAMERA.distance,
      pitch: review ? (review.pitchDegrees * Math.PI) / 180 : GAMEPLAY_CAMERA_PITCH_RADIANS,
      yaw: review ? (review.yawDegrees * Math.PI) / 180 : GAMEPLAY_CAMERA_YAW_RADIANS,
      ...(review ? { minDistance: 1, smoothingSeconds: 0.06 } : {}),
    });
    const cameraRig = context.services.tryResolve(CameraRigToken);
    cameraRig?.setController(cameraController);

    // The session owns onboarding, the panels and placement. It needs the
    // camera because build placement is a pointer cursor raycast against the
    // ground plane.
    const session = new SessionController(
      career,
      player,
      playerController,
      incidents,
      careerDirector,
      input,
      cameraRig?.camera ?? new THREE.PerspectiveCamera(),
      {
        // The action-review fixture exists to judge the authored pose and VFX
        // at the shipping camera. Tutorial panels would cover the actor, so the
        // fixture alone starts with onboarding complete; normal sessions keep
        // the exact option supplied by bootstrap.
        skipOnboarding: this.options.reviewActions ? true : this.options.skipOnboarding,
      },
    );
    // SessionController normally re-enables random scheduling when onboarding
    // is already complete. Apply the review override after construction so a
    // fox/drought prompt cannot steal the crop-care interaction between two
    // matched action frames.
    if (this.options.reviewActions) incidents.setRandomSchedulingEnabled(false);

    if (context.signal.aborted) {
      farmView.dispose();
      playerView.dispose();
      return;
    }

    this.#career = career;
    this.#careerDirector = careerDirector;
    this.#player = player;
    this.#playerController = playerController;
    this.#interaction = interaction;
    this.#incidents = incidents;
    this.#enemyDirector = enemyDirector;
    this.#farmView = farmView;
    this.#playerView = playerView;
    this.#cameraController = cameraController;
    this.#session = session;
    this.#unbindScareReaction = enemyDirector.events.on('enemy:scared-off', () =>
      playerView.triggerScareReaction(),
    );
    this.#unbindRaidResult = enemyDirector.events.on('enemy:raid-succeeded', () =>
      farmView.triggerFoxRaidResult(world),
    );
    this.#unbindSeasonArt = career.events.on('career:season-changed', ({ season }) => {
      void this.#loadSeasonCropArt(season, farmView);
    });
    this.#refreshDynamicColliders();

    context.reportProgress(1, this.#text('loading.ready', 'Ready'));
    this.events.emit('farm:ready', { level: level.id, resumed });
  }

  activate(): void {
    this.#running = true;
  }

  deactivate(): void {
    this.#running = false;
  }

  setRunning(running: boolean): void {
    this.#running = running;
  }

  /**
   * One simulation tick, in dependency order:
   * input-driven movement -> interaction -> career evolution -> incidents ->
   * enemies. Anything that reads the world must run after the world advances,
   * and anything that moves the player must run before interaction range is
   * evaluated.
   */
  fixedUpdate(context: FixedUpdateContext): void {
    const career = this.#career;
    if (!this.#running || !career) return;

    const movementEnabled = this.#session?.panel === 'none';
    const interactionEnabled = movementEnabled && !this.#session?.placement.active;
    this.#playerController?.fixedUpdate(context, movementEnabled);
    // Placement owns the context click/key but not locomotion. The farmer can
    // keep walking with WASD while positioning a long road or fence run, while
    // plot work stays suppressed so one click cannot both build and plant.
    if (interactionEnabled) this.#interaction?.fixedUpdate(context);
    this.#session?.fixedUpdate(context);
    const onboarding = this.#session?.onboarding;
    const eggLessonActive = onboarding?.active && onboarding.currentBeat?.id === 'eggs';
    const eggsAvailable =
      (career.world.stores.totalOf('eggs') ?? 0) + (career.world.carry.items.eggs ?? 0);
    career.advance(
      1,
      onboarding?.active ? ['eggs'] : [],
      !onboarding?.active || onboarding.currentBeat?.id === 'eggs',
      eggLessonActive && eggsAvailable <= 0 ? ['chicken'] : [],
    );
    this.#incidents?.fixedUpdate(1);
    this.#careerDirector?.fixedUpdate();
    // Refresh after player/world movement so foxes see current actor positions.
    this.#refreshDynamicColliders();
    this.#enemyDirector?.fixedUpdate(context);
    // Foxes moved during their update; publish the final positions for the
    // player's next tick and for the next fox-to-fox query.
    this.#refreshDynamicColliders();
  }

  update(context: RenderContext): void {
    const career = this.#career;
    if (!career) return;
    this.#session?.update(context);
    // Views sync every rendered frame, not every tick, so visuals stay smooth
    // between ticks and cost nothing extra when the sim is paused.
    this.#farmView?.sync(
      career.world,
      this.#enemyDirector?.foxes ?? [],
      this.#incidents?.mostUrgent ?? null,
      context,
      this.#player,
      // Camera-facing plot gauges overlap the hands, can and impact point when
      // the review fixture intentionally stands on the bed. They remain live
      // in gameplay; only the deterministic visual-review path omits them.
      this.options.reviewActions ? [] : (this.#interaction?.proximityMeters() ?? []),
    );
    if (this.#player) {
      const surface = this.#farmView?.surfaceAt(
        career.world,
        this.#player.position.x,
        this.#player.position.z,
      );
      this.#playerView?.sync(this.#player, context, surface);
    }
  }

  /** Zoom/orbit hooks the settings and touch UI can call. */
  get camera(): FollowController | null {
    return this.#cameraController;
  }

  get session(): SessionController | null {
    return this.#session;
  }

  /** The document to persist. Null before the scene has loaded. */
  saveState(): CareerSaveState | null {
    return this.#career?.toSaveState() ?? null;
  }

  /**
   * Shows or clears the build placement preview.
   *
   * Routed through the scene so bootstrap never reaches into a view - the
   * same rule that keeps bindHud from touching Three.js.
   */
  setPlacementPreview(
    kind: BuildingKind | null,
    tileX?: number,
    tileZ?: number,
    valid?: boolean,
    rotation?: number,
  ): void {
    const world = this.#career?.world;
    if (world) this.#farmView?.setPlacementPreview(world, kind, tileX, tileZ, valid, rotation);
  }

  /** False when the scene fell back to procedural primitives. */
  get hasAuthoredArt(): boolean {
    return this.#library !== null;
  }

  /**
   * Publishes the small moving-actor set into GridPhysics' spatial buckets.
   * Collider objects are reused every tick, avoiding per-frame garbage even
   * when the shelter reaches its 64-instance visual cap.
   */
  #refreshDynamicColliders(): void {
    const world = this.#career?.world;
    const player = this.#player;
    if (!world || !player) return;

    let next = 0;
    const write = (id: string, x: number, z: number, radius: number): void => {
      const collider = this.#dynamicColliders[next];
      if (collider) {
        collider.id = id;
        collider.x = x;
        collider.z = z;
        collider.radius = radius;
      } else {
        this.#dynamicColliders.push({ id, x, z, radius });
      }
      next += 1;
    };

    write(player.collisionId, player.position.x, player.position.z, player.radius);

    const chickenCount = Math.min(
      world.livestock.groups
        .filter((group) => group.species === 'chicken')
        .reduce((sum, group) => sum + group.count, 0),
      64,
    );
    if (chickenCount > 0) {
      const shelter = world.grid.tileToWorld(world.level.shelter.tileX, world.level.shelter.tileZ);
      const pose = createChickenPose();
      const simulationTime = ticksToSeconds(world.tick);
      for (let index = 0; index < chickenCount; index += 1) {
        chickenPose(shelter, index, chickenCount, simulationTime, 0, 1, pose);
        write(`chicken-${index}`, pose.x, pose.z, CHICKEN_COLLISION_RADIUS);
      }
    }

    const cowCount = Math.min(
      world.livestock.groups
        .filter((group) => group.species === 'cow')
        .reduce((sum, group) => sum + group.count, 0),
      16,
    );
    if (cowCount > 0) {
      const shelter = world.grid.tileToWorld(world.level.shelter.tileX, world.level.shelter.tileZ);
      const pose = createCowPose();
      const simulationTime = ticksToSeconds(world.tick);
      for (let index = 0; index < cowCount; index += 1) {
        cowPose(shelter, index, cowCount, simulationTime, 1, pose);
        write(`cow-${index}`, pose.x, pose.z, COW_COLLISION_RADIUS);
      }
    }

    for (const fox of this.#enemyDirector?.foxes ?? []) {
      write(fox.collisionId, fox.position.x, fox.position.z, fox.radius);
    }

    this.#dynamicColliders.length = next;
    world.physics.setDynamicColliders(this.#dynamicColliders as readonly DynamicCircleCollider[]);
  }

  /**
   * Fetches the authored art, or returns null.
   *
   * Failure here is explicitly NOT fatal. A missing GLB means the player
   * sees placeholder primitives, which is a far better outcome than a black
   * screen, and it keeps the jsdom test suite running without any art on
   * disk or any network.
   */
  async #loadArt(
    context: SceneLoadContext,
    seasons: readonly Season[],
  ): Promise<ModelLibrary | null> {
    const loader = this.options.assets;
    if (!loader) return null;

    const library = new ModelLibrary();
    let loaded = 0;
    const families = modelFamiliesForSeasons(seasons);
    for (const [index, id] of families.entries()) {
      try {
        const gltf = await loader.load<GLTF>(id, context.signal);
        library.ingest(gltf);
        loaded += 1;
        for (const season of seasons) {
          if (id === cropModelFamilyForSeason(season)) this.#loadedSeasonPacks.add(season);
        }
      } catch (error) {
        if (context.signal.aborted) return null;
        console.warn(`[FarmScene] art family "${id}" unavailable, falling back`, error);
      }
      context.reportProgress(
        0.05 + ((index + 1) / families.length) * 0.45,
        this.#text('loading.unloadingTruck', 'Unloading the truck'),
      );
    }

    if (loaded === 0) {
      library.dispose();
      return null;
    }
    return library;
  }

  /**
   * Loads the procedural PBR surfaces the terrain needs.
   *
   * Only the three ground layers and the tilled soil used by the bed decals are
   * requested. The other six materials in the library are declared in the
   * manifest and generated on disk, but nothing consumes them yet, and
   * downloading half a megabyte for a future stage would be a payload
   * regression dressed up as preparation.
   *
   * Failure is not fatal, exactly as for the GLBs: the ground falls back to the
   * vertex-coloured material and the decals simply do not exist.
   */
  async #loadSurfaces(context: SceneLoadContext): Promise<SurfaceLibrary | null> {
    const loader = this.options.assets;
    if (!loader) return null;
    context.reportProgress(0.52, this.#text('loading.weatheringGround', 'Weathering the ground'));
    try {
      const library = await SurfaceLibrary.load(
        loader,
        ['scrub_gravel', 'grass_dry', 'soil_dry_cracked', 'soil_tilled'],
        context.signal,
        // The ground is seen at 34 degrees above the horizon, which is where
        // anisotropic filtering stops being a nicety. 16 is the cap on every
        // desktop GPU this tier targets, and the pipeline is desktop-only.
        16,
      );
      return library.loaded.length > 0 ? library : null;
    } catch (error) {
      console.warn('[FarmScene] procedural surfaces unavailable, falling back', error);
      return null;
    }
  }

  async #loadSeasonCropArt(season: Season, farmView: FarmView): Promise<void> {
    const loader = this.options.assets;
    const library = this.#library;
    if (
      !loader ||
      !library ||
      this.#loadedSeasonPacks.has(season) ||
      this.#loadingSeasonPacks.has(season)
    )
      return;
    this.#loadingSeasonPacks.add(season);
    try {
      const gltf = await loader.load<GLTF>(
        cropModelFamilyForSeason(season),
        this.#seasonArtAbort.signal,
      );
      if (this.#seasonArtAbort.signal.aborted) return;
      library.ingest(gltf);
      this.#loadedSeasonPacks.add(season);
      farmView.refreshCropGeometry(seasonalCropIds(season));
    } catch (error) {
      if (!this.#seasonArtAbort.signal.aborted) {
        console.warn(`[FarmScene] seasonal crop art for ${season} unavailable`, error);
      }
    } finally {
      this.#loadingSeasonPacks.delete(season);
    }
  }

  #text(key: string, fallback: string): string {
    return this.options.localization?.t(key, undefined, fallback) ?? fallback;
  }

  dispose(): void {
    this.#farmView?.dispose();
    this.#playerView?.dispose();
    this.#unbindScareReaction?.();
    this.#unbindScareReaction = null;
    this.#unbindRaidResult?.();
    this.#unbindRaidResult = null;
    this.#unbindSeasonArt?.();
    this.#unbindSeasonArt = null;
    this.#seasonArtAbort.abort();
    this.#library?.dispose();
    this.#surfaces?.dispose();
    this.#surfaces = null;
    this.#library = null;
    disposeObject3D(this.root);
    this.events.clear();
    this.#career = null;
    this.#player = null;
  }
}

const ACTION_REVIEW_IRRIGATION_ID = 'review-irrigation';
