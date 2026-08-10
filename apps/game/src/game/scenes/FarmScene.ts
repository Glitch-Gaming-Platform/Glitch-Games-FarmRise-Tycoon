/**
 * The farm scene: the composition root for a single play session.
 *
 * It wires the model (FarmWorld), the actors (Player, foxes), the controllers
 * (movement, interaction, events) and the views together, then ticks them in a
 * fixed order. It owns no rules of its own - if you find yourself writing an
 * `if` about crops or money in this file, it belongs in FarmCommands or the
 * shared rules instead.
 */
import * as THREE from 'three';
import { seedFromString, ticksToSeconds, type BuildingKind } from '@farmrise/shared';
import type { GameScene, SceneLoadContext } from '@engine/scene/GameScene.js';
import type { FixedUpdateContext, RenderContext } from '@engine/core/types.js';
import { CameraRigToken } from '@engine/camera/CameraRig.js';
import { FollowController } from '@engine/camera/FollowController.js';
import { InputToken, type InputSystem } from '@engine/input/InputSystem.js';
import { disposeObject3D } from '@engine/scene/disposeObject3D.js';
import { EventBus } from '@engine/core/EventBus.js';
import type { AssetLoader } from '@assets/loaders/AssetLoader.js';
import { ModelLibrary, MODEL_FAMILIES } from '@assets/registries/ModelLibrary.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FarmWorld } from '../world/FarmWorld.js';
import { FarmView } from '../world/view/FarmView.js';
import { STARTER_FARM } from '../world/levels/starterFarm.js';
import type { LevelDefinition } from '../world/levels/LevelDefinition.js';
import { Player } from '../player/Player.js';
import { PlayerController } from '../player/PlayerController.js';
import { PlayerView } from '../player/PlayerView.js';
import { EventDirector } from '../events/EventDirector.js';
import { EnemyDirector } from '../enemies/EnemyDirector.js';
import { InteractionController } from '../systems/InteractionController.js';
import { SessionController } from '../systems/SessionController.js';
import type { GameAction } from '../GameActions.js';
import { GAMEPLAY_CAMERA, GAMEPLAY_CAMERA_PITCH_RADIANS } from '../rules/sessionRules.js';
import type { DynamicCircleCollider } from '@engine/physics/PhysicsPort.js';
import {
  CHICKEN_COLLISION_RADIUS,
  chickenPose,
  createChickenPose,
} from '../animals/chickenMotion.js';

export const FARM_SCENE_ID = 'farm';

export interface FarmSceneEvents extends Record<string, unknown> {
  'farm:ready': { level: string };
}

export interface FarmSceneOptions {
  /** Forces onboarding off, e.g. when replaying after a finished run. */
  readonly skipOnboarding?: boolean;
  readonly level?: LevelDefinition;
  /** Stable seed. Supplied by the server for a signed-in player. */
  readonly seed?: string;
  /**
   * Supplies the authored art. Optional on purpose: the scene falls back to
   * procedural primitives when it is absent or when loading fails, so the
   * game still runs for anyone who has not executed the Blender build.
   */
  readonly assets?: AssetLoader;
}

export class FarmScene implements GameScene {
  readonly id = FARM_SCENE_ID;
  readonly root = new THREE.Scene();
  readonly events = new EventBus<FarmSceneEvents>();

  #world: FarmWorld | null = null;
  #player: Player | null = null;
  #playerController: PlayerController | null = null;
  #interaction: InteractionController | null = null;
  #eventDirector: EventDirector | null = null;
  #enemyDirector: EnemyDirector | null = null;
  #farmView: FarmView | null = null;
  #playerView: PlayerView | null = null;
  #cameraController: FollowController | null = null;
  #session: SessionController | null = null;
  #library: ModelLibrary | null = null;
  #unbindScareReaction: (() => void) | null = null;
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

  get world(): FarmWorld | null {
    return this.#world;
  }
  get player(): Player | null {
    return this.#player;
  }
  get interaction(): InteractionController | null {
    return this.#interaction;
  }
  get eventDirector(): EventDirector | null {
    return this.#eventDirector;
  }
  get enemyDirector(): EnemyDirector | null {
    return this.#enemyDirector;
  }
  get playerController(): PlayerController | null {
    return this.#playerController;
  }

