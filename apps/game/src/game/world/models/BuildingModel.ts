/**
 * Structures: what is built, what is still going up, and what each one does.
 *
 * Buildings gained a stable id here. A building that can break down, hold
 * stock, house a worker and run a processing queue cannot be addressed by the
 * tile it stands on, because every one of those things outlives a move
 * (docs/PROGRESSION_GAMEPLAY_PLAN.md §33.3).
 */
import {
  BARN_CAPACITY_UNITS,
  BASE_STORAGE_UNITS,
  COLD_STORE_CAPACITY_UNITS,
  LOADING_PAD_CAPACITY,
  animalShelterProductDropTile,
  buildingFootprint,
  normalizeBuildingRotation,
  upkeepForTicks,
  type BuildingKind,
  type BuildingRotation,
} from '@farmrise/shared';
import { EventBus } from '@engine/core/EventBus.js';
import { TileFlag, type TileGrid } from '@engine/physics/TileGrid.js';
import { addBuildingCollision } from '../collisionProfiles.js';

export interface PlacedBuilding {
  readonly id: string;
  readonly kind: BuildingKind;
  readonly tileX: number;
  readonly tileZ: number;
  rotation: BuildingRotation;
  remainingBuildTicks: number;
  broken: boolean;
}

export interface BuildingModelEvents extends Record<string, unknown> {
  'building:placed': { id: string; kind: BuildingKind; tileX: number; tileZ: number };
  'building:completed': { id: string; kind: BuildingKind; tileX: number; tileZ: number };
  'building:broken': { id: string; kind: BuildingKind };
  'building:repaired': { id: string; kind: BuildingKind };
}

/** Storage a completed building contributes, or zero if it stores nothing. */
export function storageContribution(kind: BuildingKind): number {
  if (kind === 'barn') return BARN_CAPACITY_UNITS;
  if (kind === 'cold_store') return COLD_STORE_CAPACITY_UNITS;
  if (kind === 'loading_pad') return LOADING_PAD_CAPACITY;
  return 0;
}

export class BuildingModel {
  readonly events = new EventBus<BuildingModelEvents>();
  #buildings: PlacedBuilding[] = [];
  #nextId = 1;

  constructor(private readonly grid: TileGrid) {}

  get buildings(): readonly PlacedBuilding[] {
    return this.#buildings;
  }

  get(id: string): PlacedBuilding | undefined {
    return this.#buildings.find((building) => building.id === id);
  }

