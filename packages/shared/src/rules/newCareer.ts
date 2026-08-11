/**
 * The one canonical description of a brand-new career.
 *
 * Before this existed, the client built a starter farm from a level file while
 * the server created an empty save with no plots, no buildings and no animals -
 * two different opinions about what "new" means, which is exactly the kind of
 * disagreement that makes save validation impossible to trust
 * (docs/PROGRESSION_GAMEPLAY_PLAN.md §32.2).
 *
 * Everything a new career starts with is decided here, in the shared package,
 * so the client, the server and the tests cannot drift apart.
 */
import { CAREER_SCHEMA_VERSION, type CareerSaveState } from '../schemas/career.js';
import type { FarmSiteSaveState } from '../schemas/site.js';
import { BUYER_IDS } from '../domain/buyers.js';
import { ANIMALS } from '../domain/animals.js';
import { BASE_STORAGE_UNITS } from '../domain/buildings.js';
import { HOMESTEAD_PARCEL_ID, PARCELS_BY_ID } from '../domain/parcels.js';
import { asPlotId } from '../domain/ids.js';
import { STARTING_UNLOCKS } from '../domain/milestones.js';
import { secondsToTicks } from '../domain/time.js';
import { STARTING_BALANCE } from './economy.js';
import { seedFromString } from './rng.js';

export const STARTER_SITE_ID = 'site-millbrook';
export const STARTER_REGION_ID = 'region-millbrook-valley';
export const STARTER_LEVEL_ID = 'starter-farm';
export const YARD_STORE_ID = 'store-yard';

/** Where the shelter stands, in estate tile coordinates. */
export const STARTER_SHELTER = Object.freeze({ tileX: 19, tileZ: 16 });
/** Reserved, walkable collection point for eggs and milk beside the shelter. */
export const STARTER_ANIMAL_PRODUCT_DROP = Object.freeze({ tileX: 20, tileZ: 17 });
/** Where the player spawns. */
export const STARTER_SPAWN = Object.freeze({ tileX: 15, tileZ: 17 });

/**
 * Scenery that blocks movement on the homestead. Kept here rather than in the
 * client level file because the server rejects a building placed on top of it.
 */
export const STARTER_BLOCKED_TILES: readonly { tileX: number; tileZ: number }[] = Object.freeze([
  { tileX: 9, tileZ: 9 },
  { tileX: 10, tileZ: 9 },
  { tileX: 22, tileZ: 10 },
  { tileX: 21, tileZ: 21 },
  { tileX: 22, tileZ: 21 },
]);

/** Hens the player is given so there is something to look after from second one. */
export const STARTER_CHICKENS = 2;

export interface NewCareerOptions {
  readonly careerId: string;
  /** Stable seed. Supplied by the server for a signed-in player. */
  readonly seed?: number;
  readonly createdWithVersion?: string;
}

export function newCareerSite(seed: number): FarmSiteSaveState {
  const homestead = PARCELS_BY_ID[HOMESTEAD_PARCEL_ID];
  if (!homestead) throw new Error('The homestead parcel is missing from the estate definition.');

  return {
    id: STARTER_SITE_ID,
    regionId: STARTER_REGION_ID,
    seed,
    levelId: STARTER_LEVEL_ID,
    ownedParcelIds: [HOMESTEAD_PARCEL_ID],
    active: true,
    lastSimulatedTick: 0,
    plots: homestead.beds.map((bed) => ({
      id: asPlotId(bed.id),
      cropId: null,
      grownTicks: 0,
      tendCount: 0,
      water: 1,
      irrigated: false,
      diseased: false,
      eventMultiplier: 1,
      soil: 1,
      quality: 1,
      previousCropId: null,
    })),
    buildings: [],
    stores: [
      {
        id: YARD_STORE_ID,
        buildingId: null,
        tileX: STARTER_SHELTER.tileX,
        tileZ: STARTER_SHELTER.tileZ,
        capacity: BASE_STORAGE_UNITS,
        preserving: false,
        // Enough feed for the starter hens plus the hen the reinvestment lesson
        // asks the player to buy. Their first clutch is deliberately early so
        // collecting eggs can be taught without a two-minute dead period.
        items: { corn: STARTER_CHICKENS + 1 },
        quality: { corn: 1 },
        spoilageRemainder: { corn: 0 },
      },
    ],
    animals: [
      {
        id: 'animals-hens',
        species: 'chicken',
        count: STARTER_CHICKENS,
        cycleTicks: ANIMALS.chicken.cycleTicks - secondsToTicks(10),
        tileX: STARTER_SHELTER.tileX,
        tileZ: STARTER_SHELTER.tileZ,
        sheltered: false,
      },
    ],
    processors: [],
    workers: [],
    carried: {
      carrier: 'arms',
      ownedCarriers: ['arms'],
      items: {},
      quality: {},
      cartTileX: null,
      cartTileZ: null,
    },
    upkeepRemainder: 0,
    wageRemainder: 0,
  };
}

export function newCareer(options: NewCareerOptions): CareerSaveState {
  const seed = options.seed ?? seedFromString(options.careerId);
  return {
    schemaVersion: CAREER_SCHEMA_VERSION,
    careerId: options.careerId,
    createdWithVersion: options.createdWithVersion ?? '0.1.0',
    seed,
    tick: 0,
    onboardingCompleted: false,

    stage: 0,
    unlocks: [...STARTING_UNLOCKS],
    specialization: null,
    completedMilestoneIds: [],

    balance: STARTING_BALANCE,
    financeRemainder: 0,
    loans: [],
    insurance: null,

    buyers: Object.fromEntries(
      BUYER_IDS.map((id) => [id, { trust: 0, deliveries: 0, failures: 0, lastDeliveryTick: null }]),
    ) as CareerSaveState['buyers'],
    contracts: [],

    town: { prosperity: 0, completedProjectIds: [], activeProject: null },

    sites: [newCareerSite(seed)],
    activeSiteId: STARTER_SITE_ID,

    incidents: [],
    incidentCooldowns: {},

    statistics: {
      lifetimeEarned: 0,
      lifetimeSpent: 0,
      peakBalance: STARTING_BALANCE,
      cropsHarvested: 0,
      cyclesCompleted: 0,
      goodsHauled: 0,
      goodsProcessed: 0,
      contractsCompleted: 0,
      contractsFailed: 0,
      incidentsSurvived: 0,
      incidentsMitigated: 0,
      buildingsBuilt: 0,
      itemsSold: 0,
      seasonsCompleted: 0,
      restructures: 0,
    },

    rng: {
      incidents: seed >>> 0,
      market: (seed ^ 0x9e3779b9) >>> 0,
      disease: (seed ^ 0x85ebca6b) >>> 0,
      quality: (seed ^ 0xc2b2ae35) >>> 0,
    },
  };
}

/** True when this document describes a career that has never been played. */
export function isUntouchedCareer(state: CareerSaveState): boolean {
  return state.tick === 0 && state.statistics.cyclesCompleted === 0 && state.stage === 0;
}
