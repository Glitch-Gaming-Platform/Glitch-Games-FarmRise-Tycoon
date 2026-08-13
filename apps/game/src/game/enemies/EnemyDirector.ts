/**
 * Spawns and retires foxes in response to a raid incident.
 *
 * The director is the only thing that creates enemies, so "when does a threat
 * appear?" has exactly one answer to read. It listens to the IncidentDirector
 * rather than rolling its own timers, and takes its RNG explicitly because a
 * site no longer owns a random stream - the career does, split by system.
 */
import type { Rng } from '@farmrise/shared';
import type { PhysicsPort } from '@engine/physics/PhysicsPort.js';
import type { FixedUpdateContext } from '@engine/core/types.js';
import { EventBus } from '@engine/core/EventBus.js';
import type { FarmWorld } from '../world/FarmWorld.js';
import type { IncidentDirector } from '../events/IncidentDirector.js';
import type { Player } from '../player/Player.js';
import { Fox } from './Fox.js';

export interface EnemyDirectorEvents extends Record<string, unknown> {
  'enemy:spawned': { count: number };
  'enemy:scared-off': { remaining: number };
  'enemy:dog-defended': { count: number; shelterId: string };
  'enemy:raid-succeeded': { losses: number };
}

/** Fox travel speed, in m/s. See the call site for why it is not 4. */
const FOX_SPEED = 1.3;

export class EnemyDirector {
  readonly events = new EventBus<EnemyDirectorEvents>();
  readonly #foxes: Fox[] = [];
  readonly #dogInterceptionsUsed = new Map<string, number>();
  #nextFoxId = 0;

  constructor(
    private readonly world: FarmWorld,
    private readonly player: Player,
    private readonly physics: PhysicsPort,
    private readonly rng: Rng,
    incidents: IncidentDirector,
  ) {
    incidents.events.on('incident:impact', ({ instance, definition }) => {
      if (definition.id !== 'incident-fox-raid') return;
      // A mitigated raid still shows up, with fewer of them: the player should
      // see that driving the animals in worked, not that nothing happened.
      const mitigated = instance.responseProgress > 0;
      const spawned = this.#spawnRaid(instance.id, mitigated ? 1 : 3, instance.targetIds);
      this.#applyDogDefense(spawned);
      const activeSpawned = spawned.filter((fox) => fox.state !== 'gone').length;
      this.#prune();
      if (activeSpawned > 0) this.events.emit('enemy:spawned', { count: activeSpawned });
    });
    incidents.events.on('incident:resolved', ({ instance, definition }) => {
      if (definition.id === 'incident-fox-raid') this.#retireRaid(instance.id);
    });
  }

  get foxes(): readonly Fox[] {
    return this.#foxes;
  }

  fixedUpdate(context: FixedUpdateContext): void {
    if (this.#foxes.length === 0) return;
    this.#applyDogDefense(this.#foxes);
    this.#prune();
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
        if (fox.targetGroupId) losses += this.world.livestock.removeTo(fox.targetGroupId, 1);
      }
    }

    if (losses > 0) {
      this.events.emit('enemy:raid-succeeded', { losses });
    }

    this.#prune();
  }

  #spawnRaid(raidId: string, count: number, targetIds: readonly string[]): Fox[] {
    const targets = targetIds
      .map((id) => this.world.livestock.get(id))
      .filter((group) => group !== undefined && this.world.livestock.isPredatorTarget(group.id));
    if (targets.length === 0) return [];
    const halfWidth = (this.world.grid.width * this.world.grid.tileSize) / 2;
    const spawned: Fox[] = [];

    for (let i = 0; i < count; i += 1) {
      const target = targets[i % targets.length];
      if (!target) continue;
      const shelter = this.world.shelters.doorPoint(target.shelterId);
      // Foxes come in from the map edge so the player sees them arrive.
      const angle = this.rng.next() * Math.PI * 2;
      this.#foxes.push(
        new Fox(
          Math.cos(angle) * halfWidth * 0.95,
          Math.sin(angle) * halfWidth * 0.95,
          shelter,
          // Scaled with the player's movement speed (see Player.ts). A fox at
          // 38% of a sprint is the same chase it has always been; leaving it at
          // 4 m/s after the player slowed down would have made a raid
          // impossible to intercept.
          FOX_SPEED,
          180,
          `fox-${this.#nextFoxId++}`,
          target.id,
          raidId,
          target.shelterId,
        ),
      );
      spawned.push(this.#foxes[this.#foxes.length - 1]!);
    }
    return spawned;
  }

  #applyDogDefense(foxes: readonly Fox[]): void {
    const defendedByShelter = new Map<string, number>();
    for (const fox of foxes) {
      if ((fox.state !== 'approaching' && fox.state !== 'raiding') || !fox.targetShelterId) {
        continue;
      }
      const capacity = this.world.livestock.foxProtectionAt(fox.targetShelterId);
      const key = `${fox.raidId}:${fox.targetShelterId}`;
      const used = this.#dogInterceptionsUsed.get(key) ?? 0;
      if (used >= capacity) continue;
      this.#dogInterceptionsUsed.set(key, used + 1);
      fox.state = 'gone';
      defendedByShelter.set(
        fox.targetShelterId,
        (defendedByShelter.get(fox.targetShelterId) ?? 0) + 1,
      );
    }
    for (const [shelterId, count] of defendedByShelter) {
      this.events.emit('enemy:dog-defended', { shelterId, count });
    }
  }

  #retireRaid(raidId: string): void {
    for (const fox of this.#foxes) {
      if (fox.raidId === raidId) fox.state = 'gone';
    }
    for (const key of this.#dogInterceptionsUsed.keys()) {
      if (key.startsWith(`${raidId}:`)) this.#dogInterceptionsUsed.delete(key);
    }
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
