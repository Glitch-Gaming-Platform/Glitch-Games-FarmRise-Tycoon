/**
 * Building definitions.
 *
 * The original four map to the four pillars of the reinvestment decision:
 *   barn       - increases output you can hold  (capacity)
 *   irrigation - stabilises growth              (reliability)
 *   road       - reduces travel time            (labour)
 *   fence      - protects animals               (resilience)
 *
 * Progression adds structures that answer problems the player only has *after*
 * a success: somewhere to stage a distant harvest, somewhere to keep goods from
 * spoiling, somewhere for a worker to live, and the processors that turn
 * produce into something worth more (docs/PROGRESSION_GAMEPLAY_PLAN.md §8-10).
 *
 * Processor buildings are generated from PROCESSORS rather than retyped here,
 * so a processor's cost exists in exactly one place.
 */
import { cents, type Cents } from './ids.js';
import { secondsToTicks, type Ticks } from './time.js';
import { PROCESSORS, type ProcessorKind } from './processing.js';
import type { UnlockId } from './milestones.js';

export type CoreBuildingKind =
  | 'barn'
  | 'irrigation'
  | 'road'
  | 'fence'
  | 'animal_shelter'
  | 'water_trough'
  | 'loading_pad'
  | 'cold_store'
  | 'worker_hut'
  | 'well';

export type BuildingKind = CoreBuildingKind | ProcessorKind;

/** Clockwise quarter-turns from the authored/default orientation. */
export type BuildingRotation = 0 | 1 | 2 | 3;

export interface BuildingFootprint {
  readonly width: number;
  readonly depth: number;
}

export interface BuildingDefinition {
  readonly id: BuildingKind;
  readonly displayName: string;
  readonly buildCost: Cents;
  /** Construction time. Building is not free in the moment-to-moment loop. */
  readonly buildTicks: Ticks;
  /** Footprint on the farm grid, in tiles. */
  readonly footprint: BuildingFootprint;
  /** Upkeep charged per in-game day once complete. */
  readonly upkeepPerDay: Cents;
  /** Career unlock required before this appears in the build menu. */
  readonly requiresUnlock: UnlockId | null;
  readonly description: string;
}

const CORE_BUILDINGS: Readonly<Record<CoreBuildingKind, BuildingDefinition>> = Object.freeze({
  barn: {
    id: 'barn',
    displayName: 'Barn',
    buildCost: cents(4500),
    buildTicks: secondsToTicks(90),
    footprint: { width: 2, depth: 2 },
    upkeepPerDay: cents(40),
    requiresUnlock: null,
    description: 'Adds storage capacity so you can hold goods for a better order.',
  },
  irrigation: {
    id: 'irrigation',
    displayName: 'Irrigation',
    buildCost: cents(3800),
    buildTicks: secondsToTicks(75),
    footprint: { width: 1, depth: 1 },
    upkeepPerDay: cents(60),
    requiresUnlock: null,
    description: 'Supplies water to adjacent plots and blunts drought damage.',
  },
  road: {
    id: 'road',
    displayName: 'Road',
    buildCost: cents(400),
    buildTicks: secondsToTicks(10),
    footprint: { width: 1, depth: 1 },
    upkeepPerDay: cents(2),
    requiresUnlock: null,
    description: 'Speeds up movement and hauling across the tile it occupies.',
  },
  fence: {
    id: 'fence',
    displayName: 'Fence',
    buildCost: cents(1500),
    buildTicks: secondsToTicks(30),
    footprint: { width: 1, depth: 1 },
    upkeepPerDay: cents(10),
    requiresUnlock: null,
    description: 'Encloses animal shelter and sharply reduces predator losses.',
  },
  animal_shelter: {
    id: 'animal_shelter',
    displayName: 'Animal Shelter',
    buildCost: cents(3_000),
    buildTicks: secondsToTicks(60),
    footprint: { width: 2, depth: 2 },
    upkeepPerDay: cents(20),
    requiresUnlock: 'animal_shelters',
    description:
      'Adds another coop and covered pen so livestock bought nearby can live on that part of the farm.',
  },
  water_trough: {
    id: 'water_trough',
    displayName: 'Water Trough',
    buildCost: cents(1_000),
    buildTicks: secondsToTicks(20),
    footprint: { width: 1, depth: 1 },
    upkeepPerDay: cents(3),
    requiresUnlock: null,
    description: 'Adds a permanent watering point to an animal yard.',
  },
  loading_pad: {
    id: 'loading_pad',
    displayName: 'Loading pad',
    buildCost: cents(1800),
    buildTicks: secondsToTicks(35),
    footprint: { width: 2, depth: 1 },
    upkeepPerDay: cents(8),
    requiresUnlock: 'hauling',
    description:
      'Somewhere to stage a harvest out in the fields instead of carrying every load home.',
  },
  cold_store: {
    id: 'cold_store',
    displayName: 'Cold store',
    buildCost: cents(11_000),
    buildTicks: secondsToTicks(140),
    footprint: { width: 2, depth: 2 },
    upkeepPerDay: cents(160),
    requiresUnlock: 'quality_grading',
    description: 'Stops goods losing quality while you wait for the contract that pays properly.',
  },
  worker_hut: {
    id: 'worker_hut',
    displayName: 'Worker hut',
    buildCost: cents(7_000),
    buildTicks: secondsToTicks(120),
    footprint: { width: 2, depth: 2 },
    upkeepPerDay: cents(30),
    requiresUnlock: 'workers',
    description: 'Houses one worker. No hut, no hire.',
  },
  well: {
    id: 'well',
    displayName: 'Deep well',
    buildCost: cents(9_500),
    buildTicks: secondsToTicks(160),
    footprint: { width: 1, depth: 1 },
    upkeepPerDay: cents(35),
    requiresUnlock: 'utilities',
    description: 'Feeds every irrigation point in range, so one drought does not empty the estate.',
  },
});

