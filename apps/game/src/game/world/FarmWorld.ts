/**
 * One farm site: the land, and everything standing on it.
 *
 * FarmWorld used to hold all of the state and all of the evolution. Adding
 * hauling, processing, workers and utilities to that class would have produced
 * exactly the monolith docs/AI_INSTRUCTIONS.md forbids, so it is now a facade
 * over focused models and the owner of one thing they cannot own individually:
 * the order they tick in (docs/PROGRESSION_GAMEPLAY_PLAN.md §36).
 *
 * It still contains no Three.js, no DOM and no fetch, which is what lets the
 * entire simulation be unit-tested in Node and re-checked by the server.
 * Money is deliberately *not* here - a site does not have a wallet, a career
 * does - so advancing a site reports what it cost rather than paying for it.
 */
import {
  ANIMALS,
  FIELD_SPOILAGE_MULTIPLIER,
  STORED_SPOILAGE_MULTIPLIER,
  bedsForParcels,
  getItem,
  type AnimalSpecies,
  type FarmSiteSaveState,
  type Inventory,
  type PlotState,
  type Season,
  type SpecializationId,
} from '@farmrise/shared';
import { EventBus } from '@engine/core/EventBus.js';
import { GridPhysics } from '@engine/physics/GridPhysics.js';
import { TileFlag, TileGrid } from '@engine/physics/TileGrid.js';
import type { LevelDefinition } from './levels/LevelDefinition.js';
import { addShelterCollision } from './collisionProfiles.js';
import { ParcelModel } from './models/ParcelModel.js';
import { FieldModel } from './models/FieldModel.js';
import { BuildingModel, storageContribution, type PlacedBuilding } from './models/BuildingModel.js';
import { StoreModel, type StoreState } from './models/StoreModel.js';
import { AnimalModel } from './models/AnimalModel.js';
import { AnimalShelterModel } from './models/AnimalShelterModel.js';
import { ProcessingModel } from './models/ProcessingModel.js';
import { WorkerModel, type WorkBoard } from './models/WorkerModel.js';
import { CarryModel } from './models/CarryModel.js';

export type { PlacedBuilding } from './models/BuildingModel.js';

export interface SiteTickContext {
  readonly season: Season;
  readonly specialization: SpecializationId | null;
  readonly workBoard?: WorkBoard;
  /** Items temporarily protected from field spoilage by a guided lesson. */
  readonly protectedFieldItems?: readonly string[];
  /** Pauses the starter clutch until onboarding is ready to teach collection. */
  readonly animalProductionEnabled?: boolean;
  /** Species whose already-fed tutorial clutch may finish without consuming new feed. */
  readonly animalFeedWaiverSpecies?: readonly AnimalSpecies[];
}

/** What one tick of a site cost and produced. The career applies the money. */
export interface SiteTickReport {
  readonly upkeep: number;
  readonly wages: number;
  readonly completedBuildings: readonly PlacedBuilding[];
  /** Units completed by processor batches. Animal produce is intentionally excluded. */
  readonly processedUnits: number;
  readonly producedUnits: number;
  readonly spoiledUnits: number;
}

export interface FarmWorldEvents extends Record<string, unknown> {
  'world:plot-changed': { plotId: string };
  'world:plots-added': { plotIds: readonly string[] };
  'world:harvested': { plotId: string; itemId: string; quantity: number; carried: number };
  'world:building-placed': { kind: string; tileX: number; tileZ: number };
  'world:building-completed': { kind: string; tileX: number; tileZ: number };
  'world:animal-purchased': { species: AnimalSpecies; count: number };
  'world:animal-hungry': {
    species: AnimalSpecies;
    feedItemId: string;
    needed: number;
    available: number;
  };
  'world:animal-lost': { species: AnimalSpecies; count: number; remaining: number };
  'world:produce': { itemId: string; quantity: number };
  'world:stack-collected': { items: Inventory; total: number };
  'world:goods-spoiled': {
    storeId: string;
    items: Inventory;
    lost: number;
    emptied: boolean;
    inTheOpen: boolean;
  };
  'world:storage-full': { itemId: string; spilled: number };
  'world:parcel-acquired': { parcelId: string; displayName: string; bedCount: number };
  'world:carry-changed': { units: number; capacity: number };
}

