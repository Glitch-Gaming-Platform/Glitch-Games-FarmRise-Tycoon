/**
 * Transition validation for career save v2.
 *
 * Each helper owns one state domain. This is intentionally not a second game
 * simulation: it rejects impossible transitions while the shared command
 * rules remain the source of truth for prices, milestones and land gates.
 */
import {
  ANIMALS,
  BARN_CAPACITY_UNITS,
  BASE_STORAGE_UNITS,
  BUILDINGS,
  CARRIERS,
  COLD_STORE_CAPACITY_UNITS,
  COMMUNITY_PROJECTS_BY_ID,
  ESTATE_PARCELS,
  INSURANCE_POLICIES,
  LOADING_PAD_CAPACITY,
  LOAN_OFFERS,
  MAX_PLAUSIBLE_EARNINGS_PER_TICK,
  MAX_PLAUSIBLE_ITEMS_PER_TICK,
  MAX_TOTAL_DEBT,
  PROCESSORS,
  RESTRUCTURE_DAILY_RATE,
  RESTRUCTURE_PRINCIPAL,
  SPECIALIZATIONS,
  STARTER_ANIMAL_PRODUCT_DROP,
  STARTER_BLOCKED_TILES,
  STARTER_SHELTER,
  YARD_STORE_ID,
  bedsForParcels,
  cents,
  claimMilestone,
  getParcel,
  getWorkerRole,
  loadWeight,
  normalizeEstateLayout,
  parcelAt,
  processorBuildCost,
  prosperityForDelivery,
  requireCrop,
  storageUsed,
  townStageFor,
  validateLandPurchase,
  type CareerSaveState,
  type CareerStage,
  type AnimalSpecies,
  type BuildingKind,
  type FarmSiteSaveState,
  type ProcessorKind,
  type ProgressionState,
  type SaveState,
  type SpecializationId,
} from '@farmrise/shared';

export interface ValidationOutcome {
  readonly ok: boolean;
  readonly reason?: string;
}

const OK: ValidationOutcome = { ok: true };
const reject = (reason: string): ValidationOutcome => ({ ok: false, reason });

export function validateSaveTransition(
  previous: SaveState,
  next: SaveState,
  maxAllowedTick: number,
): ValidationOutcome {
  previous = normalizeEstateLayout(previous).state;
  next = normalizeEstateLayout(next).state;
  if (next.careerId !== previous.careerId) return reject('Career id changed.');
  if (next.seed !== previous.seed) return reject('Career seed changed.');
  if (next.tick < previous.tick) return reject('Save tick went backwards.');
  if (next.tick > maxAllowedTick) {
    return reject('Save tick advanced further than wall time allows.');
  }

  const elapsedTicks = next.tick - previous.tick;
  const balanceGain = next.balance - previous.balance;
  const earningsAllowance = MAX_PLAUSIBLE_EARNINGS_PER_TICK * elapsedTicks + 1;
  const borrowed = Math.max(0, loanPrincipal(next) - loanPrincipal(previous));
  const milestoneReward = milestoneRewardAdded(previous, next);
  if (balanceGain > earningsAllowance + borrowed + milestoneReward) {
    return reject('Balance increased by more than the elapsed time allows.');
  }

  const gainedItems = totalCareerItems(next) - totalCareerItems(previous);
  if (gainedItems > MAX_PLAUSIBLE_ITEMS_PER_TICK * elapsedTicks + 1) {
    return reject('Stored goods grew by more than production allows.');
  }

  const statistics = validateStatistics(previous, next);
  if (!statistics.ok) return statistics;

  const progression = validateProgression(previous, next);
  if (!progression.ok) return progression;

  const finance = validateFinance(previous, next);
  if (!finance.ok) return finance;

  const town = validateTown(previous, next, elapsedTicks);
  if (!town.ok) return town;

  const sites = validateSites(previous, next, elapsedTicks);
  if (!sites.ok) return sites;

  const knownSpend = transitionSpend(previous, next) + debtRepaid(previous, next);
  if (
    next.balance >
    previous.balance + earningsAllowance + borrowed + milestoneReward - knownSpend
  ) {
    return reject('New land, buildings, animals or staff were not paid for.');
  }

  return OK;
}

