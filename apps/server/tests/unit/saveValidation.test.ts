import { describe, expect, it } from 'vitest';
import {
  COMMUNITY_PROJECTS_BY_ID,
  INSURANCE_POLICIES,
  LOAN_OFFERS,
  MILESTONES,
  PARCELS_BY_ID,
  SPECIALIZATIONS,
  STARTER_ANIMAL_PRODUCT_DROP,
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
      ownedParcelIds: [site.ownedParcelIds[0]!, 'parcel-north-field', 'parcel-east-pasture'],
    }));
    expect(validateSaveTransition(base, several, several.tick).ok).toBe(false);

    const previous = updateSite(base, (site) => ({
      ...site,
      ownedParcelIds: [...site.ownedParcelIds, 'parcel-north-field'],
      plots: [
        ...site.plots,
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
      ownedParcelIds: [...site.ownedParcelIds, 'parcel-north-field'],
      plots: [
        ...site.plots,
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
});

function PARCEL(id: string) {
  const parcel = PARCELS_BY_ID[id];
  if (!parcel) throw new Error(`Missing parcel ${id}`);
  return parcel;
}
