/**
 * A development-only acceptance career for reviewing progression in a real
 * browser without spending several real hours earning every prerequisite.
 *
 * It is deliberately created as a normal v3 save document and then loaded
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

export type ProgressionReviewStage = 2 | 3 | 4 | 5;

export function createProgressionReviewCareer(
  reviewStage: ProgressionReviewStage = 3,
): CareerSaveState {
  const base = newCareer({ careerId: 'debug-progression-review', seed: 0x51a9e });
  const site = base.sites[0];
  if (!site) throw new Error('The progression review career needs the starter site.');

  const ownedParcels = ESTATE_PARCELS.filter(
    (parcel) => reviewStage >= 3 || parcel.id !== 'parcel-south-works',
  );
  const buildings: FarmSiteSaveState['buildings'] = [
    completedBuilding('building-barn', 'barn', 9, 18),
    completedBuilding('building-loading-pad', 'loading_pad', 9, 3),
    completedBuilding('building-mill', 'mill', 18, 18),
    completedBuilding('building-creamery', 'creamery', 25, 9),
    completedBuilding('building-preserve-kitchen', 'preserve_kitchen', 20, 20),
    completedBuilding('building-animal-shelter-1', 'animal_shelter', 25, 16),
    completedBuilding('building-animal-shelter-2', 'animal_shelter', 28, 18),
    ...(reviewStage >= 3
      ? [
          completedBuilding('building-cold-store', 'cold_store', 21, 25),
          completedBuilding('building-worker-hut-1', 'worker_hut', 12, 25),
          completedBuilding('building-worker-hut-2', 'worker_hut', 15, 25),
          completedBuilding('building-worker-hut-3', 'worker_hut', 18, 25),
        ]
      : []),
    ...(reviewStage >= 5 ? [completedBuilding('building-well', 'well', 27, 20)] : []),
  ];

  const reviewedSite: FarmSiteSaveState = {
    ...site,
    ownedParcelIds: ownedParcels.map((parcel) => parcel.id),
    plots: ownedParcels.flatMap((parcel) =>
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
        items: { wheat: 50, wool: 4 },
        quality: { wheat: 0.95, wool: 1 },
      },
      storeFor('building-barn', 9, 18, BARN_CAPACITY_UNITS, {
        corn: 20,
        clover: 20,
        pumpkin: 10,
        ...(reviewStage < 3 ? { flour: 20, cheese: 10, preserves: 10 } : {}),
      }),
      ...(reviewStage >= 3
        ? [
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
          ]
        : []),
      storeFor('building-loading-pad', 9, 3, LOADING_PAD_CAPACITY, {}),
    ],
    animals: [
      { ...site.animals[0]!, count: 4, cycleTicks: 0 },
      {
        id: 'animals-cows',
        species: 'cow',
        shelterId: 'building-animal-shelter-1',
        count: 1,
        cycleTicks: 0,
        tileX: 25,
        tileZ: 16,
        sheltered: false,
      },
      {
        id: 'animals-sheep',
        species: 'sheep',
        shelterId: 'building-animal-shelter-2',
        count: 1,
        cycleTicks: 0,
        tileX: 28,
        tileZ: 18,
        sheltered: false,
      },
    ],
    processors: [],
    workers:
      reviewStage >= 3
        ? [
            reviewWorker('worker-1', 'field_hand', 'Mara', 'building-worker-hut-1'),
            reviewWorker('worker-2', 'hauler', 'Eli', 'building-worker-hut-2'),
          ]
        : [],
    carried: {
      ...site.carried,
      ownedCarriers: reviewStage >= 5 ? ['arms', 'handcart', 'wagon'] : ['arms', 'handcart'],
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
      prosperity: reviewStage >= 3 ? 500 : 100,
      completedProjectIds: reviewStage >= 3 ? ['project-market-road'] : ['project-seed-box'],
      activeProject: null,
    },
    sites: [reviewedSite],
    incidents: [],
    incidentCooldowns: Object.fromEntries(
      INCIDENTS.map((incident) => [incident.id, 1_000_000_000]),
    ),
    statistics: {
      ...base.statistics,
      lifetimeEarned: cents(reviewStage >= 5 ? 400_000 : reviewStage === 2 ? 80_000 : 120_000),
      lifetimeSpent: cents(35_000),
      peakBalance: cents(250_000),
      cropsHarvested: 180,
      cyclesCompleted: 45,
      goodsHauled: 120,
      goodsProcessed: 40,
      contractsCompleted: reviewStage >= 3 ? 20 : 4,
      itemsSold: 400,
      seasonsCompleted: reviewStage >= 5 ? 6 : reviewStage === 2 ? 2 : 3,
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
