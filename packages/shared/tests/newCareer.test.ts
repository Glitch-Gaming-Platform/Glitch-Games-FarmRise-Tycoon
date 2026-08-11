/**
 * The new-career factory is the single source of truth the client, the server
 * and every test agree on. If it drifts from the parcel table or the schema,
 * save validation starts rejecting farms that were built legitimately.
 */
import { describe, expect, it } from 'vitest';
import {
  ESTATE_PARCELS,
  HOMESTEAD_PARCEL_ID,
  NORTH_FIELD_PARCEL_ID,
  PARCELS_BY_ID,
  STARTER_EXTENSION_PARCEL_ID,
  STARTER_CHICKENS,
  STARTER_SITE_ID,
  STARTING_BALANCE,
  ANIMALS,
  bedsForParcels,
  careerSaveStateSchema,
  isUntouchedCareer,
  newCareer,
  newCareerSite,
  nextParcelFor,
  normalizeOwnedParcelIds,
  parcelAt,
  purchasableParcels,
  validateLandPurchase,
} from '../src/index.js';

describe('newCareer', () => {
  it('produces a document the current schema accepts', () => {
    expect(careerSaveStateSchema.safeParse(newCareer({ careerId: 'career-1' })).success).toBe(true);
  });

  it('is deterministic for a given seed', () => {
    expect(newCareer({ careerId: 'c', seed: 5 })).toEqual(newCareer({ careerId: 'c', seed: 5 }));
  });

  it('starts at stage zero with nothing unlocked, so the opening is the bare loop', () => {
    const career = newCareer({ careerId: 'career-1' });
    expect(career.stage).toBe(0);
    expect(career.unlocks).toHaveLength(0);
    expect(career.specialization).toBeNull();
    expect(isUntouchedCareer(career)).toBe(true);
  });

  it('starts with the documented balance and no debt', () => {
    const career = newCareer({ careerId: 'career-1' });
    expect(career.balance).toBe(STARTING_BALANCE);
    expect(career.loans).toHaveLength(0);
    expect(career.insurance).toBeNull();
    expect(career.financeRemainder).toBe(0);
  });

  it('owns exactly the homestead', () => {
    const site = newCareerSite(1);
    expect(site.ownedParcelIds).toEqual([HOMESTEAD_PARCEL_ID]);
    expect(site.id).toBe(STARTER_SITE_ID);
  });

  it('creates one plot for every bed on the owned parcel, and no others', () => {
    const site = newCareerSite(1);
    const beds = bedsForParcels([HOMESTEAD_PARCEL_ID]).map((bed) => bed.id);
    expect(site.plots.map((plot) => String(plot.id)).sort()).toEqual([...beds].sort());
    expect(site.plots.every((plot) => plot.cropId === null && plot.soil === 1)).toBe(true);
  });

  it('gives the player something to look after from the first second', () => {
    const site = newCareerSite(1);
    const hens = site.animals[0];
    expect(hens?.species).toBe('chicken');
    expect(hens?.count).toBe(STARTER_CHICKENS);
    expect(hens?.cycleTicks).toBeGreaterThan(ANIMALS.chicken.cycleTicks / 2);
    expect(hens?.cycleTicks).toBeLessThan(ANIMALS.chicken.cycleTicks);
    expect(site.stores[0]?.items.corn).toBe(STARTER_CHICKENS + 1);
  });

  it('starts with empty hands and no cart', () => {
    const site = newCareerSite(1);
    expect(site.carried.carrier).toBe('arms');
    expect(site.carried.ownedCarriers).toEqual(['arms']);
    expect(Object.keys(site.carried.items)).toHaveLength(0);
  });

  it('gives every buyer a relationship, all of them cold', () => {
    const career = newCareer({ careerId: 'career-1' });
    const relationships = Object.values(career.buyers);
    expect(relationships.length).toBeGreaterThan(1);
    expect(relationships.every((entry) => entry.trust === 0)).toBe(true);
  });

  it('separates the random streams so one system cannot nudge another', () => {
    const career = newCareer({ careerId: 'career-1', seed: 42 });
    const streams = Object.values(career.rng);
    expect(new Set(streams).size).toBe(streams.length);
  });
});

