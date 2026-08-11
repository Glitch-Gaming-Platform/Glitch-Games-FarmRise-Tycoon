/**
 * A development-only acceptance career for reviewing progression in a real
 * browser without spending several real hours earning every prerequisite.
 *
 * It is deliberately created as a normal v2 save document and then loaded
 * through FarmScene's resume path. Nothing reaches into live models or grants
 * capabilities after load, so the panels and commands exercise the same code
 * as a real career. Bootstrap disables autosave while this fixture is active.
 */
import {
  BARN_CAPACITY_UNITS,
  COLD_STORE_CAPACITY_UNITS,
  ESTATE_PARCELS,
  INCIDENTS,
  LOADING_PAD_CAPACITY,
  MILESTONES,
  YARD_STORE_ID,
  asPlotId,
  cents,
  defaultPriorities,
  newCareer,
  unlocksUpToStage,
  type CareerSaveState,
  type FarmSiteSaveState,
  type WorkerRole,
} from '@farmrise/shared';

export type ProgressionReviewStage = 3 | 5;

export function createProgressionReviewCareer(
  reviewStage: ProgressionReviewStage = 3,
): CareerSaveState {
  const base = newCareer({ careerId: 'debug-progression-review', seed: 0x51a9e });
  const site = base.sites[0];
  if (!site) throw new Error('The progression review career needs the starter site.');

  const buildings: FarmSiteSaveState['buildings'] = [
    completedBuilding('building-barn', 'barn', 9, 18),
    completedBuilding('building-loading-pad', 'loading_pad', 9, 30),
    completedBuilding('building-cold-store', 'cold_store', 21, 25),
    completedBuilding('building-mill', 'mill', 9, 25),
    completedBuilding('building-creamery', 'creamery', 25, 9),
    completedBuilding('building-preserve-kitchen', 'preserve_kitchen', 21, 29),
    completedBuilding('building-worker-hut-1', 'worker_hut', 12, 25),
    completedBuilding('building-worker-hut-2', 'worker_hut', 15, 25),
    completedBuilding('building-worker-hut-3', 'worker_hut', 18, 25),
    ...(reviewStage >= 5 ? [completedBuilding('building-well', 'well', 27, 20)] : []),
  ];

  const reviewedSite: FarmSiteSaveState = {
    ...site,
    ownedParcelIds: ESTATE_PARCELS.map((parcel) => parcel.id),
    plots: ESTATE_PARCELS.flatMap((parcel) =>
      parcel.beds.map((bed) => ({
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
    ),
    buildings,
    stores: [
      {
        ...site.stores[0]!,
        id: YARD_STORE_ID,
        items: { wheat: 50 },
        quality: { wheat: 0.95 },
      },
      storeFor('building-barn', 9, 18, BARN_CAPACITY_UNITS, {
        corn: 20,
        clover: 20,
        pumpkin: 10,
      }),
      storeFor(
        'building-cold-store',
        21,
        25,
        COLD_STORE_CAPACITY_UNITS,
        {
          flour: 20,
          cheese: 10,
          preserves: 10,
        },
        true,
      ),
      storeFor('building-loading-pad', 9, 30, LOADING_PAD_CAPACITY, {}),
    ],
    animals: [
      { ...site.animals[0]!, count: 4, cycleTicks: 0 },
      {
        id: 'animals-cows',
        species: 'cow',
        count: 2,
        cycleTicks: 0,
        tileX: 27,
        tileZ: 14,
        sheltered: false,
      },
    ],
    processors: [],
    workers: [
      reviewWorker('worker-1', 'field_hand', 'Mara', 'building-worker-hut-1'),
      reviewWorker('worker-2', 'hauler', 'Eli', 'building-worker-hut-2'),
    ],
    carried: {
      ...site.carried,
      ownedCarriers: ['arms', 'handcart', 'wagon'],
    },
  };

  return {
    ...base,
    stage: reviewStage,
    unlocks: [...unlocksUpToStage(reviewStage)],
    completedMilestoneIds: MILESTONES.slice(0, reviewStage).map((milestone) => milestone.id),
    balance: cents(250_000),
    buyers: Object.fromEntries(
      Object.entries(base.buyers).map(([id, relationship]) => [
        id,
        { ...relationship, trust: 55, deliveries: 5, lastDeliveryTick: 0 },
      ]),
    ) as CareerSaveState['buyers'],
    town: {
      prosperity: 500,
      completedProjectIds: ['project-market-road'],
      activeProject: null,
    },
    sites: [reviewedSite],
    incidents: [],
    incidentCooldowns: Object.fromEntries(
      INCIDENTS.map((incident) => [incident.id, 1_000_000_000]),
    ),
    statistics: {
      ...base.statistics,
      lifetimeEarned: cents(reviewStage >= 5 ? 400_000 : 120_000),
      lifetimeSpent: cents(35_000),
      peakBalance: cents(250_000),
      cropsHarvested: 180,
      cyclesCompleted: 45,
      goodsHauled: 120,
      goodsProcessed: 40,
      contractsCompleted: 20,
      itemsSold: 400,
      seasonsCompleted: reviewStage >= 5 ? 6 : 3,
      buildingsBuilt: buildings.length,
    },
  };
}

function completedBuilding(
  id: string,
  kind: FarmSiteSaveState['buildings'][number]['kind'],
  tileX: number,
  tileZ: number,
): FarmSiteSaveState['buildings'][number] {
  return { id, kind, tileX, tileZ, rotation: 0, remainingBuildTicks: 0, broken: false };
}

function storeFor(
  buildingId: string,
  tileX: number,
  tileZ: number,
  capacity: number,
  items: Record<string, number>,
  preserving = false,
): FarmSiteSaveState['stores'][number] {
  return {
    id: `store-${buildingId}`,
    buildingId,
    tileX,
    tileZ,
    capacity,
    preserving,
    items,
    quality: Object.fromEntries(Object.keys(items).map((itemId) => [itemId, 0.95])),
    spoilageRemainder: {},
  };
}

function reviewWorker(
  id: string,
  role: WorkerRole,
  displayName: string,
  hutBuildingId: string,
): FarmSiteSaveState['workers'][number] {
  return {
    id,
    role,
    displayName,
    skill: 1,
    tasksCompleted: 12,
    priorities: [...defaultPriorities(role)],
    parcelId: null,
    hutBuildingId,
    actionTicks: 0,
    carrying: {},
  };
}