export class FarmWorld {
  readonly id: string;
  readonly grid: TileGrid;
  readonly physics: GridPhysics;
  readonly events = new EventBus<FarmWorldEvents>();
  readonly level: LevelDefinition;

  readonly parcels: ParcelModel;
  readonly fields: FieldModel;
  readonly structures: BuildingModel;
  readonly stores: StoreModel;
  readonly livestock: AnimalModel;
  readonly shelters: AnimalShelterModel;
  readonly processing: ProcessingModel;
  readonly workforce: WorkerModel;
  readonly carry = new CarryModel();

  #tick = 0;
  #upkeepRemainder = 0;
  #wageRemainder = 0;

  constructor(level: LevelDefinition, ownedParcelIds: readonly string[], siteId: string) {
    this.id = siteId;
    this.level = level;
    this.grid = new TileGrid(level.grid.width, level.grid.depth, level.grid.tileSize);
    this.physics = new GridPhysics(this.grid, { roadMultiplier: 0.55 });

    this.#applyLevelToGrid();
    this.parcels = new ParcelModel(this.grid, ownedParcelIds);
    this.fields = new FieldModel(this.grid);
    this.structures = new BuildingModel(this.grid);
    this.stores = new StoreModel();
    this.livestock = new AnimalModel();
    this.shelters = new AnimalShelterModel(level, this.grid, this.structures);
    this.processing = new ProcessingModel();
    this.workforce = new WorkerModel();

    this.fields.addBeds(bedsForParcels(this.parcels.ownedIds));
    this.#bridgeEvents();

    for (const building of level.startingBuildings) {
      this.structures.add({
        id: this.structures.nextId(),
        kind: building.kind,
        tileX: building.tileX,
        tileZ: building.tileZ,
        rotation: 0,
        remainingBuildTicks: 0,
        broken: false,
      });
    }
    this.refreshIrrigation();
  }

  get tick(): number {
    return this.#tick;
  }

  get plots(): ReadonlyMap<string, PlotState> {
    return this.fields.plots;
  }

  get buildings(): readonly PlacedBuilding[] {
    return this.structures.buildings;
  }

  get animals(): readonly { species: AnimalSpecies; count: number }[] {
    return this.livestock.groups;
  }

  /** Everything the farm holds anywhere, for the market and milestone counts. */
  get inventory(): Inventory {
    return this.stores.combined();
  }

  /** Goods safely collected into a yard/building rather than left in a field pile. */
  get storedInventory(): Inventory {
    return this.stores.storedCombined();
  }

  get storageCapacity(): number {
    return this.stores.totalCapacity();
  }

  getPlot(plotId: string): PlotState | undefined {
    return this.fields.get(plotId);
  }

  plotPlacement(plotId: string) {
    return this.fields.placement(plotId);
  }

  setPlot(plotId: string, next: PlotState): void {
    this.fields.set(plotId, next);
  }

  readyPlotIds(): string[] {
    return this.fields.readyPlotIds();
  }

  completedBuildings(kind?: PlacedBuilding['kind']): PlacedBuilding[] {
    return this.structures.completed(kind);
  }

