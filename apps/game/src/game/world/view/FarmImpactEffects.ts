/**
 * Local incident and fox response.
 *
 * Incidents that name a place produce feedback at that place: small pooled
 * bursts/rings on every tier and at most three non-shadowing point lights on
 * Ultra. Nothing here changes exposure, grade or camera motion, so an incident
 * cannot turn into a full-screen gimmick or compete with the sun.
 */
import * as THREE from 'three';
import type { RenderContext } from '@engine/core/types.js';
import type { RenderPipeline } from '@engine/render/RenderPipeline.js';
import { BUILDINGS, type IncidentInstance } from '@farmrise/shared';
import type { Player } from '../../player/Player.js';
import type { FarmWorld } from '../FarmWorld.js';
import { PooledWorldEffects } from './PooledWorldEffects.js';

type IncidentPhase = 'none' | 'warning' | 'active';
export type FoxImpactKind = 'raid' | 'flee' | 'loss';

const TARGET_CAPACITY = 8;
const LIGHT_CAPACITY = 3;

export class FarmImpactEffects {
  readonly object = new THREE.Group();
  readonly #effects = new PooledWorldEffects(84, 18);
  readonly #targets = Array.from({ length: TARGET_CAPACITY }, () => new THREE.Vector3());
  readonly #lights: THREE.PointLight[] = [];
  #targetCount = 0;
  #incidentId: string | null = null;
  #incidentPhase: IncidentPhase = 'none';
  #responseProgress = 0;
  #incidentColour = 0xe0bc6a;

  constructor(pipeline: RenderPipeline | null) {
    this.object.name = 'FarmImpactEffects';
    this.object.add(this.#effects.object);
    if (pipeline?.active) {
      for (let index = 0; index < LIGHT_CAPACITY; index += 1) {
        const light = new THREE.PointLight(0xe0bc6a, 0, 3.5, 2);
        light.name = `IncidentResponseLight_${index}`;
        light.castShadow = false;
        this.#lights.push(light);
        this.object.add(light);
      }
    }
  }

  get activeParticleCount(): number {
    return this.#effects.activeParticleCount;
  }

  syncIncident(
    world: FarmWorld,
    incident: IncidentInstance | null,
    player: Player | null,
    context: RenderContext,
  ): void {
    const phase: IncidentPhase = incident
      ? incident.appliedMultiplier === null
        ? 'warning'
        : 'active'
      : 'none';
    const changedIncident = incident?.id !== this.#incidentId;
    const changedPhase = phase !== this.#incidentPhase;

    if (incident) {
      this.#incidentColour = incidentColour(incident.definitionId);
      this.#resolveTargets(world, incident, player);
      if (changedIncident) {
        this.#emitIncidentBeat(phase === 'active' ? 'active' : 'warning');
      } else if (changedPhase && phase === 'active') {
        this.#emitIncidentBeat('active');
      } else if (incident.responseProgress > this.#responseProgress) {
        this.#emitResponseBeat();
      }
      this.#responseProgress = incident.responseProgress;
    } else {
      this.#targetCount = 0;
      this.#responseProgress = 0;
    }

    this.#incidentId = incident?.id ?? null;
    this.#incidentPhase = phase;
    this.#effects.update(context.deltaSeconds);
    this.#syncLights(context.elapsedSeconds);
  }

  triggerFoxImpact(x: number, z: number, kind: FoxImpactKind): void {
    const loss = kind === 'loss';
    const flee = kind === 'flee';
    const colour = loss ? 0xf05a67 : flee ? 0x83c4d1 : 0xd0602a;
    this.#effects.emitBurst({
      x,
      y: loss ? 0.34 : 0.08,
      z,
      count: loss ? 16 : flee ? 10 : 12,
      radius: loss ? 0.42 : 0.26,
      speed: loss ? 0.74 : 0.52,
      lift: loss ? 0.72 : 0.5,
      duration: loss ? 0.9 : 0.68,
      size: loss ? 0.72 : 0.56,
      gravity: loss ? 1.1 : 0.72,
      drag: 1.2,
      flatten: flee ? 0.4 : 0.72,
      colours: loss
        ? [0xf05a67, 0xf5ebdc, 0xd0602a]
        : flee
          ? [0x83c4d1, 0xede7da]
          : [0xd0602a, 0xb9603a, 0xe0bc6a],
      seed: x * 0.17 + z * 0.23,
    });
    this.#effects.emitRing({
      x,
      y: 0.045,
      z,
      duration: loss ? 0.78 : 0.6,
      startRadius: 0.18,
      endRadius: loss ? 1.5 : 1.05,
      colour,
    });
  }

  dispose(): void {
    this.#effects.dispose();
    for (const light of this.#lights) light.removeFromParent();
    this.#lights.length = 0;
    this.object.removeFromParent();
    this.object.clear();
  }

  #emitIncidentBeat(phase: Exclude<IncidentPhase, 'none'>): void {
    for (let index = 0; index < this.#targetCount; index += 1) {
      const target = this.#targets[index]!;
      const active = phase === 'active';
      this.#effects.emitRing({
        x: target.x,
        y: 0.05,
        z: target.z,
        duration: active ? 0.76 : 1.08,
        startRadius: active ? 0.18 : 0.32,
        endRadius: active ? 1.52 : 1.18,
        colour: this.#incidentColour,
      });
      this.#effects.emitBurst({
        x: target.x,
        y: active ? 0.16 : 0.06,
        z: target.z,
        count: active ? 12 : 6,
        radius: active ? 0.34 : 0.22,
        speed: active ? 0.48 : 0.24,
        lift: active ? 0.56 : 0.28,
        duration: active ? 0.86 : 0.68,
        size: active ? 0.66 : 0.42,
        gravity: active ? 0.74 : 0.34,
        drag: active ? 1.35 : 1.9,
        flatten: 0.65,
        colours: [this.#incidentColour, incidentSecondaryColour(this.#incidentColour)],
        seed: target.x * 0.19 + target.z * 0.11 + index,
      });
    }
  }

  #emitResponseBeat(): void {
    for (let index = 0; index < this.#targetCount; index += 1) {
      const target = this.#targets[index]!;
      this.#effects.emitRing({
        x: target.x,
        y: 0.052,
        z: target.z,
        duration: 0.58,
        startRadius: 0.16,
        endRadius: 0.88,
        colour: 0x83c4d1,
      });
    }
  }

  #resolveTargets(world: FarmWorld, incident: IncidentInstance, player: Player | null): void {
    this.#targetCount = 0;
    for (const targetId of incident.targetIds) {
      if (this.#targetCount >= TARGET_CAPACITY) break;
      const target = this.#targets[this.#targetCount]!;
      let resolved = false;

      const plot = world.plotPlacement(targetId);
      if (plot) {
        target.set(tileCenterX(world, plot.tileX), 0.05, tileCenterZ(world, plot.tileZ));
        resolved = true;
      }

      if (!resolved) {
        const building = world.structures.get(targetId);
        if (building) {
          const definition = BUILDINGS[building.kind].footprint;
          target.set(
            structureCenterX(world, building.tileX, definition.width),
            0.05,
            structureCenterZ(world, building.tileZ, definition.depth),
          );
          resolved = true;
        }
      }

      if (!resolved) {
        const store = world.stores.get(targetId);
        if (store) {
          target.set(tileCenterX(world, store.tileX), 0.05, tileCenterZ(world, store.tileZ));
          resolved = true;
        }
      }

      if (!resolved && targetId === 'carried' && player) {
        target.set(player.position.x, 0.05, player.position.z);
        resolved = true;
      }

      if (!resolved && incident.definitionId === 'incident-fox-raid') {
        target.set(
          tileCenterX(world, world.level.shelter.tileX),
          0.05,
          tileCenterZ(world, world.level.shelter.tileZ),
        );
        resolved = true;
      }

      if (!resolved && incident.definitionId === 'incident-blocked-road') {
        const loadingPad = world.completedBuildings('loading_pad')[0];
        if (loadingPad) {
          target.set(
            tileCenterX(world, loadingPad.tileX),
            0.05,
            tileCenterZ(world, loadingPad.tileZ),
          );
          resolved = true;
        }
      }

      if (resolved) this.#targetCount += 1;
    }
  }

  #syncLights(elapsedSeconds: number): void {
    const visible = Math.min(this.#targetCount, this.#lights.length);
    for (let index = 0; index < visible; index += 1) {
      const light = this.#lights[index]!;
      const target = this.#targets[index]!;
      light.position.set(target.x, 0.72, target.z);
      light.color.setHex(this.#incidentColour);
      const active = this.#incidentPhase === 'active';
      const pulse = Math.sin(elapsedSeconds * 1.7 + index * 1.3) * 0.5 + 0.5;
      light.intensity = active ? 0.16 + pulse * 0.045 : 0.08 + pulse * 0.025;
      light.distance = active ? 3.6 : 2.9;
    }
    for (let index = visible; index < this.#lights.length; index += 1) {
      this.#lights[index]!.intensity = 0;
    }
  }
}

