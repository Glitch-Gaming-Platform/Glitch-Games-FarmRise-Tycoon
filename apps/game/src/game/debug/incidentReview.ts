/**
 * Development-only incident acceptance fixtures.
 *
 * Each fixture is a normal career-v2 document and enters FarmScene through the
 * same hydration path as a player's persisted warning. Timings are shortened
 * for browser review, but targets, responses and consequences are real.
 */
import {
  INCIDENTS,
  cents,
  getIncident,
  secondsToTicks,
  type CareerSaveState,
  type FarmSiteSaveState,
  type IncidentInstance,
} from '@farmrise/shared';
import { createProgressionReviewCareer } from './progressionReview.js';

export interface IncidentReviewCareer {
  readonly state: CareerSaveState;
  readonly spawnTile: { readonly tileX: number; readonly tileZ: number };
}

const WARNING_TICKS = secondsToTicks(18);
const ACTIVE_TICKS = secondsToTicks(15);

export function createIncidentReviewCareer(definitionId: string): IncidentReviewCareer {
  const definition = getIncident(definitionId);
  if (!definition) throw new Error(`Unknown incident review fixture: ${definitionId}`);

  const base = createProgressionReviewCareer(Math.max(3, definition.minimumStage) as 3 | 5);
  const site = base.sites[0];
  if (!site) throw new Error('The incident review career needs the starter site.');

  const preparedSite = prepareSite(site, definitionId);
  const targetIds = targetsFor(preparedSite, definitionId);
  const incident: IncidentInstance = {
    id: `review-${definitionId}`,
    definitionId,
    siteId: preparedSite.id,
    severity: 'minor',
    warnedTick: base.tick,
    impactTick: base.tick + WARNING_TICKS,
    endsTick: base.tick + WARNING_TICKS + ACTIVE_TICKS,
    targetIds,
    responseKind: null,
    responseProgress: 0,
    resolved: false,
    appliedMultiplier: null,
  };

  return {
    state: {
      ...base,
      onboardingCompleted: true,
      sites: [preparedSite],
      contracts:
        definitionId === 'incident-blocked-road'
          ? [
              {
                id: 'review-road-contract',
                buyerId: 'millbrook_grocers',
                itemId: 'wheat',
                quantity: 12,
                delivered: 0,
                unitPrice: cents(175),
                minimumQuality: 0,
                acceptedTick: base.tick,
                deadlineTick: base.tick + secondsToTicks(22),
                recurringEveryTicks: 0,
                status: 'open',
              },
            ]
          : [],
      incidents: [incident],
      incidentCooldowns: Object.fromEntries(INCIDENTS.map((entry) => [entry.id, 1_000_000_000])),
    },
    spawnTile: spawnFor(definitionId, preparedSite),
  };
}

function prepareSite(site: FarmSiteSaveState, definitionId: string): FarmSiteSaveState {
  const plots = site.plots.map((plot, index) =>
    index < 2
      ? {
          ...plot,
          cropId: 'wheat' as const,
          grownTicks: secondsToTicks(20),
          tendCount: 1,
          water: 1,
          eventMultiplier: 1,
        }
      : plot,
  );

  if (definitionId === 'incident-cart-axle') {
    return {
      ...site,
      plots,
      carried: {
        carrier: 'handcart',
        ownedCarriers: ['arms', 'handcart'],
        items: { wheat: 10 },
        quality: { wheat: 0.9 },
        cartTileX: 15,
        cartTileZ: 17,
      },
    };
  }

  if (definitionId === 'incident-fox-raid') {
    return {
      ...site,
      plots,
      animals: site.animals[0] ? [{ ...site.animals[0], count: 4, sheltered: false }] : [],
    };
  }

  if (definitionId === 'incident-cold-snap') {
    return { ...site, plots, animals: [] };
  }

  if (definitionId === 'incident-processor-breakdown') {
    return {
      ...site,
      plots,
      processors: [
        {
          id: 'processor-building-mill',
          buildingId: 'building-mill',
          queue: [{ recipeId: 'recipe-flour', batches: 1, remainingTicks: secondsToTicks(45) }],
          held: {},
        },
      ],
    };
  }

  return { ...site, plots };
}

function targetsFor(site: FarmSiteSaveState, definitionId: string): string[] {
  switch (definitionId) {
    case 'incident-drought':
    case 'incident-blight':
      return [site.plots[0]?.id ?? 'plot-1'];
    case 'incident-fox-raid':
      return [site.animals[0]?.id ?? 'animals-hens'];
    case 'incident-cart-axle':
      return ['carried'];
    case 'incident-blocked-road':
      return ['review-road-contract'];
    case 'incident-processor-breakdown':
      return ['building-mill'];
    case 'incident-cold-snap':
      return [site.stores.find((store) => store.id === 'store-yard')?.id ?? 'store-yard'];
    default:
      return [];
  }
}

function spawnFor(
  definitionId: string,
  site: FarmSiteSaveState,
): { readonly tileX: number; readonly tileZ: number } {
  switch (definitionId) {
    case 'incident-drought':
    case 'incident-blight':
      return { tileX: 13, tileZ: 13 };
    case 'incident-fox-raid':
    case 'incident-cold-snap':
      return { tileX: 19, tileZ: 17 };
    case 'incident-cart-axle':
      return { tileX: 15, tileZ: 17 };
    case 'incident-blocked-road':
      return { tileX: 9, tileZ: 23 };
    case 'incident-processor-breakdown': {
      const mill = site.buildings.find((building) => building.id === 'building-mill');
      return { tileX: mill?.tileX ?? 9, tileZ: mill?.tileZ ?? 25 };
    }
    default:
      return { tileX: 15, tileZ: 17 };
  }
}
