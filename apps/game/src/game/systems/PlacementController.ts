/**
 * Build placement: the bridge between "I chose a barn" and "a barn exists".
 *
 * Kept out of InteractionController on purpose. Interaction is about the plot
 * under your feet; placement is a modal cursor over the whole farm, with its
 * own validity rules and its own cancel. Merging them would produce exactly
 * the kind of `if (mode === ...)` branching the architecture doc forbids.
 *
 * The player places with the POINTER rather than by standing somewhere,
 * because a 2x2 barn cannot be positioned by a character who is standing
 * inside its footprint.
 */
import * as THREE from 'three';
import { BUILDINGS, type BuildingKind } from '@farmrise/shared';
import { EventBus } from '@engine/core/EventBus.js';
import { TileFlag } from '@engine/physics/TileGrid.js';
import type { InputSystem } from '@engine/input/InputSystem.js';
import type { RenderContext } from '@engine/core/types.js';
import type { FarmWorld } from '../world/FarmWorld.js';
import { build } from '../world/FarmCommands.js';
import type { GameAction } from '../GameActions.js';

export interface PlacementEvents extends Record<string, unknown> {
  'placement:started': { kind: BuildingKind };
  'placement:moved': { kind: BuildingKind; tileX: number; tileZ: number; valid: boolean };
  'placement:placed': { kind: BuildingKind; tileX: number; tileZ: number };
  'placement:cancelled': { kind: BuildingKind; reason: 'player' | 'refused' };
  'placement:refused': { kind: BuildingKind; reason: string };
}

export class PlacementController {
  readonly events = new EventBus<PlacementEvents>();
  readonly #raycaster = new THREE.Raycaster();
  readonly #groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  readonly #hit = new THREE.Vector3();
  readonly #pointer = new THREE.Vector2();

  #kind: BuildingKind | null = null;
  #tileX = 0;
  #tileZ = 0;
  #valid = false;
  /** Debounces the click that opened the panel from placing immediately. */
  #armedAt = 0;

  constructor(
    private readonly world: FarmWorld,
    private readonly input: InputSystem<GameAction>,
    private readonly camera: THREE.Camera,
  ) {}

  get active(): boolean {
    return this.#kind !== null;
  }
  get kind(): BuildingKind | null {
    return this.#kind;
  }
  get tile(): { x: number; z: number; valid: boolean } {
    return { x: this.#tileX, z: this.#tileZ, valid: this.#valid };
  }

  begin(kind: BuildingKind, nowMs: number): void {
    this.#kind = kind;
    this.#armedAt = nowMs + 180;
    this.events.emit('placement:started', { kind });
  }

  cancel(reason: 'player' | 'refused' = 'player'): void {
    if (!this.#kind) return;
    const kind = this.#kind;
    this.#kind = null;
    this.events.emit('placement:cancelled', { kind, reason });
  }

  /** Commits input on the fixed tick where the edge exists. */
  fixedUpdate(nowMs: number): void {
    const kind = this.#kind;
    if (!kind) return;

    if (this.input.wasPressed('cancel')) {
      this.cancel('player');
      return;
    }

    const valid = this.#refreshPointer(kind);
    if (nowMs < this.#armedAt || !this.input.wasPressed('interact')) return;

    if (!valid) {
      this.events.emit('placement:refused', { kind, reason: 'That spot is taken.' });
      return;
    }

    const result = build(this.world, kind, this.#tileX, this.#tileZ);
    if (!result.ok) {
      this.events.emit('placement:refused', { kind, reason: result.reason });
      return;
    }
    this.events.emit('placement:placed', { kind, tileX: this.#tileX, tileZ: this.#tileZ });
    this.#kind = null;
  }

  /**
   * Tracks the preview on every rendered frame so a 144 Hz cursor does not
   * visibly stutter even though confirmation remains deterministic.
   */
  update(context: RenderContext): void {
    const kind = this.#kind;
    if (kind) this.#refreshPointer(kind);
    void context;
  }

  #refreshPointer(kind: BuildingKind): boolean {
    const pointer = this.input.pointer;
    this.#pointer.set(pointer.ndcX, pointer.ndcY);
    this.#raycaster.setFromCamera(this.#pointer, this.camera);
    if (!this.#raycaster.ray.intersectPlane(this.#groundPlane, this.#hit)) return false;

    const tile = this.world.grid.worldToTile(this.#hit.x, this.#hit.z);
    const definition = BUILDINGS[kind];
    const valid =
      this.world.grid.canPlace(
        tile.x,
        tile.z,
        definition.footprint.width,
        definition.footprint.depth,
      ) && !this.world.grid.hasFlag(tile.x, tile.z, TileFlag.Soil);

    if (tile.x !== this.#tileX || tile.z !== this.#tileZ || valid !== this.#valid) {
      this.#tileX = tile.x;
      this.#tileZ = tile.z;
      this.#valid = valid;
      this.events.emit('placement:moved', { kind, tileX: tile.x, tileZ: tile.z, valid });
    }
    return valid;
  }
}