  /**
   * Advances the whole site by one fixed tick, in dependency order.
   *
   * Fields grow, construction finishes, machines run, animals eat, goods
   * spoil, and only then do workers look for something to do - so a worker
   * never picks up a crop that this tick's growth had not yet ripened.
   */
  advance(dtTicks: number, context: SiteTickContext): SiteTickReport {
    this.#tick += dtTicks;

    this.fields.advance(dtTicks, context.season);
    const completedBuildings = this.structures.advance(dtTicks);
    if (completedBuildings.length > 0) {
      this.refreshIrrigation();
      this.#syncStoresWithBuildings();
    }

    const batches = this.processing.advance(dtTicks, context.specialization, (buildingId) => {
      const building = this.structures.get(buildingId);
      if (!building) return undefined;
      return {
        kind: building.kind as never,
        tileX: building.tileX,
        tileZ: building.tileZ,
        broken: building.broken,
      };
    });

    let processedUnits = 0;
    let producedUnits = 0;
    for (const batch of batches) {
      for (const [itemId, quantity] of Object.entries(batch.items)) {
        processedUnits += quantity;
        producedUnits += quantity;
        this.depositNear(batch.tileX, batch.tileZ, itemId, quantity, 1);
        this.events.emit('world:produce', { itemId, quantity });
      }
    }

    const produce =
      context.animalProductionEnabled === false
        ? []
        : this.livestock.advance(
            dtTicks,
            {
              // Feed has to be carried home first. A crop still lying in a field
              // pile is not magically available to the animals at the shelter.
              available: (itemId) => this.stores.storedTotalOf(itemId),
              consume: (itemId, quantity) => {
                this.stores.withdrawStoredAnywhere(itemId, quantity);
              },
            },
            context.animalFeedWaiverSpecies,
          );
    for (const entry of produce) {
      producedUnits += entry.quantity;
      // This tile is reserved but walkable, so a crop or newly placed building
      // cannot hide the basket and the yard store cannot mask its interaction.
      const drop = this.shelters.productDrop(entry.shelterId);
      this.dropAt(drop.tileX, drop.tileZ, entry.itemId, entry.quantity, 1);
      // Emitting after the stack exists keeps an already-open market/HUD from
      // refreshing one operation too early and missing the new product.
      this.events.emit('world:produce', { itemId: entry.itemId, quantity: entry.quantity });
    }

    const spoiledUnits = this.stores.advance(
      dtTicks,
      STORED_SPOILAGE_MULTIPLIER,
      FIELD_SPOILAGE_MULTIPLIER,
      context.protectedFieldItems,
    );

    if (context.workBoard) this.workforce.advance(dtTicks, context.workBoard);

    const owedUpkeep = this.structures.upkeepFor(dtTicks) + this.#upkeepRemainder;
    const upkeep = Math.floor(owedUpkeep);
    this.#upkeepRemainder = owedUpkeep - upkeep;

    const owedWages = this.workforce.wagesFor(dtTicks) + this.#wageRemainder;
    const wages = Math.floor(owedWages);
    this.#wageRemainder = owedWages - wages;

    return { upkeep, wages, completedBuildings, processedUnits, producedUnits, spoiledUnits };
  }

  /**
   * Puts goods into the nearest store, or leaves them on the ground as a field
   * stack if there is nothing in range.
   *
   * A field stack is a real place with a real spoilage rate, which is what
   * makes "I will come back for it" a decision with a cost.
   */
  depositNear(
    tileX: number,
    tileZ: number,
    itemId: string,
    quantity: number,
    quality: number,
  ): void {
    const store = this.stores.nearest(tileX, tileZ, 3);
    if (store) {
      const { spilled } = this.stores.deposit(store.id, itemId, quantity, quality);
      if (spilled > 0) this.events.emit('world:storage-full', { itemId, spilled });
      return;
    }
    this.dropAt(tileX, tileZ, itemId, quantity, quality);
  }

  /** Leaves goods at an exact tile even when a store is nearby. */
  dropAt(tileX: number, tileZ: number, itemId: string, quantity: number, quality: number): void {
    const stackId = `stack-${tileX}-${tileZ}`;
    if (!this.stores.get(stackId)) {
      this.stores.add({
        id: stackId,
        buildingId: null,
        tileX,
        tileZ,
        capacity: 999,
        preserving: false,
        items: {},
        quality: {},
        spoilageRemainder: {},
      });
    }
    this.stores.deposit(stackId, itemId, quantity, quality);
  }

  /**
   * Repairs older saves that left eggs or milk inside the shelter or on another
   * unreachable ground tile. Collected products in storage are deliberately
   * untouched; only field baskets move to the reserved collection point.
   */
  relocateAnimalProductBaskets(): number {
    const drops = this.shelters.allProductDrops();
    const validDropIds = new Set(drops.map((drop) => `stack-${drop.tileX}-${drop.tileZ}`));
    let moved = 0;

    for (const store of [...this.stores.stores]) {
      if (!store.id.startsWith('stack-') || validDropIds.has(store.id)) continue;
      const shelter = this.shelters.nearest(store.tileX, store.tileZ);
      const drop = this.shelters.productDrop(shelter.id);
      for (const [itemId, quantity] of Object.entries(store.items)) {
        if (quantity <= 0 || getItem(itemId)?.category !== 'animal_product') continue;
        const withdrawn = this.stores.withdraw(store.id, itemId, quantity);
        if (!withdrawn.ok) continue;

        const items = { ...store.items };
        const quality = { ...store.quality };
        const spoilageRemainder = { ...store.spoilageRemainder };
        delete items[itemId];
        delete quality[itemId];
        delete spoilageRemainder[itemId];
        store.items = items;
        store.quality = quality;
        store.spoilageRemainder = spoilageRemainder;

        this.dropAt(drop.tileX, drop.tileZ, itemId, quantity, withdrawn.value.quality);
        moved += quantity;
      }
      if (!Object.values(store.items).some((quantity) => quantity > 0)) {
        this.stores.remove(store.id);
      }
    }

    return moved;
  }

