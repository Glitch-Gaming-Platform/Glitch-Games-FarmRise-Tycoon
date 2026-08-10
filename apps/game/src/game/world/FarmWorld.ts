/**
 * The authoritative *client-side* model of one farm.
 *
 * Responsibilities, and deliberately nothing else:
 *   - hold the simulation state (plots, buildings, animals, inventory, wallet)
 *   - advance that state by whole ticks using the shared rules
 *   - serialise to and from the shared save schema
 *
 * It contains no Three.js, no DOM and no fetch, which is what lets the entire
 * economy be unit-tested in Node and re-simulated by the server. Player-issued
 * mutations live in FarmCommands.ts so that "how the world evolves" and "what
 * the player may do to it" stay separable.
 */
import {
  ANIMALS,
  BUILDINGS,
  advancePlot,
  computeYield,
  emptyPlot,
  plotStage,
  requireCrop,
  storageCapacity,
  upkeepForTicks,
  addItems,
  asPlotId,
  cents,
  createRng,
  type BuildingKind,
  type Cents,
  type Inventory,
  type PlotState,
  type Rng,
  type AnimalSpecies,
  type RunState,
  type SaveState,
  SAVE_SCHEMA_VERSION,
  STARTING_BALANCE,
} from '@farmrise/shared';
import { EventBus } from '@engine/core/EventBus.js';
import { GridPhysics } from '@engine/physics/GridPhysics.js';
import { TileFlag, TileGrid } from '@engine/physics/TileGrid.js';
import type { LevelDefinition } from './levels/LevelDefinition.js';
import { addBuildingCollision, addShelterCollision } from './collisionProfiles.js';

export interface PlacedBuilding {
  kind: BuildingKind;
  tileX: number;
  tileZ: number;
  remainingBuildTicks: number;
}

export interface AnimalGroup {
  species: AnimalSpecies;
  count: number;
  cycleTicks: number;
}

/**
 * Counters the outcome screen and the analytics funnel read.
 *
 * Deliberately NOT part of the save: they describe a single sitting, not
 * persistent progress, and the core playtest question ("does this create an
 * engaging reason to begin another production cycle?") is about behaviour
 * within a session.
 */
export interface RunStats {
  totalEarned: number;
  totalSpent: number;
  peakBalance: number;
  cropsHarvested: number;
  /** A cycle is counted when a plot goes from planted to harvested. */
  cyclesCompleted: number;
  eventsSurvived: number;
  eventsPrevented: number;
  buildingsBuilt: number;
  itemsSold: number;
}

export interface FarmWorldEvents extends Record<string, unknown> {
  'world:plot-changed': { plotId: string };
  'world:harvested': { plotId: string; itemId: string; quantity: number; spilled: number };
  'world:balance-changed': { balance: Cents; delta: Cents };
  'world:building-placed': { kind: BuildingKind; tileX: number; tileZ: number };
  'world:building-completed': { kind: BuildingKind; tileX: number; tileZ: number };
  'world:animal-purchased': { species: AnimalSpecies; count: number };
  'world:produce': { itemId: string; quantity: number };
  'world:storage-full': { itemId: string; spilled: number };
  'world:sold': { itemId: string; quantity: number; payout: Cents; viaContract: boolean };
  'world:land-purchased': { parcels: number };
}

export class FarmWorld {
  readonly grid: TileGrid;
  readonly physics: GridPhysics;
  readonly events = new EventBus<FarmWorldEvents>();
  readonly level: LevelDefinition;

