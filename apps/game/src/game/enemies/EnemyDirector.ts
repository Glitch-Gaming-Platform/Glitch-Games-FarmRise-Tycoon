/**
 * Spawns and retires foxes in response to farm events.
 *
 * The director is the only thing that creates enemies, so "when does a threat
 * appear?" has exactly one answer to read. It listens to the EventDirector
 * rather than rolling its own timers.
 */
import type { PhysicsPort } from '@engine/physics/PhysicsPort.js';
import type { FixedUpdateContext } from '@engine/core/types.js';
import { EventBus } from '@engine/core/EventBus.js';
import type { FarmWorld } from '../world/FarmWorld.js';
import type { EventDirector } from '../events/EventDirector.js';
import type { Player } from '../player/Player.js';
import { Fox } from './Fox.js';
import { shelterDoorPoint } from '../world/collisionProfiles.js';

export interface EnemyDirectorEvents extends Record<string, unknown> {
  'enemy:spawned': { count: number };
  'enemy:scared-off': { remaining: number };
  'enemy:raid-succeeded': { losses: number };
}

export class EnemyDirector {
  readonly events = new EventBus<EnemyDirectorEvents>();
  readonly #foxes: Fox[] = [];
  #nextFoxId = 0;

  constructor(
    private readonly world: FarmWorld,
    private readonly player: Player,
    private readonly physics: PhysicsPort,
    eventDirector: EventDirector,
  ) {
    eventDirector.events.on('event:started', ({ kind, mitigated }) => {
      if (kind === 'fox_raid') this.#spawnRaid(mitigated ? 1 : 3);
    });
    eventDirector.events.on('event:ended', ({ kind }) => {
      if (kind === 'fox_raid') this.#retireAll();
    });
  }

  get foxes(): readonly Fox[] {
    return this.#foxes;
  }

  fixedUpdate(context: FixedUpdateContext): void {
    if (this.#foxes.length === 0) return;
    let losses = 0;

    for (const fox of this.#foxes) {
      const before = fox.state;
      fox.fixedUpdate(this.physics, context.stepSeconds, this.player.position);
      if (before !== 'fleeing' && fox.state === 'fleeing') {
        this.events.emit('enemy:scared-off', { remaining: this.#activeCount() });
      }
      if (fox.succeeded) {
        fox.state = 'gone';
        losses += 1;
      }
    }

    if (losses > 0) {
      for (const group of this.world.animals) {
        group.count = Math.max(0, group.count - losses);
      }
      this.events.emit('enemy:raid-succeeded', { losses });
    }

    this.#prune();
  }

  #spawnRaid(count: number): void {
    const shelter = shelterDoorPoint(
      this.world.grid,
      this.world.level.shelter.tileX,
      this.world.level.shelter.tileZ,
    );
    const halfWidth = (this.world.grid.width * this.world.grid.tileSize) / 2;

    for (let i = 0; i < count; i += 1) {
      // Foxes come in from the map edge so the player sees them arrive.
      const angle = this.world.rng.next() * Math.PI * 2;
      this.#foxes.push(
        new Fox(
          Math.cos(angle) * halfWidth * 0.95,
          Math.sin(angle) * halfWidth * 0.95,
          shelter,
          4,
          180,
          `fox-${this.#nextFoxId++}`,
        ),
      );
    }
    this.events.emit('enemy:spawned', { count });
  }

  #retireAll(): void {
    for (const fox of this.#foxes) fox.state = 'gone';
    this.#prune();
  }

  #activeCount(): number {
    return this.#foxes.filter((fox) => fox.state !== 'gone').length;
  }

  #prune(): void {
    for (let i = this.#foxes.length - 1; i >= 0; i -= 1) {
      if (this.#foxes[i]?.state === 'gone') this.#foxes.splice(i, 1);
    }
  }
}