  acquireParcel(parcelId: string): boolean {
    const parcel = this.parcels.acquire(parcelId);
    if (!parcel) return false;
    this.fields.addBeds([...parcel.beds]);
    this.structures.reapplyAll();
    this.events.emit('world:parcel-acquired', {
      parcelId: parcel.id,
      displayName: parcel.displayName,
      bedCount: parcel.beds.length,
    });
    return true;
  }

  /** Marks plots served by a completed irrigation point or well. */
  refreshIrrigation(): void {
    const sources = this.structures.irrigatedTiles();
    for (const [plotId, plot] of this.fields.plots) {
      const placement = this.fields.placement(plotId);
      if (!placement) continue;
      const irrigated = sources.some(
        (source) =>
          Math.abs(source.tileX - placement.tileX) <= source.radius &&
          Math.abs(source.tileZ - placement.tileZ) <= source.radius,
      );
      if (irrigated !== plot.irrigated) this.fields.set(plotId, { ...plot, irrigated });
    }
  }

  /** Shelter capacity comes from the inherited coop, purchased shelters and fencing. */
  shelterCapacity(): number {
    return this.shelters.capacity();
  }

  animalSlotsUsed(): number {
    return this.livestock.usedSlots();
  }

  shelterSlotsUsedAt(shelterId: string): number {
    return this.livestock.usedSlotsAt(shelterId);
  }

  shelterSlotsAvailableAt(shelterId: string): number {
    return Math.max(
      0,
      this.shelters.capacityFor(shelterId) - this.livestock.usedSlotsAt(shelterId),
    );
  }

  maxShelterSlotsAvailable(): number {
    return this.shelters
      .all()
      .reduce((maximum, shelter) => Math.max(maximum, this.shelterSlotsAvailableAt(shelter.id)), 0);
  }

  // -- persistence ---------------------------------------------------------

  toSaveState(regionId: string, seed: number, careerTick: number): FarmSiteSaveState {
    return {
      id: this.id,
      regionId,
      seed,
      levelId: this.level.id,
      ownedParcelIds: [...this.parcels.ownedIds],
      active: true,
      lastSimulatedTick: careerTick,
      plots: this.fields.toSaveState() as FarmSiteSaveState['plots'],
      buildings: this.structures.toSaveState() as FarmSiteSaveState['buildings'],
      stores: this.stores.toSaveState() as FarmSiteSaveState['stores'],
      animals: this.livestock.toSaveState() as FarmSiteSaveState['animals'],
      processors: this.processing.toSaveState() as FarmSiteSaveState['processors'],
      workers: this.workforce.toSaveState().map((worker) => ({
        id: worker.id,
        role: worker.role,
        displayName: worker.displayName,
        skill: worker.skill,
        tasksCompleted: worker.tasksCompleted,
        priorities: [...worker.priorities],
        parcelId: worker.parcelId,
        hutBuildingId: worker.hutBuildingId,
        actionTicks: worker.actionProgress,
        carrying: worker.carrying,
      })) as FarmSiteSaveState['workers'],
      carried: this.carry.toSaveState() as FarmSiteSaveState['carried'],
      upkeepRemainder: this.#upkeepRemainder,
      wageRemainder: this.#wageRemainder,
    };
  }

