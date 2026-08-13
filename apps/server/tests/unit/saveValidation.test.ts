import { describe, expect, it } from 'vitest';
import {
  ANIMALS,
  BUILDINGS,
  COMMUNITY_PROJECTS_BY_ID,
  INSURANCE_POLICIES,
  LOAN_OFFERS,
  MILESTONES,
  PARCELS_BY_ID,
  SPECIALIZATIONS,
  STARTER_ANIMAL_PRODUCT_DROP,
  STARTER_SHELTER_ID,
  animalShelterProductDropTile,
  cents,
  newCareer,
  requireCrop,
  type FarmSiteSaveState,
  type SaveState,
} from '@farmrise/shared';
import { validateSaveTransition } from '@/services/saveValidation';

const fresh = (): SaveState => {
  const state = newCareer({ careerId: 'validation-career', seed: 1 });
  return { ...state, tick: 1_000 };
};

const later = (state: SaveState, overrides: Partial<SaveState> = {}, elapsed = 600): SaveState => ({
  ...state,
  tick: state.tick + elapsed,
  ...overrides,
});

function updateSite(
  state: SaveState,
  mutate: (site: FarmSiteSaveState) => FarmSiteSaveState,
): SaveState {
  return {
    ...state,
    sites: state.sites.map((site) => (site.id === state.activeSiteId ? mutate(site) : site)),
  };
}

function withYardItems(state: SaveState, items: Record<string, number>): SaveState {
  return updateSite(state, (site) => ({
    ...site,
    stores: site.stores.map((store, index) => (index === 0 ? { ...store, items } : store)),
  }));
}

