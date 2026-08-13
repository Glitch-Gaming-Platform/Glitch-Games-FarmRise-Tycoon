import { describe, expect, it, vi } from 'vitest';
import { STARTER_SHELTER_ID, getIncident, type IncidentInstance } from '@farmrise/shared';
import { EnemyDirector } from '@game/enemies/EnemyDirector.js';
import { IncidentDirector } from '@game/events/IncidentDirector.js';
import { Player } from '@game/player/Player.js';
import { makeCareer } from '../helpers/career.js';

function foxRaid(
  siteId: string,
  targetIds: readonly string[],
  id = 'incident-fox-test',
): IncidentInstance {
  return {
    id,
    definitionId: 'incident-fox-raid',
    siteId,
    severity: 'minor',
    warnedTick: 0,
    impactTick: 1,
    endsTick: 2,
    targetIds: [...targetIds],
    responseKind: null,
    responseProgress: 0,
    resolved: false,
    appliedMultiplier: null,
  };
}

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
    const instance = foxRaid(world.id, ['animals-cows'], 'incident-target-cows');
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

  it('protects only the shelter where the dog lives', () => {
    const career = makeCareer();
    const world = career.world;
    world.structures.add({
      id: 'shelter-remote',
      kind: 'animal_shelter',
      tileX: 20,
      tileZ: 18,
      rotation: 0,
      remainingBuildTicks: 0,
      broken: false,
    });
    world.livestock.hydrate([
      {
        id: 'animals-starter',
        species: 'chicken',
        shelterId: STARTER_SHELTER_ID,
        count: 6,
        cycleTicks: 0,
        tileX: world.level.shelter.tileX,
        tileZ: world.level.shelter.tileZ,
        sheltered: false,
      },
      {
        id: 'dog-starter',
        species: 'dog',
        shelterId: STARTER_SHELTER_ID,
        count: 1,
        cycleTicks: 0,
        tileX: world.level.shelter.tileX,
        tileZ: world.level.shelter.tileZ,
        sheltered: false,
      },
      {
        id: 'animals-remote',
        species: 'chicken',
        shelterId: 'shelter-remote',
        count: 6,
        cycleTicks: 0,
        tileX: 20,
        tileZ: 18,
        sheltered: false,
      },
    ]);
    const incidents = new IncidentDirector(career);
    const enemies = new EnemyDirector(
      world,
      new Player(0, 0),
      world.physics,
      career.rng('incidents'),
      incidents,
    );
    const raid = getIncident('incident-fox-raid')!;
    const defended = vi.fn();
    enemies.events.on('enemy:dog-defended', defended);

    incidents.events.emit('incident:impact', {
      instance: foxRaid(world.id, ['animals-starter', 'animals-remote']),
      definition: raid,
    });

    expect(defended).toHaveBeenCalledWith({ count: 2, shelterId: STARTER_SHELTER_ID });
    expect(enemies.foxes).toHaveLength(1);
    expect(enemies.foxes[0]?.targetGroupId).toBe('animals-remote');
  });

  it('caps one dog at ten fox interceptions within the same raid', () => {
    const career = makeCareer();
    const world = career.world;
    world.livestock.hydrate([
      {
        id: 'animals-hens',
        species: 'chicken',
        shelterId: STARTER_SHELTER_ID,
        count: 20,
        cycleTicks: 0,
        tileX: world.level.shelter.tileX,
        tileZ: world.level.shelter.tileZ,
        sheltered: false,
      },
      {
        id: 'dog-starter',
        species: 'dog',
        shelterId: STARTER_SHELTER_ID,
        count: 1,
        cycleTicks: 0,
        tileX: world.level.shelter.tileX,
        tileZ: world.level.shelter.tileZ,
        sheltered: false,
      },
    ]);
    const incidents = new IncidentDirector(career);
    const enemies = new EnemyDirector(
      world,
      new Player(0, 0),
      world.physics,
      career.rng('incidents'),
      incidents,
    );
    const raid = getIncident('incident-fox-raid')!;
    const defended: number[] = [];
    enemies.events.on('enemy:dog-defended', ({ count }) => defended.push(count));
    const instance = foxRaid(world.id, ['animals-hens'], 'large-raid');

    for (let wave = 0; wave < 4; wave += 1) {
      incidents.events.emit('incident:impact', { instance, definition: raid });
    }

    expect(defended.reduce((sum, count) => sum + count, 0)).toBe(10);
    expect(enemies.foxes).toHaveLength(2);
  });

  it('lets a dog bought after impact defend the remaining approaching foxes', () => {
    const career = makeCareer();
    const world = career.world;
    const incidents = new IncidentDirector(career);
    const enemies = new EnemyDirector(
      world,
      new Player(0, 0),
      world.physics,
      career.rng('incidents'),
      incidents,
    );
    const raid = getIncident('incident-fox-raid')!;
    const hens = world.livestock.groups.find((group) => group.species === 'chicken')!;
    const beforeHens = hens.count;

    incidents.events.emit('incident:impact', {
      instance: foxRaid(world.id, [hens.id], 'late-dog-raid'),
      definition: raid,
    });
    expect(enemies.foxes).toHaveLength(3);

    world.livestock.add('dog', 1, world.shelters.get(STARTER_SHELTER_ID)!);
    enemies.fixedUpdate({ tick: 1, stepSeconds: 1 / 60 });

    expect(enemies.foxes).toHaveLength(0);
    expect(world.livestock.get(hens.id)?.count).toBe(beforeHens);
  });

  it('never treats a guardian dog as fox prey', () => {
    const career = makeCareer();
    const world = career.world;
    world.livestock.hydrate([
      {
        id: 'dog-only',
        species: 'dog',
        shelterId: STARTER_SHELTER_ID,
        count: 1,
        cycleTicks: 0,
        tileX: world.level.shelter.tileX,
        tileZ: world.level.shelter.tileZ,
        sheltered: false,
      },
    ]);
    const incidents = new IncidentDirector(career);
    const enemies = new EnemyDirector(
      world,
      new Player(0, 0),
      world.physics,
      career.rng('incidents'),
      incidents,
    );

    incidents.events.emit('incident:impact', {
      instance: foxRaid(world.id, ['dog-only']),
      definition: getIncident('incident-fox-raid')!,
    });

    expect(enemies.foxes).toHaveLength(0);
    expect(world.livestock.incidentCandidates()).toEqual([]);
  });
});