function validateFinance(previous: SaveState, next: SaveState): ValidationOutcome {
  if (next.loans.reduce((sum, loan) => sum + loan.outstanding, 0) > MAX_TOTAL_DEBT) {
    return reject('Total debt exceeds the lending limit.');
  }

  const previousById = new Map(previous.loans.map((loan) => [loan.id, loan]));
  const ids = new Set<string>();
  for (const loan of next.loans) {
    if (ids.has(loan.id)) return reject(`Loan ${loan.id} is duplicated.`);
    ids.add(loan.id);
    const before = previousById.get(loan.id);
    if (before) {
      if (
        before.principal !== loan.principal ||
        before.dailyRate !== loan.dailyRate ||
        before.takenTick !== loan.takenTick ||
        before.origin !== loan.origin
      ) {
        return reject(`Loan ${loan.id} changed its terms.`);
      }
      if (loan.outstanding > before.outstanding) {
        return reject(`Loan ${loan.id} increased its outstanding balance.`);
      }
      continue;
    }

    if (loan.takenTick < previous.tick || loan.takenTick > next.tick) {
      return reject(`Loan ${loan.id} has an impossible start tick.`);
    }
    if (loan.origin === 'chosen') {
      if (!next.unlocks.includes('loans')) return reject('A loan was taken before loans unlocked.');
      const offer = LOAN_OFFERS.find((candidate) => loan.id.startsWith(`${candidate.id}-`));
      if (
        !offer ||
        loan.principal !== offer.principal ||
        loan.dailyRate !== offer.dailyRate ||
        loan.outstanding > offer.principal
      ) {
        return reject(`Loan ${loan.id} does not match a bank offer.`);
      }
    } else if (
      !loan.id.startsWith('loan-restructure-') ||
      loan.principal !== RESTRUCTURE_PRINCIPAL ||
      loan.dailyRate !== RESTRUCTURE_DAILY_RATE ||
      loan.outstanding > RESTRUCTURE_PRINCIPAL
    ) {
      return reject(`Loan ${loan.id} does not match restructuring terms.`);
    }
  }

  if (next.insurance) {
    if (!next.unlocks.includes('insurance')) {
      return reject('Insurance was taken before it unlocked.');
    }
    const policy = INSURANCE_POLICIES.find(
      (candidate) => candidate.policyId === next.insurance?.policyId,
    );
    if (
      !policy ||
      next.insurance.premiumPerDay !== policy.premiumPerDay ||
      next.insurance.coverage !== policy.coverage ||
      next.insurance.startedTick > next.tick
    ) {
      return reject('Insurance terms do not match a real policy.');
    }
    if (
      previous.insurance?.policyId === next.insurance.policyId &&
      (next.insurance.startedTick !== previous.insurance.startedTick ||
        next.insurance.claimsMade < previous.insurance.claimsMade)
    ) {
      return reject('The active insurance policy went backwards.');
    }
  }
  return OK;
}

