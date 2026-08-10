/**
 * Service wiring. One place to construct services, so a route handler never
 * news up a dependency and tests can substitute repositories wholesale.
 */
import { getRepositories } from '../repositories/container';
import type { Repositories } from '../repositories/ports';
import { AuthService } from './authService';
import { MarketService } from './marketService';
import { SaveService } from './saveService';

export interface Services {
  readonly repositories: Repositories;
  readonly auth: AuthService;
  readonly saves: SaveService;
  readonly market: MarketService;
}

export function createServices(repositories: Repositories): Services {
  const saves = new SaveService(repositories);
  return {
    repositories,
    auth: new AuthService(repositories),
    saves,
    market: new MarketService(repositories, saves),
  };
}

let cached: Services | null = null;

export function getServices(): Services {
  cached ??= createServices(getRepositories());
  return cached;
}

/** Test seam. */
export function setServices(services: Services | null): void {
  cached = services;
}