function processorBuildings(): Record<ProcessorKind, BuildingDefinition> {
  const entries = Object.values(PROCESSORS).map(
    (processor): [ProcessorKind, BuildingDefinition] => [
      processor.id,
      {
        id: processor.id,
        displayName: processor.displayName,
        buildCost: processor.buildCost,
        buildTicks: processor.buildTicks,
        footprint: processor.footprint,
        upkeepPerDay: processor.upkeepPerDay,
        requiresUnlock: 'processing',
        description: processor.description,
      },
    ],
  );
  return Object.fromEntries(entries) as Record<ProcessorKind, BuildingDefinition>;
}

export const BUILDINGS: Readonly<Record<BuildingKind, BuildingDefinition>> = Object.freeze({
  ...CORE_BUILDINGS,
  ...processorBuildings(),
});

export const BUILDING_KINDS = Object.keys(BUILDINGS) as readonly BuildingKind[];

/** Keeps runtime input and migrated/defaulted saves inside the persisted 0..3 contract. */
export function normalizeBuildingRotation(rotation: number): BuildingRotation {
  const wholeTurns = Number.isFinite(rotation) ? Math.trunc(rotation) : 0;
  return (((wholeTurns % 4) + 4) % 4) as BuildingRotation;
}

/** The occupied grid rectangle after applying a building's quarter-turn. */
export function buildingFootprint(kind: BuildingKind, rotation: number = 0): BuildingFootprint {
  const footprint = BUILDINGS[kind].footprint;
  return normalizeBuildingRotation(rotation) % 2 === 0
    ? footprint
    : { width: footprint.depth, depth: footprint.width };
}

export function getBuilding(id: string): BuildingDefinition | undefined {
  return (BUILDINGS as Record<string, BuildingDefinition>)[id];
}

export function isBuildingKind(id: string): id is BuildingKind {
  return Object.hasOwn(BUILDINGS, id);
}

/** Storage capacity granted per completed barn, in item units. */
export const BARN_CAPACITY_UNITS = 120;
/** Baseline storage before any barn is built. */
export const BASE_STORAGE_UNITS = 60;
/** A cold store holds less than a barn but preserves what is in it. */
export const COLD_STORE_CAPACITY_UNITS = 70;
/** Multiplier applied to traversal cost on a road tile (lower is faster). */
export const ROAD_TRAVERSAL_MULTIPLIER = 0.55;
/** Tiles a deep well can serve. */
export const WELL_SERVICE_RADIUS_TILES = 6;