  at(tileX: number, tileZ: number): PlacedBuilding | undefined {
    return this.#buildings.find((building) => {
      const footprint = buildingFootprint(building.kind, building.rotation);
      return (
        tileX >= building.tileX &&
        tileX < building.tileX + footprint.width &&
        tileZ >= building.tileZ &&
        tileZ < building.tileZ + footprint.depth
      );
    });
  }

  /** Nearest footprint edge, so solid buildings remain usable from outside their walls. */
  nearest(
    tileX: number,
    tileZ: number,
    maxTiles: number,
    include: (building: PlacedBuilding) => boolean = () => true,
  ): PlacedBuilding | undefined {
    let nearest: PlacedBuilding | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const building of this.#buildings) {
      if (!include(building)) continue;
      const footprint = buildingFootprint(building.kind, building.rotation);
      const minX = building.tileX;
      const maxX = building.tileX + footprint.width - 1;
      const minZ = building.tileZ;
      const maxZ = building.tileZ + footprint.depth - 1;
      const dx = tileX < minX ? minX - tileX : tileX > maxX ? tileX - maxX : 0;
      const dz = tileZ < minZ ? minZ - tileZ : tileZ > maxZ ? tileZ - maxZ : 0;
      const distance = dx + dz;
      if (
        distance > maxTiles ||
        distance > nearestDistance ||
        (distance === nearestDistance && nearest && building.id >= nearest.id)
      ) {
        continue;
      }
      nearest = building;
      nearestDistance = distance;
    }
    return nearest;
  }

  completed(kind?: BuildingKind): PlacedBuilding[] {
    return this.#buildings.filter(
      (building) => building.remainingBuildTicks <= 0 && (!kind || building.kind === kind),
    );
  }

  nextId(prefix = 'building'): string {
    const id = `${prefix}-${this.#nextId}`;
    this.#nextId += 1;
    return id;
  }

  add(building: PlacedBuilding): void {
    building.rotation = normalizeBuildingRotation(building.rotation);
    this.#buildings.push(building);
    // The footprint is reserved immediately, so two builds cannot claim the
    // same tiles while the first is still under construction.
    this.applyToGrid(building);
    this.#nextId = Math.max(this.#nextId, extractNumber(building.id) + 1);
    this.events.emit('building:placed', {
      id: building.id,
      kind: building.kind,
      tileX: building.tileX,
      tileZ: building.tileZ,
    });
  }

  /** Advances construction. Returns the buildings that finished this step. */
  advance(dtTicks: number): readonly PlacedBuilding[] {
    const finished: PlacedBuilding[] = [];
    for (const building of this.#buildings) {
      if (building.remainingBuildTicks <= 0) continue;
      building.remainingBuildTicks = Math.max(0, building.remainingBuildTicks - dtTicks);
      if (building.remainingBuildTicks === 0) {
        finished.push(building);
        this.events.emit('building:completed', {
          id: building.id,
          kind: building.kind,
          tileX: building.tileX,
          tileZ: building.tileZ,
        });
      }
    }
    return finished;
  }

  /** Upkeep owed for a span of ticks, as a float so the remainder can be carried. */
  upkeepFor(dtTicks: number): number {
    const kinds = this.completed().map((building) => building.kind);
    return kinds.length === 0 ? 0 : upkeepForTicks(kinds, dtTicks);
  }

  anyInProgress(): boolean {
    return this.#buildings.some((building) => building.remainingBuildTicks > 0);
  }

  setBroken(id: string, broken: boolean): void {
    const building = this.get(id);
    if (!building || building.broken === broken) return;
    building.broken = broken;
    this.events.emit(broken ? 'building:broken' : 'building:repaired', {
      id: building.id,
      kind: building.kind,
    });
  }

  /** Storage capacity from every completed building, plus the yard baseline. */
  storageCapacity(): number {
    return (
      BASE_STORAGE_UNITS +
      this.completed().reduce((sum, building) => sum + storageContribution(building.kind), 0)
    );
  }

  /** Tiles served by a completed irrigation point or well. */
  irrigatedTiles(): readonly { tileX: number; tileZ: number; radius: number }[] {
    return this.completed()
      .filter((building) => building.kind === 'irrigation' || building.kind === 'well')
      .map((building) => ({
        tileX: building.tileX,
        tileZ: building.tileZ,
        radius: building.kind === 'well' ? 6 : 1,
      }));
  }

  applyToGrid(building: PlacedBuilding): void {
    const footprint = buildingFootprint(building.kind, building.rotation);
    this.grid.fillRect(
      building.tileX,
      building.tileZ,
      footprint.width,
      footprint.depth,
      TileFlag.Occupied,
      true,
    );
    if (building.kind === 'road')
      this.grid.setFlag(building.tileX, building.tileZ, TileFlag.Road, true);
    if (building.kind === 'fence') {
      this.grid.setFlag(building.tileX, building.tileZ, TileFlag.Enclosed, true);
    }
    if (building.kind === 'animal_shelter') {
      const drop = animalShelterProductDropTile(building.tileX, building.tileZ, building.rotation);
      // Products wait outside the door on a walkable tile. Reserving it when
      // construction begins prevents a later building from hiding the basket.
      this.grid.setFlag(drop.tileX, drop.tileZ, TileFlag.Occupied, true);
    }
    addBuildingCollision(
      this.grid,
      building.kind,
      building.tileX,
      building.tileZ,
      building.rotation,
    );

    // Solid structures also block coarse pathfinding. Roads, pads and fences
    // are things you walk on or past, so they must not.
    if (BLOCKING_KINDS.has(building.kind)) {
      this.grid.fillRect(
        building.tileX,
        building.tileZ,
        footprint.width,
        footprint.depth,
        TileFlag.Blocked,
        true,
      );
    }
  }

  reapplyAll(): void {
    for (const building of this.#buildings) this.applyToGrid(building);
  }

  hydrate(buildings: readonly PlacedBuilding[]): void {
    this.#buildings = buildings.map((building) => ({
      ...building,
      rotation: normalizeBuildingRotation(building.rotation),
    }));
    for (const building of this.#buildings) {
      this.#nextId = Math.max(this.#nextId, extractNumber(building.id) + 1);
    }
    this.reapplyAll();
  }

  toSaveState(): PlacedBuilding[] {
    return this.#buildings.map((building) => ({ ...building }));
  }
}

const BLOCKING_KINDS = new Set<BuildingKind>([
  'barn',
  'animal_shelter',
  'cold_store',
  'worker_hut',
  'mill',
  'creamery',
  'preserve_kitchen',
]);

function extractNumber(id: string): number {
  const match = /(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
}
