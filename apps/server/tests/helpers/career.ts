import {
  combineStoreInventories,
  type FarmSiteSaveState,
  type Inventory,
  type SaveState,
} from '@farmrise/shared';

export function activeSite(state: SaveState): FarmSiteSaveState {
  const site = state.sites.find((entry) => entry.id === state.activeSiteId);
  if (!site) throw new Error('Test career has no active site.');
  return site;
}

export function activeInventory(state: SaveState): Inventory {
  return combineStoreInventories(activeSite(state).stores);
}

export function withActiveStoreItems(
  state: SaveState,
  items: Readonly<Record<string, number>>,
  tick = state.tick,
): SaveState {
  const current = activeSite(state);
  return {
    ...state,
    tick,
    sites: state.sites.map((site) =>
      site.id === current.id
        ? {
            ...site,
            lastSimulatedTick: tick,
            stores: site.stores.map((store, index) =>
              index === 0 ? { ...store, items: { ...items } } : store,
            ),
          }
        : site,
    ),
  };
}
