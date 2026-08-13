import { describe, expect, it } from 'vitest';
import {
  BUILDING_KINDS,
  BUILDINGS,
  animalShelterProductDropTile,
  buildingFootprint,
  hasBuildingAccess,
  normalizeBuildingRotation,
  shelterCapacityForBuildings,
  shelterCapacitiesForBuildings,
  unlocksUpToStage,
  type BuildingKind,
  type BuildingRotation,
  type CareerStage,
} from '../src/index.js';

const EXPECTED_UNLOCK_STAGE: Readonly<Record<BuildingKind, CareerStage>> = {
  barn: 0,
  irrigation: 0,
  road: 0,
  fence: 0,
  animal_shelter: 1,
  water_trough: 0,
  loading_pad: 1,
  cold_store: 3,
  worker_hut: 3,
  well: 5,
  mill: 2,
  creamery: 2,
  preserve_kitchen: 2,
};

describe('building rotation', () => {
  it('normalizes arbitrary whole turns into the persisted quarter-turn range', () => {
    const cases: Array<[number, BuildingRotation]> = [
      [0, 0],
      [1, 1],
      [4, 0],
      [5, 1],
      [-1, 3],
      [Number.NaN, 0],
    ];

    for (const [input, expected] of cases) {
      expect(normalizeBuildingRotation(input)).toBe(expected);
    }
  });

  it('swaps non-square footprints on odd quarter-turns', () => {
    expect(buildingFootprint('loading_pad', 0)).toEqual({ width: 2, depth: 1 });
    expect(buildingFootprint('loading_pad', 1)).toEqual({ width: 1, depth: 2 });
    expect(buildingFootprint('loading_pad', 2)).toEqual({ width: 2, depth: 1 });
    expect(buildingFootprint('loading_pad', 3)).toEqual({ width: 1, depth: 2 });
    expect(buildingFootprint('barn', 1)).toEqual({ width: 2, depth: 2 });
  });
});

describe('animal-yard buildings', () => {
  it('prices and gates the shelter while keeping the trough always available', () => {
    expect(BUILDINGS.animal_shelter.buildCost).toBe(3_000);
    expect(BUILDINGS.animal_shelter.requiresUnlock).toBe('animal_shelters');
    expect(BUILDINGS.water_trough.buildCost).toBe(1_000);
    expect(BUILDINGS.water_trough.requiresUnlock).toBeNull();
  });

  it('rotates the reserved doorway tile around the 2x2 shelter footprint', () => {
    expect(animalShelterProductDropTile(10, 20, 0)).toEqual({ tileX: 11, tileZ: 22 });
    expect(animalShelterProductDropTile(10, 20, 1)).toEqual({ tileX: 12, tileZ: 20 });
    expect(animalShelterProductDropTile(10, 20, 2)).toEqual({ tileX: 10, tileZ: 19 });
    expect(animalShelterProductDropTile(10, 20, 3)).toEqual({ tileX: 9, tileZ: 21 });
  });

  it('counts only completed purchased shelters and fences toward capacity', () => {
    expect(
      shelterCapacityForBuildings([
        { kind: 'animal_shelter', remainingBuildTicks: 0 },
        { kind: 'animal_shelter', remainingBuildTicks: 1 },
        { kind: 'fence', remainingBuildTicks: 0 },
      ]),
    ).toBe(10);
  });

  it('assigns completed fence slots to the nearest completed shelter', () => {
    expect(
      shelterCapacitiesForBuildings(
        [
          {
            id: 'shelter-east',
            kind: 'animal_shelter',
            tileX: 20,
            tileZ: 20,
            remainingBuildTicks: 0,
          },
          {
            id: 'fence-east',
            kind: 'fence',
            tileX: 22,
            tileZ: 20,
            remainingBuildTicks: 0,
          },
          {
            id: 'fence-incomplete',
            kind: 'fence',
            tileX: 10,
            tileZ: 10,
            remainingBuildTicks: 1,
          },
        ],
        { id: 'shelter-starter', tileX: 5, tileZ: 5 },
      ),
    ).toEqual({ 'shelter-starter': 4, 'shelter-east': 6 });
  });
});

describe('building progression access', () => {
  it('accounts for every building and reveals it at its designed career stage', () => {
    expect(Object.keys(EXPECTED_UNLOCK_STAGE).sort()).toEqual([...BUILDING_KINDS].sort());

    for (const kind of BUILDING_KINDS) {
      for (let stage = 0; stage <= 5; stage += 1) {
        expect(
          hasBuildingAccess(kind, unlocksUpToStage(stage as CareerStage), []),
          `${kind} at stage ${stage}`,
        ).toBe(stage >= EXPECTED_UNLOCK_STAGE[kind]);
      }
    }
  });
});