  #tick = 0;
  #balance: Cents = STARTING_BALANCE;
  #plots = new Map<string, PlotState>();
  #buildings: PlacedBuilding[] = [];
  #animals: AnimalGroup[] = [];
  #inventory: Inventory = {};
  #landParcels = 1;
  #rng: Rng;
  /** Fractional upkeep carried between ticks so rounding cannot be farmed. */
  #upkeepRemainder = 0;
  readonly #stats: RunStats = {
    totalEarned: 0,
    totalSpent: 0,
    peakBalance: 0,
    cropsHarvested: 0,
    cyclesCompleted: 0,
    eventsSurvived: 0,
    eventsPrevented: 0,
    buildingsBuilt: 0,
    itemsSold: 0,
  };

  constructor(level: LevelDefinition, rngSeed: number) {
    this.level = level;
    this.grid = new TileGrid(level.grid.width, level.grid.depth, level.grid.tileSize);
    this.physics = new GridPhysics(this.grid, { roadMultiplier: 0.55 });
    this.#rng = createRng(rngSeed);
    this.#applyLevelToGrid();
    for (const placement of level.plots) {
      this.#plots.set(placement.id, emptyPlot(asPlotId(placement.id)));
      this.grid.setFlag(placement.tileX, placement.tileZ, TileFlag.Soil, true);
    }
    for (const building of level.startingBuildings) {
      this.#buildings.push({ ...building, remainingBuildTicks: 0 });
      this.#applyBuildingToGrid(building.kind, building.tileX, building.tileZ);
    }
  }

  get tick(): number {
    return this.#tick;
  }
  get balance(): Cents {
    return this.#balance;
  }
  get inventory(): Inventory {
    return this.#inventory;
  }
  get plots(): ReadonlyMap<string, PlotState> {
    return this.#plots;
  }
  get buildings(): readonly PlacedBuilding[] {
    return this.#buildings;
  }
  get animals(): readonly AnimalGroup[] {
    return this.#animals;
  }
  get landParcels(): number {
    return this.#landParcels;
  }
  get rng(): Rng {
    return this.#rng;
  }

  get stats(): Readonly<RunStats> {
    return this.#stats;
  }

  /** Mutable access for the systems that own a counter. Kept narrow on purpose. */
  bumpStat(key: keyof RunStats, by = 1): void {
    this.#stats[key] += by;
  }

  /**
   * Projection used to decide whether the run is won, lost, or continuing.
   * Shared with the server, which evaluates the identical predicate.
   */
  runState(): RunState {
    return {
      balance: this.#balance,
      inventory: this.#inventory,
      landParcels: this.#landParcels,
      growingPlots: [...this.#plots.values()].filter((plot) => plot.cropId !== null).length,
      buildingInProgress: this.#buildings.some((b) => b.remainingBuildTicks > 0),
    };
  }

  setLandParcels(parcels: number): void {
    this.#landParcels = parcels;
    this.events.emit('world:land-purchased', { parcels });
  }

  get storageCapacity(): number {
    return storageCapacity(this.completedBuildings('barn').length);
  }

  completedBuildings(kind?: BuildingKind): PlacedBuilding[] {
    return this.#buildings.filter(
      (building) => building.remainingBuildTicks <= 0 && (!kind || building.kind === kind),
    );
  }

  getPlot(plotId: string): PlotState | undefined {
    return this.#plots.get(plotId);
  }

  plotPlacement(plotId: string) {
    return this.level.plots.find((plot) => plot.id === plotId);
  }

  setPlot(plotId: string, next: PlotState): void {
    this.#plots.set(plotId, next);
    this.events.emit('world:plot-changed', { plotId });
  }

  adjustBalance(delta: Cents): void {
    this.#balance = cents(Math.max(0, this.#balance + delta));
    if (delta > 0) this.#stats.totalEarned += delta;
    else this.#stats.totalSpent += -delta;
    this.#stats.peakBalance = Math.max(this.#stats.peakBalance, this.#balance);
    this.events.emit('world:balance-changed', { balance: this.#balance, delta });
  }

  addToInventory(itemId: string, quantity: number): { stored: number; spilled: number } {
    const result = addItems(this.#inventory, itemId, quantity, this.storageCapacity);
    this.#inventory = result.inventory;
    if (result.spilled > 0) {
      this.events.emit('world:storage-full', { itemId, spilled: result.spilled });
    }
    return { stored: result.stored, spilled: result.spilled };
  }

  setInventory(inventory: Inventory): void {
    this.#inventory = inventory;
  }

  addBuilding(building: PlacedBuilding): void {
    this.#buildings.push(building);
    // The footprint is reserved immediately, so two builds cannot claim the
    // same tiles while the first is still under construction.
    this.#applyBuildingToGrid(building.kind, building.tileX, building.tileZ);
    this.events.emit('world:building-placed', {
      kind: building.kind,
      tileX: building.tileX,
      tileZ: building.tileZ,
    });
  }

  addAnimals(species: AnimalSpecies, count: number): void {
    const existing = this.#animals.find((group) => group.species === species);
    if (existing) existing.count += count;
    else this.#animals.push({ species, count, cycleTicks: 0 });
    this.events.emit('world:animal-purchased', { species, count });
  }

  /**
   * Advances the whole farm by one fixed tick. Called from the game loop's
   * fixedUpdate, and by the server when it replays a submitted save.
   */
  advance(dtTicks = 1): void {
    this.#tick += dtTicks;
    this.#advancePlots(dtTicks);
    this.#advanceConstruction(dtTicks);
    this.#advanceAnimals(dtTicks);
    this.#chargeUpkeep(dtTicks);
  }

  toSaveState(): SaveState {
    return {
      schemaVersion: SAVE_SCHEMA_VERSION,
      tick: this.#tick,
      balance: this.#balance,
      plots: [...this.#plots.values()].map((plot) => ({
        id: plot.id,
        cropId: plot.cropId,
        grownTicks: plot.grownTicks,
        tendCount: plot.tendCount,
        water: plot.water,
        irrigated: plot.irrigated,
        diseased: plot.diseased,
        eventMultiplier: plot.eventMultiplier,
      })),
      buildings: this.#buildings.map((building) => ({ ...building })),
      animals: this.#animals.map((group) => ({ ...group })),
      inventory: { ...this.#inventory },
      landParcels: this.#landParcels,
      rngState: this.#rng.state(),
    };
  }

  /** Rebuilds a world from a save. The level is looked up by the caller. */
  static fromSaveState(level: LevelDefinition, state: SaveState): FarmWorld {
    const world = new FarmWorld(level, state.rngState);
    world.#tick = state.tick;
    world.#balance = state.balance;
    world.#landParcels = state.landParcels;
    world.#inventory = { ...state.inventory };
    world.#buildings = state.buildings.map((building) => ({ ...building }));
    world.#animals = state.animals.map((group) => ({ ...group }));
    world.#plots = new Map(
      state.plots.map((plot) => [plot.id as string, { ...plot, id: asPlotId(plot.id as string) }]),
    );
    for (const building of world.#buildings) {
      world.#applyBuildingToGrid(building.kind, building.tileX, building.tileZ);
    }
    world.#refreshIrrigation();
    return world;
  }

  #advancePlots(dtTicks: number): void {
    for (const [plotId, plot] of this.#plots) {
      if (!plot.cropId) continue;
      const next = advancePlot(plot, dtTicks);
      if (next !== plot) this.#plots.set(plotId, next);
    }
  }

  #advanceConstruction(dtTicks: number): void {
    for (const building of this.#buildings) {
      if (building.remainingBuildTicks <= 0) continue;
      building.remainingBuildTicks = Math.max(0, building.remainingBuildTicks - dtTicks);
      if (building.remainingBuildTicks === 0) {
        this.#stats.buildingsBuilt += 1;
        this.#refreshIrrigation();
        this.events.emit('world:building-completed', {
          kind: building.kind,
          tileX: building.tileX,
          tileZ: building.tileZ,
        });
      }
    }
  }

  #advanceAnimals(dtTicks: number): void {
    for (const group of this.#animals) {
      if (group.count <= 0) continue;
      const definition = ANIMALS[group.species];
      if (!definition) continue;
      group.cycleTicks += dtTicks;
      if (group.cycleTicks < definition.cycleTicks) continue;
      group.cycleTicks -= definition.cycleTicks;

      // Feed is consumed from stores. No feed means no produce this cycle -
      // a visible, recoverable consequence rather than losing the animals.
      const feedNeeded = definition.feedPerCycle * group.count;
      const feedHeld = this.#inventory[definition.feedItemId] ?? 0;
      if (feedHeld < feedNeeded) continue;
      this.#inventory = { ...this.#inventory, [definition.feedItemId]: feedHeld - feedNeeded };

      const produced = definition.producePerCycle * group.count;
      const { stored } = this.addToInventory(definition.producesItemId, produced);
      if (stored > 0) {
        this.events.emit('world:produce', { itemId: definition.producesItemId, quantity: stored });
      }
    }
  }

  #chargeUpkeep(dtTicks: number): void {
    const kinds = this.completedBuildings().map((building) => building.kind);
    if (kinds.length === 0) return;
    const owed = upkeepForTicks(kinds, dtTicks) + this.#upkeepRemainder;
    const whole = Math.floor(owed);
    this.#upkeepRemainder = owed - whole;
    if (whole > 0) this.adjustBalance(cents(-whole));
  }

  /** Marks plots adjacent to a completed irrigation building as irrigated. */
  #refreshIrrigation(): void {
    const sources = this.completedBuildings('irrigation');
    for (const [plotId, plot] of this.#plots) {
      const placement = this.plotPlacement(plotId);
      if (!placement) continue;
      const irrigated = sources.some(
        (source) =>
          Math.abs(source.tileX - placement.tileX) <= 1 &&
          Math.abs(source.tileZ - placement.tileZ) <= 1,
      );
      if (irrigated !== plot.irrigated) this.#plots.set(plotId, { ...plot, irrigated });
    }
  }

  #applyLevelToGrid(): void {
    for (const tile of this.level.blockedTiles) {
      this.grid.setFlag(tile.tileX, tile.tileZ, TileFlag.Blocked, true);
      this.grid.setFlag(tile.tileX, tile.tileZ, TileFlag.Occupied, true);
    }
    this.grid.setFlag(this.level.shelter.tileX, this.level.shelter.tileZ, TileFlag.Occupied, true);
    addShelterCollision(this.grid, this.level.shelter.tileX, this.level.shelter.tileZ);
  }

  #applyBuildingToGrid(kind: BuildingKind, tileX: number, tileZ: number): void {
    const definition = BUILDINGS[kind];
    this.grid.fillRect(
      tileX,
      tileZ,
      definition.footprint.width,
      definition.footprint.depth,
      TileFlag.Occupied,
      true,
    );
    if (kind === 'road') {
      this.grid.setFlag(tileX, tileZ, TileFlag.Road, true);
    }
    if (kind === 'fence') {
      this.grid.setFlag(tileX, tileZ, TileFlag.Enclosed, true);
    }
    addBuildingCollision(this.grid, kind, tileX, tileZ);
    if (kind === 'barn') {
      // Barns fill whole tiles, so they also use coarse blocking for A*.
      this.grid.fillRect(
        tileX,
        tileZ,
        definition.footprint.width,
        definition.footprint.depth,
        TileFlag.Blocked,
        true,
      );
    }
  }

  /** Convenience for the HUD: is anything ready to pick up right now? */
  readyPlotIds(): string[] {
    return [...this.#plots.entries()]
      .filter(([, plot]) => plotStage(plot) === 'ready')
      .map(([plotId]) => plotId);
  }

  /** Preview of what a plot would yield if harvested now. Used by the HUD. */
  previewYield(plotId: string): number {
    const plot = this.#plots.get(plotId);
    return plot ? computeYield(plot) : 0;
  }

  /** Cost to plant a given crop, surfaced so the UI never hardcodes prices. */
  seedCostOf(cropId: string): Cents {
    return requireCrop(cropId).seedCost;
  }
}
