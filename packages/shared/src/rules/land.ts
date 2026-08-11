/**
 * Buying land.
 *
 * In the first playable this incremented a counter and ended the run. In a
 * career it is a physical transition: a specific, named parcel changes hands,
 * its gate opens, its beds become plantable and its ground becomes buildable
 * (docs/PROGRESSION_GAMEPLAY_PLAN.md §32.4).
 *
 * The server validates the same call, which is why the parcel table lives in
 * the shared package rather than in the client's level data.
 */
import { cents, type Cents } from '../domain/ids.js';
import {
  ESTATE_PARCELS,
  getParcel,
  purchasableParcels,
  type ParcelDefinition,
  type ParcelId,
} from '../domain/parcels.js';
import { ok, ruleViolation, type Result } from './result.js';

export interface LandPurchase {
  readonly parcel: ParcelDefinition;
  readonly balance: Cents;
  readonly ownedParcelIds: readonly ParcelId[];
  /** Beds the purchase makes plantable. */
  readonly newBedIds: readonly string[];
}

export function validateLandPurchase(
  parcelId: string,
  ownedParcelIds: readonly ParcelId[],
  balance: Cents,
  stage: number,
): Result<LandPurchase> {
  const parcel = getParcel(parcelId);
  if (!parcel) return ruleViolation(`There is no parcel called ${parcelId}.`);
  if (ownedParcelIds.includes(parcel.id)) return ruleViolation('You already own that land.');

  const missing = parcel.requiresOwned.filter((required) => !ownedParcelIds.includes(required));
  if (missing.length > 0) {
    const names = missing.map((id) => getParcel(id)?.displayName ?? id).join(', ');
    return ruleViolation(`That parcel does not adjoin your land yet. Buy ${names} first.`);
  }
  if (parcel.requiresStage > stage) {
    return ruleViolation('The owner will not sell to a farm this size yet.');
  }
  if (balance < parcel.purchaseCost) {
    return ruleViolation(`${parcel.displayName} costs more than you have.`);
  }

  return ok({
    parcel,
    balance: cents(balance - parcel.purchaseCost),
    ownedParcelIds: [...ownedParcelIds, parcel.id],
    newBedIds: parcel.beds.map((bed) => bed.id),
  });
}

/** Cheapest parcel the player could buy next, for the objective meter. */
export function nextParcelFor(
  ownedParcelIds: readonly ParcelId[],
  stage: number,
): ParcelDefinition | undefined {
  const options = purchasableParcels(ownedParcelIds, stage);
  return [...options].sort((a, b) => a.purchaseCost - b.purchaseCost)[0];
}

/** Progress toward affording the next parcel, 0..1. */
export function landProgress(
  balance: Cents,
  ownedParcelIds: readonly ParcelId[],
  stage: number,
): number {
  const next = nextParcelFor(ownedParcelIds, stage);
  if (!next || next.purchaseCost <= 0) return 1;
  return Math.max(0, Math.min(1, balance / next.purchaseCost));
}

/** True once every parcel on the estate has been bought. */
export function ownsWholeEstate(ownedParcelIds: readonly ParcelId[]): boolean {
  return ESTATE_PARCELS.every((parcel) => ownedParcelIds.includes(parcel.id));
}
