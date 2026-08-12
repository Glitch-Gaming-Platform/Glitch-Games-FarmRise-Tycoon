import type { GameLocalization } from './gameI18n.js';

export type DomainTextField =
  | 'name'
  | 'description'
  | 'summary'
  | 'benefit'
  | 'tradeoff'
  | 'role'
  | 'problem'
  | 'warning'
  | 'impact'
  | 'recovery'
  | 'population';

/**
 * Resolves presentation copy for shared domain definitions without moving
 * translated strings into the deterministic shared package.
 */
export function domainText(
  i18n: GameLocalization,
  domain: string,
  id: string,
  field: DomainTextField,
  fallback: string,
): string {
  return i18n.t(`domain.${domain}.${id}.${field}`, undefined, fallback);
}

export function itemName(i18n: GameLocalization, itemId: string, fallback: string): string {
  return domainText(i18n, 'item', itemId, 'name', fallback);
}

export function cropName(i18n: GameLocalization, cropId: string, fallback: string): string {
  return domainText(i18n, 'crop', cropId, 'name', fallback);
}

export function buildingName(i18n: GameLocalization, buildingId: string, fallback: string): string {
  return domainText(i18n, 'building', buildingId, 'name', fallback);
}

export function animalName(i18n: GameLocalization, species: string, fallback: string): string {
  return domainText(i18n, 'animal', species, 'name', fallback);
}

export function seasonName(i18n: GameLocalization, season: string, fallback: string): string {
  return domainText(i18n, 'season', season, 'name', fallback);
}

export function incidentName(i18n: GameLocalization, incidentId: string, fallback: string): string {
  return domainText(i18n, 'incident', incidentId, 'name', fallback);
}
