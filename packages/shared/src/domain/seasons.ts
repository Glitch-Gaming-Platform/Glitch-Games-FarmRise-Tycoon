/**
 * The career calendar.
 *
 * A season is a planning and review cadence, not a reset (see
 * docs/PROGRESSION_GAMEPLAY_PLAN.md, "Layer B — Seasonal operation"). Nothing a
 * player owns is taken away at a season boundary; what changes is which crops
 * suit the weather, which contracts appear and what the town is asking for.
 *
 * The calendar is derived from the career tick alone, so the client and the
 * server always agree on the date without either of them storing it.
 */
import { GAME_DAY_TICKS, type Ticks } from './time.js';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];

/** In-game days per season. Four seasons of six days is roughly 96 minutes a year. */
export const DAYS_PER_SEASON = 6;
export const SEASON_TICKS = DAYS_PER_SEASON * GAME_DAY_TICKS;
export const YEAR_TICKS = SEASON_TICKS * SEASONS.length;

export interface SeasonDefinition {
  readonly id: Season;
  readonly displayName: string;
  /** Multiplier on growth speed for crops that suit the season. */
  readonly growthModifier: number;
  /** Multiplier on natural water loss. Summer dries plots out fastest. */
  readonly waterDrainModifier: number;
  /** Multiplier on the chance an eligible event is scheduled. */
  readonly eventPressure: number;
  /** Multiplier applied to spot prices, before any buyer relationship. */
  readonly demandModifier: number;
  readonly summary: string;
}

export const SEASON_DEFINITIONS: Readonly<Record<Season, SeasonDefinition>> = Object.freeze({
  spring: {
    id: 'spring',
    displayName: 'Spring',
    growthModifier: 1.1,
    waterDrainModifier: 0.9,
    eventPressure: 0.9,
    demandModifier: 1,
    summary: 'Long light and wet ground. Everything grows; nothing pays especially well.',
  },
  summer: {
    id: 'summer',
    displayName: 'Summer',
    growthModifier: 1,
    waterDrainModifier: 1.45,
    eventPressure: 1.25,
    demandModifier: 1.08,
    summary: 'The best growing weather and the worst water. Drought season.',
  },
  autumn: {
    id: 'autumn',
    displayName: 'Autumn',
    growthModifier: 0.95,
    waterDrainModifier: 0.85,
    eventPressure: 1.1,
    demandModifier: 1.18,
    summary: 'Harvest prices peak while the weather turns. Sell what you have held.',
  },
  winter: {
    id: 'winter',
    displayName: 'Winter',
    growthModifier: 0.6,
    waterDrainModifier: 0.5,
    eventPressure: 1.05,
    demandModifier: 1.25,
    summary: 'Fields are slow and stores are thin. Processing and animals carry you.',
  },
});

export interface CalendarDate {
  /** Career year, starting at 1. */
  readonly year: number;
  readonly season: Season;
  /** Day within the season, starting at 1. */
  readonly day: number;
  /** Ticks elapsed within the current season. */
  readonly seasonTicks: Ticks;
}

export function calendarAt(careerTick: Ticks): CalendarDate {
  const tick = Math.max(0, Math.floor(careerTick));
  const year = Math.floor(tick / YEAR_TICKS) + 1;
  const withinYear = tick % YEAR_TICKS;
  const seasonIndex = Math.floor(withinYear / SEASON_TICKS);
  const seasonTicks = withinYear % SEASON_TICKS;
  return {
    year,
    season: SEASONS[seasonIndex] as Season,
    day: Math.floor(seasonTicks / GAME_DAY_TICKS) + 1,
    seasonTicks,
  };
}

export function seasonAt(careerTick: Ticks): Season {
  return calendarAt(careerTick).season;
}

/** Ticks remaining before the next season boundary. Drives the season banner. */
export function ticksUntilNextSeason(careerTick: Ticks): Ticks {
  return SEASON_TICKS - calendarAt(careerTick).seasonTicks;
}

/** Absolute career tick at which the given season index boundary falls. */
export function seasonBoundaryTick(seasonsElapsed: number): Ticks {
  return Math.max(0, Math.floor(seasonsElapsed)) * SEASON_TICKS;
}

/** How many whole season boundaries lie between two career ticks. */
export function seasonsBetween(fromTick: Ticks, toTick: Ticks): number {
  if (toTick <= fromTick) return 0;
  return Math.floor(toTick / SEASON_TICKS) - Math.floor(fromTick / SEASON_TICKS);
}

export function seasonDefinition(season: Season): SeasonDefinition {
  return SEASON_DEFINITIONS[season];
}