function incidentColour(definitionId: string): number {
  switch (definitionId) {
    case 'incident-drought':
      return 0xe6c85d; // ground_scrub_sun
    case 'incident-fox-raid':
      return 0xd0602a; // fox_body
    case 'incident-cart-axle':
    case 'incident-blocked-road':
      return 0xb9603a; // soil_dry
    case 'incident-blight':
      return 0x8a7b4a; // diseased
    case 'incident-processor-breakdown':
      return 0xf28a38; // carrot_body, the palette's restrained warning orange
    case 'incident-cold-snap':
      return 0xa7d7e8; // sky_haze
    default:
      return 0xe0bc6a; // straw_hat
  }
}

function incidentSecondaryColour(primary: number): number {
  if (primary === 0xa7d7e8) return 0xede7da; // trim_white
  if (primary === 0x8a7b4a) return 0x79c74d; // crop_leaf_light
  return 0xc9b896; // sand_path
}

function tileCenterX(world: FarmWorld, tileX: number): number {
  return (tileX - world.grid.width / 2 + 0.5) * world.grid.tileSize;
}

function tileCenterZ(world: FarmWorld, tileZ: number): number {
  return (tileZ - world.grid.depth / 2 + 0.5) * world.grid.tileSize;
}

function structureCenterX(world: FarmWorld, tileX: number, width: number): number {
  return (tileX - world.grid.width / 2 + width / 2) * world.grid.tileSize;
}

function structureCenterZ(world: FarmWorld, tileZ: number, depth: number): number {
  return (tileZ - world.grid.depth / 2 + depth / 2) * world.grid.tileSize;
}