function validateTown(
  previous: SaveState,
  next: SaveState,
  elapsedTicks: number,
): ValidationOutcome {
  if (previous.town.completedProjectIds.some((id) => !next.town.completedProjectIds.includes(id))) {
    return reject('A completed town project disappeared.');
  }
  if (new Set(next.town.completedProjectIds).size !== next.town.completedProjectIds.length) {
    return reject('A town project is duplicated.');
  }
  if (next.town.completedProjectIds.some((id) => !COMMUNITY_PROJECTS_BY_ID[id])) {
    return reject('An unknown town project was completed.');
  }

  const added = next.town.completedProjectIds.filter(
    (id) => !previous.town.completedProjectIds.includes(id),
  );
  if (added.length > 1) return reject('More than one town project completed in one transition.');

  const before = previous.town.activeProject;
  const after = next.town.activeProject;
  if (before && after) {
    if (before.id !== after.id) return reject('The active town project changed identity.');
    if (!sameItems(before.contributedItems, after.contributedItems)) {
      return reject('Contributed town-project materials changed.');
    }
    if (
      after.remainingTicks > before.remainingTicks ||
      before.remainingTicks - after.remainingTicks > elapsedTicks + 1
    ) {
      return reject('The town project advanced faster than time passed.');
    }
  } else if (before && !after) {
    if (!added.includes(before.id) || before.remainingTicks > elapsedTicks + 1) {
      return reject('The active town project disappeared before completion.');
    }
  } else if (!before && after) {
    const project = COMMUNITY_PROJECTS_BY_ID[after.id];
    if (!project) return reject('An unknown town project was started.');
    if (!next.unlocks.includes('town_projects')) {
      return reject('A town project was started before projects unlocked.');
    }
    if (previous.town.completedProjectIds.includes(project.id)) {
      return reject('A completed town project was started again.');
    }
    if (townStageFor(next.town.prosperity).stage < project.requiresTownStage) {
      return reject('The town is not large enough for that project.');
    }
    if (!sameItems(after.contributedItems, project.materials)) {
      return reject('The town project did not receive its required materials.');
    }
    if (
      after.remainingTicks > project.buildTicks ||
      after.remainingTicks < Math.max(0, project.buildTicks - elapsedTicks - 1)
    ) {
      return reject('The town project has an impossible build timer.');
    }
  }

  if (added.length === 1 && !before) {
    const project = COMMUNITY_PROJECTS_BY_ID[added[0]!];
    if (!project || elapsedTicks + 1 < project.buildTicks) {
      return reject('A town project completed without enough build time.');
    }
  }

  const delivered = Math.max(0, next.statistics.itemsSold - previous.statistics.itemsSold);
  const contracts = Math.max(
    0,
    next.statistics.contractsCompleted - previous.statistics.contractsCompleted,
  );
  const projectProsperity = added.reduce(
    (sum, id) => sum + (COMMUNITY_PROJECTS_BY_ID[id]?.prosperity ?? 0),
    0,
  );
  const maximumIncrease = prosperityForDelivery(delivered) + contracts * 4 + projectProsperity + 1;
  if (next.town.prosperity - previous.town.prosperity > maximumIncrease) {
    return reject('Town prosperity increased without enough deliveries or projects.');
  }
  return OK;
}

function validateStatistics(previous: SaveState, next: SaveState): ValidationOutcome {
  for (const key of Object.keys(previous.statistics) as (keyof SaveState['statistics'])[]) {
    if (next.statistics[key] < previous.statistics[key]) {
      return reject(`Career statistic ${key} decreased.`);
    }
  }
  if (next.statistics.peakBalance < next.balance) {
    return reject('Peak balance is lower than the current balance.');
  }
  const earned = next.statistics.lifetimeEarned - previous.statistics.lifetimeEarned;
  const sold = next.statistics.itemsSold - previous.statistics.itemsSold;
  if (earned > 0 && sold <= 0) {
    return reject('Lifetime earnings increased without a sale.');
  }
  return OK;
}

function validateProgression(previous: SaveState, next: SaveState): ValidationOutcome {
  if (next.stage < previous.stage || next.stage > previous.stage + 1) {
    return reject('Career stage changed by an illegal amount.');
  }

  const previousMilestones = new Set(previous.completedMilestoneIds);
  const addedMilestones = next.completedMilestoneIds.filter((id) => !previousMilestones.has(id));
  if (
    next.completedMilestoneIds.some((id) => !previousMilestones.has(id)) &&
    next.stage === previous.stage
  ) {
    return reject('A milestone was recorded without advancing the career stage.');
  }
  if (previous.completedMilestoneIds.some((id) => !next.completedMilestoneIds.includes(id))) {
    return reject('A completed milestone disappeared.');
  }

  const previousUnlocks = new Set(previous.unlocks);
  if (previous.unlocks.some((unlock) => !next.unlocks.includes(unlock))) {
    return reject('An earned unlock disappeared.');
  }

  if (next.stage === previous.stage) {
    if (addedMilestones.length > 0) return reject('Unexpected milestone transition.');
    if (next.unlocks.some((unlock) => !previousUnlocks.has(unlock))) {
      return reject('An unlock was inserted without a milestone.');
    }
  } else {
    if (addedMilestones.length !== 1) return reject('A stage advance must claim one milestone.');
    const check = claimMilestone(addedMilestones[0]!, {
      ...progressionState(next),
      stage: previous.stage as CareerStage,
      completedMilestoneIds: previous.completedMilestoneIds,
    });
    if (!check.ok || check.value.stage !== next.stage) {
      return reject(check.ok ? 'Milestone advanced to the wrong stage.' : check.reason);
    }
    const allowed = new Set([...previous.unlocks, ...check.value.unlocked]);
    if (next.unlocks.some((unlock) => !allowed.has(unlock))) {
      return reject('The milestone granted an unknown unlock.');
    }
    if (check.value.unlocked.some((unlock) => !next.unlocks.includes(unlock))) {
      return reject('The milestone did not grant all of its unlocks.');
    }
  }

  if (previous.specialization && !next.specialization) {
    return reject('A chosen farm specialization cannot be cleared.');
  }
  if (previous.specialization !== next.specialization && !next.unlocks.includes('specialization')) {
    return reject('A specialization was chosen before it was unlocked.');
  }
  return OK;
}

