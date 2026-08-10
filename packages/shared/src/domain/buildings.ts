/**
 * Building definitions - first playable scope is exactly four structures.
 *
 * Each one maps to a different pillar of the reinvestment decision:
 *   barn       - increases output you can hold  (capacity)
 *   irrigation - stabilises growth              (reliability)
 *   road       - reduces travel time            (labour)
 *   fence      - protects animals               (resilience)
 *
 * Money should never have an obvious best home; these four are deliberately
 * priced close together.
 */
import { cents, type Cents } from './ids.js';
import { secondsToTicks, type Ticks } from './time.js';

export type BuildingKind = 'barn' | 'irrigation' | 'road' | 'fence';

export interface BuildingDefinition {
  readonly id: BuildingKind;
  readonly displayName: string;
  readonly buildCost: Cents;
  /** Construction time. Building is not free in the moment-to-moment loop. */
  readonly buildTicks: Ticks;
  /** Footprint on the farm grid, in tiles. */
  readonly footprint: { readonly width: number; readonly depth: number };
  /** Upkeep charged per in-game day once complete. */
  readonly upkeepPerDay: Cents;
  readonly description: string;
}

export const BUILDINGS: Readonly<Record<BuildingKind, BuildingDefinition>> = Object.freeze({
  barn: {
    id: 'barn',
    displayName: 'Barn',
    buildCost: cents(4500),
    buildTicks: secondsToTicks(90),
    footprint: { width: 2, depth: 2 },
    upkeepPerDay: cents(40),
    description: 'Adds storage capacity so you can hold goods for a better order.',
  },
  irrigation: {
    id: 'irrigation',
    displayName: 'Irrigation',
    buildCost: cents(3800),
    buildTicks: secondsToTicks(75),
    footprint: { width: 1, depth: 1 },
    upkeepPerDay: cents(60),
    description: 'Supplies water to adjacent plots and blunts drought damage.',
  },
  road: {
    id: 'road',
    displayName: 'Road',
    buildCost: cents(400),
    buildTicks: secondsToTicks(10),
    footprint: { width: 1, depth: 1 },
    upkeepPerDay: cents(2),
    description: 'Speeds up movement and hauling across the tile it occupies.',
  },
  fence: {
    id: 'fence',
    displayName: 'Fence',
    buildCost: cents(1500),
    buildTicks: secondsToTicks(30),
    footprint: { width: 1, depth: 1 },
    upkeepPerDay: cents(10),
    description: 'Encloses animal shelter and sharply reduces predator losses.',
  },
});

/** Storage capacity granted per completed barn, in item units. */
export const BARN_CAPACITY_UNITS = 120;
/** Baseline storage before any barn is built. */
export const BASE_STORAGE_UNITS = 60;
/** Multiplier applied to traversal cost on a road tile (lower is faster). */
export const ROAD_TRAVERSAL_MULTIPLIER = 0.55;