describe('the estate', () => {
  it('has exactly one parcel owned at the start', () => {
    expect(ESTATE_PARCELS.filter((parcel) => parcel.ownedAtStart)).toHaveLength(1);
  });

  it('keeps every purchasable parcel adjoining land the player already owns', () => {
    for (const parcel of ESTATE_PARCELS) {
      if (parcel.ownedAtStart) continue;
      expect(parcel.requiresOwned.length).toBeGreaterThan(0);
      for (const required of parcel.requiresOwned) {
        expect(PARCELS_BY_ID[required]).toBeDefined();
      }
    }
  });

  it('never overlaps two parcels on the same tile', () => {
    const claimed = new Map<string, string>();
    for (const parcel of ESTATE_PARCELS) {
      const { tileX, tileZ, width, depth } = parcel.bounds;
      expect(parcelAt(tileX, tileZ)?.id).toBe(parcel.id);
      expect(parcelAt(tileX + width - 1, tileZ + depth - 1)?.id).toBe(parcel.id);
      for (let z = tileZ; z < tileZ + depth; z += 1) {
        for (let x = tileX; x < tileX + width; x += 1) {
          const key = `${x}:${z}`;
          expect(claimed.get(key), `${key} overlaps ${parcel.id}`).toBeUndefined();
          claimed.set(key, parcel.id);
        }
      }
    }
  });

  it('keeps every crop bed inside its parcel and every bed tile unique', () => {
    const bedTiles = new Set<string>();
    for (const parcel of ESTATE_PARCELS) {
      for (const bed of parcel.beds) {
        expect(parcelAt(bed.tileX, bed.tileZ)?.id).toBe(parcel.id);
        const key = `${bed.tileX}:${bed.tileZ}`;
        expect(bedTiles.has(key), `${key} contains two crop beds`).toBe(false);
        bedTiles.add(key);
      }
    }
  });

  it('offers exactly one parcel to a brand-new farm', () => {
    expect(purchasableParcels([HOMESTEAD_PARCEL_ID], 0)).toHaveLength(1);
    expect(nextParcelFor([HOMESTEAD_PARCEL_ID], 0)?.id).toBe(STARTER_EXTENSION_PARCEL_ID);
    expect(
      purchasableParcels([HOMESTEAD_PARCEL_ID, STARTER_EXTENSION_PARCEL_ID], 0).map(
        (parcel) => parcel.id,
      ),
    ).toEqual([NORTH_FIELD_PARCEL_ID]);
    expect(nextParcelFor([HOMESTEAD_PARCEL_ID, STARTER_EXTENSION_PARCEL_ID], 0)?.id).toBe(
      NORTH_FIELD_PARCEL_ID,
    );
  });

  it('does not hide an unknown parcel id during layout normalization', () => {
    expect(normalizeOwnedParcelIds([HOMESTEAD_PARCEL_ID, 'parcel-forged'])).toContain(
      'parcel-forged',
    );
  });

  it('defines a $20 three-bed extension near the original six and before North Field', () => {
    const extension = PARCELS_BY_ID[STARTER_EXTENSION_PARCEL_ID]!;
    const north = PARCELS_BY_ID[NORTH_FIELD_PARCEL_ID]!;
    const homestead = PARCELS_BY_ID[HOMESTEAD_PARCEL_ID]!;
    expect(extension.purchaseCost).toBe(2_000);
    expect(extension.beds).toHaveLength(3);
    expect(north.purchaseCost).toBe(7_500);
    expect(north.beds).toHaveLength(8);
    expect(north.requiresOwned).toContain(extension.id);
    const closest = Math.min(
      ...extension.beds.flatMap((bed) =>
        homestead.beds.map(
          (starter) => Math.abs(starter.tileX - bed.tileX) + Math.abs(starter.tileZ - bed.tileZ),
        ),
      ),
    );
    expect(closest).toBeLessThanOrEqual(7);
  });
});

describe('validateLandPurchase', () => {
  const owned = [HOMESTEAD_PARCEL_ID];
  const parcel = PARCELS_BY_ID[STARTER_EXTENSION_PARCEL_ID];

  it('sells the adjoining parcel to a farm that can afford it', () => {
    if (!parcel) throw new Error('Missing parcel.');
    const result = validateLandPurchase(parcel.id, owned, parcel.purchaseCost, 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.balance).toBe(0);
    expect(result.value.ownedParcelIds).toContain(parcel.id);
    expect(result.value.newBedIds.length).toBeGreaterThan(0);
  });

  it('refuses when the money is not there', () => {
    if (!parcel) throw new Error('Missing parcel.');
    expect(validateLandPurchase(parcel.id, owned, (parcel.purchaseCost - 1) as never, 0).ok).toBe(
      false,
    );
  });

  it('refuses land already owned', () => {
    const result = validateLandPurchase(HOMESTEAD_PARCEL_ID, owned, 999_999 as never, 5);
    expect(result.ok).toBe(false);
  });

  it('requires the Starter Extension before the North Field', () => {
    const north = PARCELS_BY_ID[NORTH_FIELD_PARCEL_ID]!;
    expect(validateLandPurchase(north.id, owned, north.purchaseCost, 0).ok).toBe(false);
    expect(
      validateLandPurchase(
        north.id,
        [HOMESTEAD_PARCEL_ID, STARTER_EXTENSION_PARCEL_ID],
        north.purchaseCost,
        0,
      ).ok,
    ).toBe(true);
  });

  it('refuses land that does not adjoin the farm', () => {
    const detached = ESTATE_PARCELS.find(
      (entry) => entry.requiresOwned.length > 0 && entry.requiresStage > 0,
    );
    if (!detached) throw new Error('No gated parcel to test.');
    expect(validateLandPurchase(detached.id, [], 999_999 as never, 5).ok).toBe(false);
  });

  it('refuses a parcel the farm is not yet big enough for', () => {
    const gated = ESTATE_PARCELS.find((entry) => entry.requiresStage > 0);
    if (!gated) throw new Error('No stage-gated parcel to test.');
    expect(validateLandPurchase(gated.id, owned, 999_999 as never, 0).ok).toBe(false);
  });

  it('refuses a parcel that does not exist', () => {
    expect(validateLandPurchase('parcel-atlantis', owned, 999_999 as never, 5).ok).toBe(false);
  });
});