function validateSites(
  previous: SaveState,
  next: SaveState,
  elapsedTicks: number,
): ValidationOutcome {
  if (!next.sites.some((site) => site.id === next.activeSiteId)) {
    return reject('The active farm site does not exist.');
  }
  if (next.sites.length < previous.sites.length) return reject('A farm site disappeared.');
  if (next.sites.length > previous.sites.length) {
    return reject('Additional farm sites are not enabled in this build yet.');
  }

  const previousById = new Map(previous.sites.map((site) => [site.id, site]));
  for (const site of next.sites) {
    const before = previousById.get(site.id);
    if (!before) return reject(`Unknown farm site ${site.id}.`);
    const outcome = validateSite(before, site, next, elapsedTicks);
    if (!outcome.ok) return outcome;
  }
  return OK;
}

function validateSite(
  previous: FarmSiteSaveState,
  next: FarmSiteSaveState,
  career: CareerSaveState,
  elapsedTicks: number,
): ValidationOutcome {
  if (
    next.id !== previous.id ||
    next.regionId !== previous.regionId ||
    next.levelId !== previous.levelId ||
    next.seed !== previous.seed
  ) {
    return reject(`Farm site ${previous.id} changed identity.`);
  }
  if (next.lastSimulatedTick < previous.lastSimulatedTick || next.lastSimulatedTick > career.tick) {
    return reject(`Farm site ${next.id} has an invalid simulation tick.`);
  }

  const land = validateParcels(previous, next, career);
  if (!land.ok) return land;
  const plots = validatePlots(previous, next, elapsedTicks);
  if (!plots.ok) return plots;
  const buildings = validateBuildings(previous, next, career.unlocks, elapsedTicks);
  if (!buildings.ok) return buildings;
  const stores = validateStores(next);
  if (!stores.ok) return stores;
  const carry = validateCarry(previous, next, career.unlocks);
  if (!carry.ok) return carry;
  const workers = validateWorkers(previous, next, career.unlocks);
  if (!workers.ok) return workers;
  return OK;
}

function validateParcels(
  previous: FarmSiteSaveState,
  next: FarmSiteSaveState,
  career: CareerSaveState,
): ValidationOutcome {
  if (previous.ownedParcelIds.some((id) => !next.ownedParcelIds.includes(id))) {
    return reject('Owned land disappeared.');
  }
  const added = next.ownedParcelIds.filter((id) => !previous.ownedParcelIds.includes(id));
  if (added.length > 1) return reject('More than one parcel was bought in one transition.');
  if (added.length === 1) {
    const allowance = cents(
      career.balance +
        MAX_PLAUSIBLE_EARNINGS_PER_TICK * Math.max(0, career.tick - previous.lastSimulatedTick),
    );
    const check = validateLandPurchase(added[0]!, previous.ownedParcelIds, allowance, career.stage);
    if (!check.ok) return reject(check.reason);
  }
  if (next.ownedParcelIds.some((id) => !getParcel(id))) return reject('Unknown parcel id.');
  return OK;
}

