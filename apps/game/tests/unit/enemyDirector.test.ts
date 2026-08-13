import { describe, expect, it, vi } from 'vitest';
import { STARTER_SHELTER_ID, getIncident, type IncidentInstance } from '@farmrise/shared';
import { EnemyDirector } from '@game/enemies/EnemyDirector.js';
import { IncidentDirector } from '@game/events/IncidentDirector.js';
import { Player } from '@game/player/Player.js';
import { makeCareer } from '../helpers/career.js';

describe('EnemyDirector shelter targeting', () => {
  it('sends foxes to the incident group and removes animals only from that group', () => {
    const career = makeCareer();
    const world = career.world;
    world.livestock.hydrate([
      {
        id: 'animals-hens',
        species: 'chicken',
        shelterId: STARTER_SHELTER_ID,
        count: 2,
        cycleTicks: 0,
        tileX: world.level.shelter.tileX,
        tileZ: world.level.shelter.tileZ,
        sheltered: false,
      },
      {
        id: 'animals-cows',
        species: 'cow',
        shelterId: STARTER_SHELTER_ID,
        count: 1,
        cycleTicks: 0,
        tileX: world.level.shelter.tileX,
        tileZ: world.level.shelter.tileZ,
        sheltered: false,
      },
    ]);
    const incidents = new IncidentDirector(career);
    const player = new Player(0, 0);
    const enemies = new EnemyDirector(
      world,
      player,
      world.physics,
      career.rng('incidents'),
      incidents,
    );
    const raid = getIncident('incident-fox-raid');
    if (!raid) throw new Error('Missing fox raid definition.');
    const instance: IncidentInstance = {
      id: 'incident-target-cows',
      definitionId: raid.id,
      siteId: world.id,
      severity: 'minor',
      warnedTick: 0,
      impactTick: 1,
      endsTick: 2,
      targetIds: ['animals-cows'],
      responseKind: null,
      responseProgress: 0,
      resolved: false,
      appliedMultiplier: null,
    };
    const succeeded = vi.fn();
    enemies.events.on('enemy:raid-succeeded', succeeded);

    incidents.events.emit('incident:impact', { instance, definition: raid });
    expect(enemies.foxes).toHaveLength(3);
    expect(enemies.foxes.every((fox) => fox.targetGroupId === 'animals-cows')).toBe(true);

    const fox = enemies.foxes[0]!;
    fox.raidProgress = fox.raidTicks;
    enemies.fixedUpdate({ tick: 1, stepSeconds: 1 / 60 });

    expect(world.livestock.get('animals-cows')?.count).toBe(0);
    expect(world.livestock.get('animals-hens')?.count).toBe(2);
    expect(succeeded).toHaveBeenCalledWith({ losses: 1 });
  });
});
