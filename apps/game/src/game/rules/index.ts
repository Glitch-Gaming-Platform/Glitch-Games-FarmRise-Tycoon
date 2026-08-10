/**
 * Game rules entry point.
 *
 * Re-exports the shared, server-validated rules alongside the client-only
 * session rules, so game code has a single import site and does not have to
 * remember which package a given rule lives in.
 */
export * from './sessionRules.js';
export {
  advancePlot,
  computeYield,
  plotStage,
  ticksUntilReady,
  storageCapacity,
  storageUsed,
  validateFulfilment,
  validateSpotSale,
  orderPayout,
  orderPremium,
  spotValue,
  canAfford,
} from '@farmrise/shared';