function validatePlots(
  previous: FarmSiteSaveState,
  next: FarmSiteSaveState,
  elapsedTicks: number,
): ValidationOutcome {
  const legalBeds = new Set(bedsForParcels(next.ownedParcelIds).map((bed) => bed.id));
  const previousById = new Map(previous.plots.map((plot) => [String(plot.id), plot]));
  const nextIds = new Set<string>();
  for (const plot of next.plots) {
    const id = String(plot.id);
    if (nextIds.has(id)) return reject(`Plot ${id} is duplicated.`);
    nextIds.add(id);
    if (!legalBeds.has(id)) return reject(`Plot ${id} is not on owned land.`);
    if (!plot.cropId) continue;
    const crop = requireCrop(plot.cropId);
    if (plot.grownTicks > crop.growthTicks + 1) {
      return reject(`Plot ${id} is grown beyond its crop's maximum.`);
    }
    const before = previousById.get(id);
    if (before?.cropId === plot.cropId && plot.grownTicks - before.grownTicks > elapsedTicks + 1) {
      return reject(`Plot ${id} grew faster than time passed.`);
    }
  }
  if (previous.plots.some((plot) => !nextIds.has(String(plot.id)))) {
    return reject('A crop bed disappeared.');
  }
  for (const bedId of legalBeds) {
    if (!nextIds.has(bedId)) return reject(`Owned crop bed ${bedId} is missing.`);
  }
  return OK;
}

function validateBuildings(
  previous: FarmSiteSaveState,
  next: FarmSiteSaveState,
  unlocks: readonly string[],
  elapsedTicks: number,
): ValidationOutcome {
  const previousById = new Map(previous.buildings.map((building) => [building.id, building]));
  const ids = new Set<string>();
  const occupied = new Set<string>();
  const bedTiles = new Set(
    ESTATE_PARCELS.flatMap((parcel) => parcel.beds.map((bed) => tileKey(bed.tileX, bed.tileZ))),
  );
  const blocked = new Set([
    ...STARTER_BLOCKED_TILES.map((tile) => tileKey(tile.tileX, tile.tileZ)),
    tileKey(STARTER_SHELTER.tileX, STARTER_SHELTER.tileZ),
    tileKey(STARTER_ANIMAL_PRODUCT_DROP.tileX, STARTER_ANIMAL_PRODUCT_DROP.tileZ),
  ]);

  for (const building of next.buildings) {
    if (ids.has(building.id)) return reject(`Building ${building.id} is duplicated.`);
    ids.add(building.id);
    const kind = building.kind as BuildingKind;
    const definition = BUILDINGS[kind];
    if (definition.requiresUnlock && !unlocks.includes(definition.requiresUnlock)) {
      return reject(`${definition.displayName} was built before it was unlocked.`);
    }

    const before = previousById.get(building.id);
    if (before) {
      if (
        before.kind !== building.kind ||
        before.tileX !== building.tileX ||
        before.tileZ !== building.tileZ
      ) {
        return reject(`Building ${building.id} changed identity or location.`);
      }
      if (building.remainingBuildTicks > before.remainingBuildTicks) {
        return reject(`Building ${building.id} gained construction time.`);
      }
      if (before.remainingBuildTicks - building.remainingBuildTicks > elapsedTicks + 1) {
        return reject(`Building ${building.id} completed faster than time passed.`);
      }
    }

    for (let dz = 0; dz < definition.footprint.depth; dz += 1) {
      for (let dx = 0; dx < definition.footprint.width; dx += 1) {
        const x = building.tileX + dx;
        const z = building.tileZ + dz;
        const key = tileKey(x, z);
        const parcel = parcelAt(x, z);
        if (!parcel || !next.ownedParcelIds.includes(parcel.id)) {
          return reject(`Building ${building.id} is outside owned land.`);
        }
        if (bedTiles.has(key) || blocked.has(key)) {
          return reject(`Building ${building.id} occupies a protected tile.`);
        }
        if (occupied.has(key)) return reject(`Buildings overlap at tile ${key}.`);
        occupied.add(key);
      }
    }
  }
  if (previous.buildings.some((building) => !ids.has(building.id))) {
    return reject('A building disappeared.');
  }
  return OK;
}

