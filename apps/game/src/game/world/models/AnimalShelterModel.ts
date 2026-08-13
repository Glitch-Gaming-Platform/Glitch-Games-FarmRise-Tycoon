/** Functional animal shelters: the inherited coop plus completed purchased shelters. */
import {
  STARTER_SHELTER_ID,
  animalShelterProductDropTile,
  buildingFootprint,
  shelterCapacitiesForBuildings,
  shelterCapacityForBuildings,
  type BuildingRotation,
} from '@farmrise/shared';
import type { TileGrid } from '@engine/physics/TileGrid.js';
import type { LevelDefinition } from '../levels/LevelDefinition.js';
import type { BuildingModel, PlacedBuilding } from './BuildingModel.js';

export interface AnimalShelterState {
  readonly id: string;
  readonly buildingId: string | null;
  readonly tileX: number;
  readonly tileZ: number;
  readonly rotation: BuildingRotation;
}

export class AnimalShelterModel {
  constructor(
    private readonly level: LevelDefinition,
    private readonly grid: TileGrid,
    private readonly buildings: BuildingModel,
  ) {}

  get(id: string): AnimalShelterState | undefined {
    if (id === STARTER_SHELTER_ID) return this.#starter();
    const building = this.buildings.get(id);
    return building && building.kind === 'animal_shelter' && building.remainingBuildTicks <= 0
      ? this.#fromBuilding(building)
      : undefined;
  }

  all(): readonly AnimalShelterState[] {
    return [
      this.#starter(),
      ...this.buildings.completed('animal_shelter').map((building) => this.#fromBuilding(building)),
    ];
  }

  /** Completed shelter nearest the purchase location, with a stable tie-break. */
  nearest(tileX: number, tileZ: number): AnimalShelterState {
    let best = this.#starter();
    let bestDistance = this.#distanceSquared(best, tileX, tileZ);
    for (const building of this.buildings.completed('animal_shelter')) {
      const candidate = this.#fromBuilding(building);
      const distance = this.#distanceSquared(candidate, tileX, tileZ);
      if (distance < bestDistance || (distance === bestDistance && candidate.id < best.id)) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** Nearest completed shelter that can hold the requested contiguous slots. */
  nearestWithSpace(
    tileX: number,
    tileZ: number,
    requiredSlots: number,
    usedSlotsAt: (shelterId: string) => number,
  ): AnimalShelterState | undefined {
    return [...this.all()]
      .sort((left, right) => {
        const distance =
          this.#distanceSquared(left, tileX, tileZ) - this.#distanceSquared(right, tileX, tileZ);
        return distance !== 0 ? distance : left.id.localeCompare(right.id);
      })
      .find((shelter) => this.capacityFor(shelter.id) - usedSlotsAt(shelter.id) >= requiredSlots);
  }

  capacity(): number {
    return shelterCapacityForBuildings(this.buildings.buildings);
  }

  capacityFor(id: string): number {
    return this.#capacities()[id] ?? 0;
  }

  worldPosition(id: string): { x: number; z: number } {
    const shelter = this.get(id) ?? this.#starter();
    if (shelter.buildingId === null) {
      return this.grid.tileToWorld(shelter.tileX, shelter.tileZ);
    }
    const footprint = buildingFootprint('animal_shelter', shelter.rotation);
    const origin = this.grid.tileToWorld(shelter.tileX, shelter.tileZ);
    return {
      x: origin.x + ((footprint.width - 1) * this.grid.tileSize) / 2,
      z: origin.z + ((footprint.depth - 1) * this.grid.tileSize) / 2,
    };
  }

  productDrop(id: string): { tileX: number; tileZ: number } {
    const shelter = this.get(id) ?? this.#starter();
    return shelter.buildingId === null
      ? this.level.animalProductDrop
      : animalShelterProductDropTile(shelter.tileX, shelter.tileZ, shelter.rotation);
  }

  doorPoint(id: string): { x: number; z: number } {
    const drop = this.productDrop(id);
    return this.grid.tileToWorld(drop.tileX, drop.tileZ);
  }

  allProductDrops(): readonly { tileX: number; tileZ: number }[] {
    return [
      this.level.animalProductDrop,
      ...this.buildings
        .completed('animal_shelter')
        .map((building) =>
          animalShelterProductDropTile(building.tileX, building.tileZ, building.rotation),
        ),
    ];
  }

  #starter(): AnimalShelterState {
    return {
      id: STARTER_SHELTER_ID,
      buildingId: null,
      tileX: this.level.shelter.tileX,
      tileZ: this.level.shelter.tileZ,
      rotation: 0,
    };
  }

  #fromBuilding(building: PlacedBuilding): AnimalShelterState {
    return {
      id: building.id,
      buildingId: building.id,
      tileX: building.tileX,
      tileZ: building.tileZ,
      rotation: building.rotation,
    };
  }

  #capacities(): Readonly<Record<string, number>> {
    return shelterCapacitiesForBuildings(this.buildings.buildings, {
      id: STARTER_SHELTER_ID,
      tileX: this.level.shelter.tileX,
      tileZ: this.level.shelter.tileZ,
    });
  }

  #distanceSquared(shelter: AnimalShelterState, tileX: number, tileZ: number): number {
    const footprint =
      shelter.buildingId === null
        ? { width: 1, depth: 1 }
        : buildingFootprint('animal_shelter', shelter.rotation);
    const centerX = shelter.tileX + (footprint.width - 1) / 2;
    const centerZ = shelter.tileZ + (footprint.depth - 1) / 2;
    return (centerX - tileX) ** 2 + (centerZ - tileZ) ** 2;
  }
}