  async load(context: SceneLoadContext): Promise<void> {
    const level = this.options.level ?? STARTER_FARM;
    context.reportProgress(0.05, 'Surveying the land');

    const library = await this.#loadArt(context);
    this.#library = library;
    if (context.signal.aborted) {
      library?.dispose();
      return;
    }

    const world = new FarmWorld(level, seedFromString(this.options.seed ?? level.id));
    const spawn = world.grid.tileToWorld(level.spawn.tileX, level.spawn.tileZ);
    const player = new Player(spawn.x, spawn.z);

    context.reportProgress(0.55, 'Turning the soil');
    const farmView = new FarmView(world, library);
    const playerView = new PlayerView(player, library);
    this.root.add(farmView.object, playerView.object);

    context.reportProgress(0.7, 'Waking the animals');
    const input = context.services.resolve(InputToken) as InputSystem<GameAction>;
    const playerController = new PlayerController(player, world, world.physics, input);
    const eventDirector = new EventDirector(world);
    const enemyDirector = new EnemyDirector(world, player, world.physics, eventDirector);
    const interaction = new InteractionController(world, player, playerController, input);

    // Give the player something to look after from the first second, so the
    // bootstrap actually exercises growth, harvesting and animal production.
    world.addAnimals('chicken', 2);

    const cameraController = new FollowController({
      getTarget: () => new THREE.Vector3(player.position.x, 1, player.position.z),
      distance: GAMEPLAY_CAMERA.distance,
      // 38 degrees. The original 0.34*PI (61 degrees) read as near-top-down:
      // it foreshortened away all the vertical crop mass the art depends on,
      // hid every building front, and filled the frame with flat ground.
      // See docs/ART_DIRECTION.md, "Camera".
      pitch: GAMEPLAY_CAMERA_PITCH_RADIANS,
    });
    const cameraRig = context.services.tryResolve(CameraRigToken);
    cameraRig?.setController(cameraController);

    // The session owns onboarding, the panels, placement and the run's
    // outcome. It needs the camera because build placement is a pointer
    // cursor raycast against the ground plane.
    const session = new SessionController(
      world,
      player,
      playerController,
      eventDirector,
      input,
      cameraRig?.camera ?? new THREE.PerspectiveCamera(),
      { skipOnboarding: this.options.skipOnboarding },
    );

    if (context.signal.aborted) {
      farmView.dispose();
      playerView.dispose();
      return;
    }

    this.#world = world;
    this.#player = player;
    this.#playerController = playerController;
    this.#interaction = interaction;
    this.#eventDirector = eventDirector;
    this.#enemyDirector = enemyDirector;
    this.#farmView = farmView;
    this.#playerView = playerView;
    this.#cameraController = cameraController;
    this.#session = session;
    this.#unbindScareReaction = enemyDirector.events.on('enemy:scared-off', () =>
      playerView.triggerScareReaction(),
    );
    this.#refreshDynamicColliders();

    context.reportProgress(1, 'Ready');
    this.events.emit('farm:ready', { level: level.id });
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
   * input-driven movement -> interaction -> world evolution -> events ->
   * enemies. Anything that reads the world must run after the world advances,
   * and anything that moves the player must run before interaction range is
   * evaluated.
   */
  fixedUpdate(context: FixedUpdateContext): void {
    if (!this.#running || !this.#world) return;
    const worldInputEnabled = this.#session?.panel === 'none' && !this.#session?.placement.active;
    this.#playerController?.fixedUpdate(context, worldInputEnabled);
    // Placement is a modal cursor: while it is active the plot-level
    // interaction must not also fire, or one click both places a barn and
    // plants a seed.
    if (worldInputEnabled) this.#interaction?.fixedUpdate(context);
    this.#session?.fixedUpdate(context);
    this.#world.advance(1);
    this.#eventDirector?.fixedUpdate(1);
    // Refresh after player/world movement so foxes see current actor positions.
    this.#refreshDynamicColliders();
    this.#enemyDirector?.fixedUpdate(context);
    // Foxes moved during their update; publish the final positions for the
    // player's next tick and for the next fox-to-fox query.
    this.#refreshDynamicColliders();
  }

  update(context: RenderContext): void {
    if (!this.#world) return;
    this.#session?.update(context);
    // Views sync every rendered frame, not every tick, so visuals stay smooth
    // between ticks and cost nothing extra when the sim is paused.
    this.#farmView?.sync(
      this.#world,
      this.#enemyDirector?.foxes ?? [],
      this.#eventDirector?.current ?? null,
      context,
    );
    if (this.#player) this.#playerView?.sync(this.#player, context);
  }

  /** Zoom/orbit hooks the settings and touch UI can call. */
  get camera(): FollowController | null {
    return this.#cameraController;
  }

  get session(): SessionController | null {
    return this.#session;
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
  ): void {
    if (this.#world) this.#farmView?.setPlacementPreview(this.#world, kind, tileX, tileZ, valid);
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
    const world = this.#world;
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
      world.animals
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
  async #loadArt(context: SceneLoadContext): Promise<ModelLibrary | null> {
    const loader = this.options.assets;
    if (!loader) return null;

    const library = new ModelLibrary();
    let loaded = 0;
    for (const [index, id] of MODEL_FAMILIES.entries()) {
      try {
        const gltf = await loader.load<GLTF>(id, context.signal);
        library.ingest(gltf);
        loaded += 1;
      } catch (error) {
        if (context.signal.aborted) return null;
        console.warn(`[FarmScene] art family "${id}" unavailable, falling back`, error);
      }
      context.reportProgress(
        0.05 + ((index + 1) / MODEL_FAMILIES.length) * 0.45,
        'Unloading the truck',
      );
    }

    if (loaded === 0) {
      library.dispose();
      return null;
    }
    return library;
  }

  dispose(): void {
    this.#farmView?.dispose();
    this.#playerView?.dispose();
    this.#unbindScareReaction?.();
    this.#unbindScareReaction = null;
    this.#library?.dispose();
    this.#library = null;
    disposeObject3D(this.root);
    this.events.clear();
    this.#world = null;
    this.#player = null;
  }
}