function validateStores(site: FarmSiteSaveState): ValidationOutcome {
  const buildings = new Map(site.buildings.map((building) => [building.id, building]));
  const storeIds = new Set<string>();
  const buildingsWithStores = new Set<string>();
  for (const store of site.stores) {
    if (storeIds.has(store.id)) return reject(`Store ${store.id} is duplicated.`);
    storeIds.add(store.id);
    if (storageUsed(store.items) > store.capacity + 0.001) {
      return reject(`Store ${store.id} exceeds its capacity.`);
    }

    if (store.buildingId === null) {
      const expected = store.id === YARD_STORE_ID ? BASE_STORAGE_UNITS : 999;
      if (store.id !== YARD_STORE_ID && !store.id.startsWith('stack-')) {
        return reject(`Store ${store.id} has no building or field-stack identity.`);
      }
      if (store.capacity !== expected || store.preserving) {
        return reject(`Store ${store.id} has impossible storage properties.`);
      }
      continue;
    }

    if (buildingsWithStores.has(store.buildingId)) {
      return reject(`Building ${store.buildingId} has more than one store.`);
    }
    buildingsWithStores.add(store.buildingId);
    const building = buildings.get(store.buildingId);
    if (!building || building.remainingBuildTicks > 0) {
      return reject(`Store ${store.id} is not backed by a completed building.`);
    }
    const capacity = storageForBuilding(building.kind as BuildingKind);
    if (
      capacity <= 0 ||
      store.capacity !== capacity ||
      store.tileX !== building.tileX ||
      store.tileZ !== building.tileZ ||
      store.preserving !== (building.kind === 'cold_store')
    ) {
      return reject(`Store ${store.id} does not match its building.`);
    }
  }
  return OK;
}

function validateCarry(
  previous: FarmSiteSaveState,
  next: FarmSiteSaveState,
  unlocks: readonly string[],
): ValidationOutcome {
  if (!next.carried.ownedCarriers.includes(next.carried.carrier)) {
    return reject('The active carrier is not owned.');
  }
  if (loadWeight(next.carried.items) > CARRIERS[next.carried.carrier].capacity) {
    return reject('The active carrier is overloaded.');
  }
  if (previous.carried.ownedCarriers.some((kind) => !next.carried.ownedCarriers.includes(kind))) {
    return reject('An owned carrier disappeared.');
  }
  for (const kind of next.carried.ownedCarriers) {
    const definition = CARRIERS[kind];
    if (definition.requiresUnlock && !unlocks.includes(definition.requiresUnlock)) {
      return reject(`${definition.displayName} was acquired before it was unlocked.`);
    }
  }
  return OK;
}

function validateWorkers(
  previous: FarmSiteSaveState,
  next: FarmSiteSaveState,
  unlocks: readonly string[],
): ValidationOutcome {
  if (next.workers.length > 0 && !unlocks.includes('workers')) {
    return reject('Workers were hired before they were unlocked.');
  }
  const previousById = new Map(previous.workers.map((worker) => [worker.id, worker]));
  const ids = new Set<string>();
  for (const worker of next.workers) {
    if (ids.has(worker.id)) return reject(`Worker ${worker.id} is duplicated.`);
    ids.add(worker.id);
    const before = previousById.get(worker.id);
    if (before && before.role !== worker.role) return reject(`Worker ${worker.id} changed role.`);
    const role = getWorkerRole(worker.role);
    if (!role || loadWeight(worker.carrying) > role.carryCapacity) {
      return reject(`Worker ${worker.id} is carrying an impossible load.`);
    }
  }
  return OK;
}

function transitionSpend(previous: SaveState, next: SaveState): number {
  let total = 0;
  if (previous.specialization && next.specialization !== previous.specialization) {
    total += SPECIALIZATIONS[previous.specialization as SpecializationId].switchCost;
  }
  if (!previous.town.activeProject && next.town.activeProject) {
    total += COMMUNITY_PROJECTS_BY_ID[next.town.activeProject.id]?.cost ?? 0;
  } else if (!previous.town.activeProject) {
    const completed = next.town.completedProjectIds.find(
      (id) => !previous.town.completedProjectIds.includes(id),
    );
    if (completed) total += COMMUNITY_PROJECTS_BY_ID[completed]?.cost ?? 0;
  }
  const previousSites = new Map(previous.sites.map((site) => [site.id, site]));
  for (const site of next.sites) {
    const before = previousSites.get(site.id);
    if (!before) continue;
    for (const parcelId of site.ownedParcelIds) {
      if (!before.ownedParcelIds.includes(parcelId))
        total += getParcel(parcelId)?.purchaseCost ?? 0;
    }

    const oldBuildings = new Set(before.buildings.map((building) => building.id));
    for (const building of site.buildings) {
      if (oldBuildings.has(building.id)) continue;
      const kind = building.kind as BuildingKind;
      total += PROCESSORS[kind as ProcessorKind]
        ? processorBuildCost(kind as ProcessorKind, next.specialization as SpecializationId | null)
        : BUILDINGS[kind].buildCost;
    }

    const oldAnimalCounts = animalCounts(before);
    const newAnimalCounts = animalCounts(site);
    for (const species of Object.keys(newAnimalCounts) as AnimalSpecies[]) {
      const definition = ANIMALS[species];
      total +=
        Math.max(0, (newAnimalCounts[species] ?? 0) - (oldAnimalCounts[species] ?? 0)) *
        definition.purchaseCost;
    }

    const oldWorkers = new Set(before.workers.map((worker) => worker.id));
    for (const worker of site.workers) {
      if (!oldWorkers.has(worker.id)) total += getWorkerRole(worker.role)?.hiringCost ?? 0;
    }

    for (const carrier of site.carried.ownedCarriers) {
      if (!before.carried.ownedCarriers.includes(carrier)) total += CARRIERS[carrier].purchaseCost;
    }
  }
  return total;
}

