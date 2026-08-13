/**
 * Player-issued mutations, one function per intent.
 *
 * Every command is (career, args) -> Result, never throws, and never touches
 * rendering. They grew past what one file should hold when hauling, processing,
 * hiring and finance arrived, so they now live in ./commands grouped by
 * responsibility - which is the split docs/AI_INSTRUCTIONS.md asks for. This
 * file is the index, so callers keep one import.
 *
 * Note on trust: these run optimistically on the client so the game feels
 * instant. The server re-runs the equivalent checks against stored state when
 * the save is written, and rejects the write if the result is impossible. The
 * client is a predictor, never an authority (docs/NETWORKING.md).
 */
export { plant, tend, harvest, harvestForWorker, type HarvestOutcome } from './commands/farming.js';
export {
  depositCarried,
  collectStack,
  withdrawStored,
  buyCarrier,
  useCarrier,
  parkCart,
  type DepositOutcome,
} from './commands/hauling.js';
export {
  build,
  buildCostFor,
  buildingSiteProblem,
  buyAnimal,
  buyLand,
  shelterCapacity,
  animalDefinition,
} from './commands/building.js';
export {
  sellSpot,
  spotQuote,
  contractQuote,
  sellableInventory,
  sellableQuantity,
  acceptContract,
  cancelStandingContract,
  deliverContract,
  failContract,
  offeredUnitPrice,
  type ContractOffer,
  type DeliveryOutcome,
} from './commands/market.js';
export {
  queueProcessing,
  processableInventory,
  unloadProcessor,
  hireWorker,
  setWorkerPriorities,
  chooseSpecialization,
  startTownProject,
} from './commands/production.js';
export {
  borrow,
  repay,
  buyInsurance,
  cancelInsurance,
  restructureCareer,
  loanOffers,
  insurancePolicies,
} from './commands/finance.js';