  /** Rebuilds a site from a save. The level is looked up by the caller. */
  static fromSaveState(level: LevelDefinition, state: FarmSiteSaveState): FarmWorld {
    const world = new FarmWorld(level, state.ownedParcelIds, state.id);
    world.#tick = state.lastSimulatedTick;
    world.#upkeepRemainder = state.upkeepRemainder;
    world.#wageRemainder = state.wageRemainder;

    world.structures.hydrate(state.buildings as unknown as PlacedBuilding[]);
    world.fields.hydrate(state.plots as unknown as PlotState[]);
    for (const store of state.stores) {
      world.stores.add({ ...(store as unknown as StoreState) });
    }
    world.relocateAnimalProductBaskets();
    world.livestock.hydrate(state.animals as never);
    world.processing.hydrate(state.processors as never);
    world.workforce.hydrate(
      state.workers.map((worker) => ({
        ...worker,
        actionProgress: worker.actionTicks,
        currentTask: null,
        tileX: level.shelter.tileX,
        tileZ: level.shelter.tileZ,
      })) as never,
    );
    world.carry.hydrate(state.carried as never);
    world.refreshIrrigation();
    world.#syncStoresWithBuildings();
    return world;
  }

  // -- internals -----------------------------------------------------------

  #syncStoresWithBuildings(): void {
    for (const building of this.structures.completed()) {
      const contributes =
        building.kind === 'barn' ||
        building.kind === 'cold_store' ||
        building.kind === 'loading_pad';
      if (!contributes) continue;
      const storeId = `store-${building.id}`;
      if (this.stores.get(storeId)) continue;
      this.stores.add({
        id: storeId,
        buildingId: building.id,
        tileX: building.tileX,
        tileZ: building.tileZ,
        capacity: storageContribution(building.kind),
        preserving: building.kind === 'cold_store',
        items: {},
        quality: {},
        spoilageRemainder: {},
      });
    }
    for (const building of this.structures.completed()) {
      const isProcessor =
        building.kind === 'mill' ||
        building.kind === 'creamery' ||
        building.kind === 'preserve_kitchen';
      if (isProcessor && !this.processing.forBuilding(building.id)) {
        this.processing.add(building.id);
      }
    }
  }

  #bridgeEvents(): void {
    this.fields.events.on('field:plot-changed', (payload) =>
      this.events.emit('world:plot-changed', payload),
    );
    this.fields.events.on('field:plots-added', (payload) =>
      this.events.emit('world:plots-added', payload),
    );
    this.structures.events.on('building:placed', (payload) =>
      this.events.emit('world:building-placed', payload),
    );
    this.structures.events.on('building:completed', (payload) =>
      this.events.emit('world:building-completed', payload),
    );
    this.livestock.events.on('animal:purchased', (payload) =>
      this.events.emit('world:animal-purchased', payload),
    );
    this.livestock.events.on('animal:hungry', (payload) =>
      this.events.emit('world:animal-hungry', payload),
    );
    this.livestock.events.on('animal:lost', (payload) =>
      this.events.emit('world:animal-lost', {
        ...payload,
        remaining: this.livestock.countOf(payload.species),
      }),
    );
    this.stores.events.on('store:full', (payload) =>
      this.events.emit('world:storage-full', { itemId: payload.itemId, spilled: payload.spilled }),
    );
    this.stores.events.on('store:spoiled', (payload) => {
      const store = this.stores.get(payload.storeId);
      this.events.emit('world:goods-spoiled', {
        ...payload,
        inTheOpen: Boolean(store?.id.startsWith('stack-') && store.buildingId === null),
      });
    });
    this.carry.events.on('carry:changed', (payload) =>
      this.events.emit('world:carry-changed', payload),
    );
  }

  #applyLevelToGrid(): void {
    for (const tile of this.level.blockedTiles) {
      this.grid.setFlag(tile.tileX, tile.tileZ, TileFlag.Blocked, true);
      this.grid.setFlag(tile.tileX, tile.tileZ, TileFlag.Occupied, true);
    }
    this.grid.setFlag(this.level.shelter.tileX, this.level.shelter.tileZ, TileFlag.Occupied, true);
    // Reserve the product collection point from construction without blocking
    // the player from walking onto it.
    this.grid.setFlag(
      this.level.animalProductDrop.tileX,
      this.level.animalProductDrop.tileZ,
      TileFlag.Occupied,
      true,
    );
    addShelterCollision(this.grid, this.level.shelter.tileX, this.level.shelter.tileZ);
  }

  /** Convenience for the HUD: is anything ready to pick up right now? */
  animalDefinitionFor(species: AnimalSpecies) {
    return ANIMALS[species];
  }
}