function debtRepaid(previous: SaveState, next: SaveState): number {
  const nextById = new Map(next.loans.map((loan) => [loan.id, loan]));
  let total = 0;
  for (const loan of previous.loans) {
    total += Math.max(0, loan.outstanding - (nextById.get(loan.id)?.outstanding ?? 0));
  }
  const previousIds = new Set(previous.loans.map((loan) => loan.id));
  for (const loan of next.loans) {
    if (!previousIds.has(loan.id)) total += Math.max(0, loan.principal - loan.outstanding);
  }
  return total;
}

function progressionState(state: SaveState): ProgressionState {
  const site = state.sites.find((entry) => entry.id === state.activeSiteId) ?? state.sites[0]!;
  return {
    stage: state.stage as CareerStage,
    completedMilestoneIds: state.completedMilestoneIds,
    lifetimeEarned: state.statistics.lifetimeEarned,
    buyersServed: Object.values(state.buyers).filter((buyer) => buyer.deliveries > 0).length,
    parcelsOwned: site.ownedParcelIds.length,
    contractsCompleted: state.statistics.contractsCompleted,
    goodsHauled: state.statistics.goodsHauled,
    goodsProcessed: state.statistics.goodsProcessed,
    seasonsCompleted: state.statistics.seasonsCompleted,
    workersEmployed: site.workers.length,
    townProjects: state.town.completedProjectIds.length,
  };
}

function milestoneRewardAdded(previous: SaveState, next: SaveState): number {
  const added = next.completedMilestoneIds.find(
    (id) => !previous.completedMilestoneIds.includes(id),
  );
  if (!added) return 0;
  const check = claimMilestone(added, {
    ...progressionState(next),
    stage: previous.stage as CareerStage,
    completedMilestoneIds: previous.completedMilestoneIds,
  });
  return check.ok ? check.value.milestone.reward : 0;
}

function loanPrincipal(state: SaveState): number {
  return state.loans.reduce((sum, loan) => sum + loan.principal, 0);
}

function totalCareerItems(state: SaveState): number {
  return state.sites.reduce((sum, site) => {
    const inventories = [
      ...site.stores.map((store) => store.items),
      site.carried.items,
      ...site.processors.map((processor) => processor.held),
      ...site.workers.map((worker) => worker.carrying),
    ];
    return sum + inventories.reduce((siteSum, inventory) => siteSum + totalItems(inventory), 0);
  }, 0);
}

function totalItems(inventory: Readonly<Record<string, number>>): number {
  return Object.values(inventory).reduce((sum, quantity) => sum + Math.max(0, quantity), 0);
}

function sameItems(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if ((left[key] ?? 0) !== (right[key] ?? 0)) return false;
  }
  return true;
}

function animalCounts(site: FarmSiteSaveState): Partial<Record<AnimalSpecies, number>> {
  const counts: Partial<Record<AnimalSpecies, number>> = {};
  for (const group of site.animals) {
    const species = group.species as AnimalSpecies;
    counts[species] = (counts[species] ?? 0) + group.count;
  }
  return counts;
}

function storageForBuilding(kind: BuildingKind): number {
  if (kind === 'barn') return BARN_CAPACITY_UNITS;
  if (kind === 'cold_store') return COLD_STORE_CAPACITY_UNITS;
  if (kind === 'loading_pad') return LOADING_PAD_CAPACITY;
  return 0;
}

function tileKey(tileX: number, tileZ: number): string {
  return `${tileX}:${tileZ}`;
}