describe('validateSaveTransition', () => {
  it('accepts an ordinary continuation', () => {
    const base = fresh();
    expect(validateSaveTransition(base, later(base), base.tick + 600).ok).toBe(true);
  });

  it('allows only the processor required by an open pre-milestone contract', () => {
    const base = fresh();
    base.stage = 1;
    base.unlocks = ['contracts'];
    base.contracts = [
      {
        id: 'offer-preserves-regression',
        buyerId: 'growers_co_op',
        itemId: 'preserves',
        quantity: 21,
        delivered: 0,
        unitPrice: cents(342),
        minimumQuality: 0,
        acceptedTick: base.tick,
        deadlineTick: base.tick + 72_000,
        recurringEveryTicks: 0,
        status: 'open',
      },
    ];
    const cost = BUILDINGS.preserve_kitchen.buildCost;
    const next = updateSite(
      later(base, {
        balance: cents(base.balance - cost),
        statistics: {
          ...base.statistics,
          lifetimeSpent: base.statistics.lifetimeSpent + cost,
        },
      }),
      (site) => ({
        ...site,
        buildings: [
          ...site.buildings,
          {
            id: 'building-contract-preserves',
            kind: 'preserve_kitchen',
            tileX: 20,
            tileZ: 18,
            rotation: 0,
            remainingBuildTicks: BUILDINGS.preserve_kitchen.buildTicks,
            broken: false,
          },
        ],
      }),
    );

    expect(validateSaveTransition(base, next, next.tick)).toEqual({ ok: true });

    const withoutContract = { ...base, contracts: [] };
    const forged = { ...next, contracts: [] };
    expect(validateSaveTransition(withoutContract, forged, forged.tick).reason).toMatch(
      /unlocked/i,
    );
  });

  it('rejects time going backwards or beyond wall time', () => {
    const base = fresh();
    expect(validateSaveTransition(base, { ...base, tick: base.tick - 1 }, base.tick).ok).toBe(
      false,
    );
    expect(
      validateSaveTransition(base, { ...base, tick: base.tick + 601 }, base.tick + 600).ok,
    ).toBe(false);
  });

  it('rejects an impossible balance jump but allows spending', () => {
    const base = fresh();
    expect(
      validateSaveTransition(base, later(base, { balance: cents(99_999_999) }), base.tick + 600)
        .reason,
    ).toMatch(/Balance/);
    expect(
      validateSaveTransition(base, later(base, { balance: cents(0) }), base.tick + 600).ok,
    ).toBe(true);
  });

  it('rejects goods materialising or exceeding a localized store', () => {
    const base = fresh();
    const impossible = withYardItems(later(base), { wheat: 5_000 });
    expect(validateSaveTransition(base, impossible, impossible.tick).ok).toBe(false);

    const before = withYardItems(base, { wheat: 59 });
    const overflow = withYardItems(later(before, {}, 100_000), { wheat: 61 });
    expect(validateSaveTransition(before, overflow, overflow.tick).reason).toMatch(/capacity/i);
  });

  it('rejects several parcel purchases and land disappearing', () => {
    const base = fresh();
    const several = updateSite(later(base), (site) => ({
      ...site,
      ownedParcelIds: [site.ownedParcelIds[0]!, 'parcel-starter-extension', 'parcel-north-field'],
    }));
    expect(validateSaveTransition(base, several, several.tick).ok).toBe(false);

    const previous = updateSite(base, (site) => ({
      ...site,
      ownedParcelIds: [...site.ownedParcelIds, 'parcel-starter-extension', 'parcel-north-field'],
      plots: [
        ...site.plots,
        ...PARCEL('parcel-starter-extension').beds.map(emptyBed),
        ...PARCEL('parcel-north-field').beds.map((bed) => ({
          id: bed.id as never,
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
      ],
    }));
    const removed = updateSite(later(previous), (site) => ({
      ...site,
      ownedParcelIds: ['parcel-homestead'],
    }));
    expect(validateSaveTransition(previous, removed, removed.tick).ok).toBe(false);
  });

  it('accepts exactly the paid $20 Starter Extension and its three beds', () => {
    const base = fresh();
    const extension = PARCEL('parcel-starter-extension');
    const purchased = updateSite(
      later(base, { balance: cents(base.balance - extension.purchaseCost) }),
      (site) => ({
        ...site,
        ownedParcelIds: [...site.ownedParcelIds, extension.id],
        plots: [...site.plots, ...extension.beds.map(emptyBed)],
      }),
    );

    expect(validateSaveTransition(base, purchased, purchased.tick)).toEqual({ ok: true });

    const missingBed = updateSite(purchased, (site) => ({
      ...site,
      plots: site.plots.filter((plot) => String(plot.id) !== extension.beds[0]?.id),
    }));
    expect(validateSaveTransition(base, missingBed, missingBed.tick).reason).toMatch(
      /crop bed.*missing/i,
    );

    const northFirst = updateSite(later(base), (site) => ({
      ...site,
      ownedParcelIds: [...site.ownedParcelIds, 'parcel-north-field'],
      plots: [...site.plots, ...PARCEL('parcel-north-field').beds.map(emptyBed)],
    }));
    expect(validateSaveTransition(base, northFirst, northFirst.tick).reason).toMatch(
      /More than one parcel|Starter Extension first/i,
    );
  });

  it('normalizes an old North Field save without charging for its connecting strip', () => {
    const base = fresh();
    const oldNorth = updateSite(base, (site) => ({
      ...site,
      ownedParcelIds: [...site.ownedParcelIds, 'parcel-north-field'],
      plots: [...site.plots, ...PARCEL('parcel-north-field').beds.map(emptyBed)],
    }));
    const continued = later(oldNorth);

    expect(validateSaveTransition(oldNorth, continued, continued.tick)).toEqual({ ok: true });
  });

  it('still rejects unknown parcel ids after layout normalization', () => {
    const base = fresh();
    const forged = updateSite(later(base), (site) => ({
      ...site,
      ownedParcelIds: [...site.ownedParcelIds, 'parcel-forged'],
    }));
    expect(validateSaveTransition(base, forged, forged.tick).reason).toMatch(/no parcel|unknown/i);
  });

  it('rejects impossible crop growth but permits replanting', () => {
    const base = fresh();
    const planted = updateSite(base, (site) => ({
      ...site,
      plots: site.plots.map((plot, index) =>
        index === 0 ? { ...plot, cropId: 'pumpkin', grownTicks: 0 } : plot,
      ),
    }));
    const tooFast = updateSite(later(planted, {}, 10), (site) => ({
      ...site,
      plots: site.plots.map((plot, index) =>
        index === 0 ? { ...plot, grownTicks: requireCrop('pumpkin').growthTicks } : plot,
      ),
    }));
    expect(validateSaveTransition(planted, tooFast, tooFast.tick).ok).toBe(false);

    const overgrown = updateSite(later(planted), (site) => ({
      ...site,
      plots: site.plots.map((plot, index) =>
        index === 0 ? { ...plot, grownTicks: requireCrop('pumpkin').growthTicks * 2 } : plot,
      ),
    }));
    expect(validateSaveTransition(planted, overgrown, overgrown.tick).ok).toBe(false);

    const replanted = updateSite(later(planted), (site) => ({
      ...site,
      plots: site.plots.map((plot, index) =>
        index === 0 ? { ...plot, cropId: 'corn', grownTicks: 0 } : plot,
      ),
    }));
    expect(validateSaveTransition(planted, replanted, replanted.tick).ok).toBe(true);
  });

  it('rejects inserted unlocks and accepts a milestone earned from farm state', () => {
    const base = fresh();
    const forged = later(base, { unlocks: ['processing'] });
    expect(validateSaveTransition(base, forged, forged.tick).ok).toBe(false);

    const qualified = updateSite(base, (site) => ({
      ...site,
      ownedParcelIds: [...site.ownedParcelIds, 'parcel-starter-extension', 'parcel-north-field'],
      plots: [
        ...site.plots,
        ...PARCEL('parcel-starter-extension').beds.map(emptyBed),
        ...PARCEL('parcel-north-field').beds.map((bed) => ({
          id: bed.id as never,
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
      ],
    }));
    qualified.statistics = { ...qualified.statistics, lifetimeEarned: 15_000 };
    const milestone = MILESTONES[0]!;
    const claimed = later(qualified, {
      stage: 1,
      completedMilestoneIds: [milestone.id],
      unlocks: [...milestone.unlocks],
      balance: cents(qualified.balance + milestone.reward),
      statistics: {
        ...qualified.statistics,
        peakBalance: qualified.balance + milestone.reward,
      },
    });
    expect(validateSaveTransition(qualified, claimed, claimed.tick).ok).toBe(true);
  });

  it('accepts a paid specialization change and rejects an unpaid one', () => {
    const base = fresh();
    base.stage = 2;
    base.unlocks = ['specialization'];
    base.specialization = 'arable';
    const cost = SPECIALIZATIONS.arable.switchCost;
    const paid = later(
      base,
      {
        specialization: 'livestock',
        balance: cents(base.balance - cost),
        statistics: {
          ...base.statistics,
          lifetimeSpent: base.statistics.lifetimeSpent + cost,
        },
      },
      0,
    );
    expect(validateSaveTransition(base, paid, paid.tick).ok).toBe(true);

    const unpaid = { ...paid, balance: base.balance };
    expect(validateSaveTransition(base, unpaid, unpaid.tick).reason).toMatch(/not paid/i);
  });

  it('accepts a real loan and rejects invented lending or insurance terms', () => {
    const base = fresh();
    base.unlocks = ['loans', 'insurance'];
    const offer = LOAN_OFFERS[0]!;
    const borrowed = later(
      base,
      {
        balance: cents(base.balance + offer.principal),
        statistics: {
          ...base.statistics,
          peakBalance: base.balance + offer.principal,
        },
        loans: [
          {
            id: `${offer.id}-${base.tick}`,
            principal: offer.principal,
            outstanding: offer.principal,
            dailyRate: offer.dailyRate,
            takenTick: base.tick,
            origin: 'chosen',
          },
        ],
      },
      0,
    );
    expect(validateSaveTransition(base, borrowed, borrowed.tick)).toEqual({ ok: true });

    const borrowedAsIncome = {
      ...borrowed,
      statistics: {
        ...borrowed.statistics,
        lifetimeEarned: borrowed.statistics.lifetimeEarned + offer.principal,
      },
    };
    expect(validateSaveTransition(base, borrowedAsIncome, borrowedAsIncome.tick).reason).toMatch(
      /without a sale/i,
    );

    const forgedLoan = {
      ...borrowed,
      loans: borrowed.loans.map((loan) => ({ ...loan, dailyRate: 0 })),
    };
    expect(validateSaveTransition(base, forgedLoan, forgedLoan.tick).reason).toMatch(/bank offer/i);

    const policy = INSURANCE_POLICIES[0]!;
    const forgedPolicy = later(
      base,
      {
        insurance: {
          policyId: policy.policyId,
          premiumPerDay: cents(1),
          coverage: 1,
          startedTick: base.tick,
          claimsMade: 0,
        },
      },
      0,
    );
    expect(validateSaveTransition(base, forgedPolicy, forgedPolicy.tick).reason).toMatch(/policy/i);
  });

  it('validates the cost, materials and unlock for a town project', () => {
    const project = COMMUNITY_PROJECTS_BY_ID['project-market-road']!;
    const base = withYardItems(fresh(), { wheat: 20 });
    base.unlocks = ['town_projects'];
    const started = withYardItems(
      later(
        base,
        {
          balance: cents(base.balance - project.cost),
          town: {
            ...base.town,
            activeProject: {
              id: project.id,
              remainingTicks: project.buildTicks,
              contributedItems: { ...project.materials },
            },
          },
        },
        0,
      ),
      {},
    );
    expect(validateSaveTransition(base, started, started.tick).ok).toBe(true);

    const lockedBase = withYardItems(fresh(), { wheat: 20 });
    const locked = { ...started, unlocks: [] };
    expect(validateSaveTransition(lockedBase, locked, locked.tick).reason).toMatch(
      /before projects/i,
    );
  });

  it('rejects an overloaded carrier', () => {
    const base = fresh();
    const overloaded = updateSite(later(base), (site) => ({
      ...site,
      carried: { ...site.carried, items: { wheat: 9 } },
    }));
    expect(validateSaveTransition(base, overloaded, overloaded.tick).reason).toMatch(/overloaded/i);
  });

  it('validates the rotated footprint of a new non-square building', () => {
    const base = fresh();
    base.unlocks = ['hauling'];
    const cost = BUILDINGS.loading_pad.buildCost;
    const rotated = updateSite(
      later(base, {
        balance: cents(base.balance - cost),
        statistics: {
          ...base.statistics,
          lifetimeSpent: base.statistics.lifetimeSpent + cost,
        },
      }),
      (site) => ({
        ...site,
        buildings: [
          ...site.buildings,
          {
            id: 'building-rotated-pad',
            kind: 'loading_pad',
            tileX: 22,
            tileZ: 22,
            rotation: 1,
            remainingBuildTicks: BUILDINGS.loading_pad.buildTicks,
            broken: false,
          },
        ],
      }),
    );

    expect(validateSaveTransition(base, rotated, rotated.tick)).toEqual({ ok: true });
  });

  it('rejects overlap on the second tile of a rotated footprint', () => {
    const base = fresh();
    base.unlocks = ['hauling'];
    const cost = BUILDINGS.loading_pad.buildCost + BUILDINGS.road.buildCost;
    const overlapped = updateSite(
      later(base, {
        balance: cents(base.balance - cost),
        statistics: {
          ...base.statistics,
          lifetimeSpent: base.statistics.lifetimeSpent + cost,
        },
      }),
      (site) => ({
        ...site,
        buildings: [
          ...site.buildings,
          {
            id: 'building-rotated-pad',
            kind: 'loading_pad',
            tileX: 22,
            tileZ: 22,
            rotation: 1,
            remainingBuildTicks: BUILDINGS.loading_pad.buildTicks,
            broken: false,
          },
          {
            id: 'building-overlap',
            kind: 'road',
            tileX: 22,
            tileZ: 23,
            rotation: 0,
            remainingBuildTicks: BUILDINGS.road.buildTicks,
            broken: false,
          },
        ],
      }),
    );

    expect(validateSaveTransition(base, overlapped, overlapped.tick).reason).toMatch(/overlap/i);
  });

  it('rejects rotating an existing building through a save transition', () => {
    const base = fresh();
    base.unlocks = ['hauling'];
    const previous = updateSite(base, (site) => ({
      ...site,
      buildings: [
        ...site.buildings,
        {
          id: 'building-fixed-rotation',
          kind: 'loading_pad',
          tileX: 22,
          tileZ: 22,
          rotation: 0,
          remainingBuildTicks: 0,
          broken: false,
        },
      ],
    }));
    const rotated = updateSite(later(previous), (site) => ({
      ...site,
      buildings: site.buildings.map((building) =>
        building.id === 'building-fixed-rotation' ? { ...building, rotation: 1 } : building,
      ),
    }));

    expect(validateSaveTransition(previous, rotated, rotated.tick).reason).toMatch(/rotation/i);
  });

  it('keeps the animal-product collection tile clear on saved farms', () => {
    const base = fresh();
    const covered = updateSite(later(base), (site) => ({
      ...site,
      buildings: [
        ...site.buildings,
        {
          id: 'building-over-products',
          kind: 'road',
          tileX: STARTER_ANIMAL_PRODUCT_DROP.tileX,
          tileZ: STARTER_ANIMAL_PRODUCT_DROP.tileZ,
          rotation: 0,
          remainingBuildTicks: 1,
          broken: false,
        },
      ],
    }));

    expect(validateSaveTransition(base, covered, covered.tick).reason).toMatch(/protected tile/i);
  });

  it('keeps a purchased shelter product area clear in every save', () => {
    const base = fresh();
    base.stage = 1;
    base.unlocks = ['animal_shelters'];
    const drop = animalShelterProductDropTile(20, 18, 0);
    const cost = BUILDINGS.animal_shelter.buildCost + BUILDINGS.road.buildCost;
    const covered = updateSite(
      later(base, {
        balance: cents(base.balance - cost),
        statistics: {
          ...base.statistics,
          lifetimeSpent: base.statistics.lifetimeSpent + cost,
        },
      }),
      (site) => ({
        ...site,
        buildings: [
          ...site.buildings,
          {
            id: 'building-shelter',
            kind: 'animal_shelter',
            tileX: 20,
            tileZ: 18,
            rotation: 0,
            remainingBuildTicks: BUILDINGS.animal_shelter.buildTicks,
            broken: false,
          },
          {
            id: 'building-over-shelter-products',
            kind: 'road',
            tileX: drop.tileX,
            tileZ: drop.tileZ,
            rotation: 0,
            remainingBuildTicks: BUILDINGS.road.buildTicks,
            broken: false,
          },
        ],
      }),
    );

    expect(validateSaveTransition(base, covered, covered.tick).reason).toMatch(
      /overlap|product area/i,
    );
  });

  it('rejects invented shelter assignments and livestock beyond completed capacity', () => {
    const base = fresh();
    const unknownShelter = updateSite(later(base), (site) => ({
      ...site,
      animals: [
        ...site.animals,
        {
          id: 'animals-forged',
          species: 'chicken',
          count: 0,
          cycleTicks: 0,
          shelterId: 'building-forged-shelter',
          tileX: 20,
          tileZ: 18,
          sheltered: false,
        },
      ],
    }));
    expect(validateSaveTransition(base, unknownShelter, unknownShelter.tick).reason).toMatch(
      /completed shelter/i,
    );

    const overCapacity = updateSite(
      later(base, { balance: cents(base.balance - BUILDINGS.water_trough.buildCost) }),
      (site) => ({
        ...site,
        animals: site.animals.map((group) => ({ ...group, count: 5 })),
      }),
    );
    expect(validateSaveTransition(base, overCapacity, overCapacity.tick).reason).toMatch(
      /shelter capacity/i,
    );
  });

  it('reserves the inherited shelter id from placed buildings', () => {
    const base = fresh();
    const forged = updateSite(later(base), (site) => ({
      ...site,
      buildings: [
        ...site.buildings,
        {
          id: STARTER_SHELTER_ID,
          kind: 'road',
          tileX: 20,
          tileZ: 18,
          rotation: 0,
          remainingBuildTicks: BUILDINGS.road.buildTicks,
          broken: false,
        },
      ],
    }));

    expect(validateSaveTransition(base, forged, forged.tick).reason).toMatch(/reserved/i);
  });

  it('rejects new local shelter overfill even when another shelter leaves site-wide room', () => {
    const base = fresh();
    base.stage = 1;
    base.unlocks = ['animal_shelters'];
    const starterCount = base.sites[0]?.animals[0]?.count ?? 0;
    const addedChickens = 5 - starterCount;
    const cost = BUILDINGS.animal_shelter.buildCost + addedChickens * ANIMALS.chicken.purchaseCost;
    const elapsed = BUILDINGS.animal_shelter.buildTicks + 1;
    const overfilled = updateSite(
      later(
        base,
        {
          balance: cents(base.balance - cost),
          statistics: {
            ...base.statistics,
            lifetimeSpent: base.statistics.lifetimeSpent + cost,
          },
        },
        elapsed,
      ),
      (site) => ({
        ...site,
        buildings: [
          ...site.buildings,
          {
            id: 'building-unused-shelter',
            kind: 'animal_shelter',
            tileX: 20,
            tileZ: 18,
            rotation: 0,
            remainingBuildTicks: 0,
            broken: false,
          },
        ],
        animals: site.animals.map((group, index) => (index === 0 ? { ...group, count: 5 } : group)),
      }),
    );

    expect(validateSaveTransition(base, overfilled, overfilled.tick).reason).toMatch(
      /capacity at shelter/i,
    );
  });

  it('grandfathers an unchanged locally overfilled v3 shelter', () => {
    const base = fresh();
    base.stage = 1;
    base.unlocks = ['animal_shelters'];
    const previous = updateSite(base, (site) => ({
      ...site,
      buildings: [
        ...site.buildings,
        {
          id: 'building-empty-shelter',
          kind: 'animal_shelter',
          tileX: 20,
          tileZ: 18,
          rotation: 0,
          remainingBuildTicks: 0,
          broken: false,
        },
      ],
      animals: site.animals.map((group, index) => (index === 0 ? { ...group, count: 5 } : group)),
    }));

    expect(validateSaveTransition(previous, later(previous), previous.tick + 600)).toEqual({
      ok: true,
    });
  });

  it('accepts paid livestock assigned to a newly completed purchased shelter', () => {
    const base = fresh();
    base.stage = 1;
    base.unlocks = ['animal_shelters'];
    const shelterCost = BUILDINGS.animal_shelter.buildCost;
    const animalCost = 900;
    const cost = shelterCost + animalCost;
    const elapsed = BUILDINGS.animal_shelter.buildTicks + 1;
    const next = updateSite(
      later(
        base,
        {
          balance: cents(base.balance - cost),
          statistics: {
            ...base.statistics,
            lifetimeSpent: base.statistics.lifetimeSpent + cost,
          },
        },
        elapsed,
      ),
      (site) => ({
        ...site,
        buildings: [
          ...site.buildings,
          {
            id: 'building-shelter',
            kind: 'animal_shelter',
            tileX: 20,
            tileZ: 18,
            rotation: 0,
            remainingBuildTicks: 0,
            broken: false,
          },
        ],
        animals: [
          ...site.animals,
          {
            id: 'animals-remote-hen',
            species: 'chicken',
            count: 1,
            cycleTicks: 0,
            shelterId: 'building-shelter',
            tileX: 20,
            tileZ: 18,
            sheltered: false,
          },
        ],
      }),
    );

    expect(validateSaveTransition(base, next, next.tick)).toEqual({ ok: true });
    expect(next.sites[0]?.animals[0]?.shelterId).toBe(STARTER_SHELTER_ID);
  });

  it('rejects sheep before Stage 1 and accepts a paid sheep after the shelter unlock', () => {
    const lockedBase = fresh();
    const locked = updateSite(later(lockedBase), (site) => ({
      ...site,
      animals: [
        ...site.animals,
        {
          id: 'animals-locked-sheep',
          species: 'sheep',
          count: 0,
          cycleTicks: 0,
          shelterId: STARTER_SHELTER_ID,
          tileX: 19,
          tileZ: 16,
          sheltered: false,
        },
      ],
    }));
    expect(validateSaveTransition(lockedBase, locked, locked.tick).reason).toMatch(
      /before.*unlocked/i,
    );

    const base = fresh();
    base.stage = 1;
    base.unlocks = ['animal_shelters'];
    const cost = ANIMALS.sheep.purchaseCost;
    const purchased = updateSite(
      later(base, {
        balance: cents(base.balance - cost),
        statistics: {
          ...base.statistics,
          lifetimeSpent: base.statistics.lifetimeSpent + cost,
        },
      }),
      (site) => ({
        ...site,
        animals: [
          ...site.animals,
          {
            id: 'animals-sheep',
            species: 'sheep',
            count: 1,
            cycleTicks: 0,
            shelterId: STARTER_SHELTER_ID,
            tileX: 19,
            tileZ: 16,
            sheltered: false,
          },
        ],
      }),
    );

    expect(validateSaveTransition(base, purchased, purchased.tick)).toEqual({ ok: true });
  });
});

function PARCEL(id: string) {
  const parcel = PARCELS_BY_ID[id];
  if (!parcel) throw new Error(`Missing parcel ${id}`);
  return parcel;
}

function emptyBed(bed: { id: string }) {
  return {
    id: bed.id as never,
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
  };
}
