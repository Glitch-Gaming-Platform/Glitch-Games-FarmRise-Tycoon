/**
 * The estate and its parcels.
 *
 * Land purchase has to be a physical world transition, not a counter (see
 * docs/PROGRESSION_GAMEPLAY_PLAN.md §32.4). The whole estate grid therefore
 * exists from the first second of a career: unowned parcels are rendered, are
 * walked past, and are visibly blocked until they are bought.
 *
 * The alternative - growing the TileGrid on purchase - was rejected because the
 * grid is centred on the origin, so resizing it would move the world position
 * of every object already placed (§34.1).
 *
 * This lives in the shared package because the server validates a land purchase
 * against the same parcel table the client draws.
 */
import { cents, type Cents } from './ids.js';

export type ParcelId = string;

export interface ParcelRect {
  readonly tileX: number;
  readonly tileZ: number;
  readonly width: number;
  readonly depth: number;
}

export interface ParcelDefinition {
  readonly id: ParcelId;
  readonly displayName: string;
  /** Tiles this parcel covers. Rectangles keep masks cheap to test and to save. */
  readonly bounds: ParcelRect;
  /** Owned from the first tick of a new career. Exactly one parcel is. */
  readonly ownedAtStart: boolean;
  readonly purchaseCost: Cents;
  /** Parcels that must already be owned. Keeps the estate contiguous. */
  readonly requiresOwned: readonly ParcelId[];
  /** Career stage that must be reached before this parcel can be bought. */
  readonly requiresStage: number;
  /** Where the gate between this parcel and its neighbour opens. */
  readonly gate: { readonly tileX: number; readonly tileZ: number };
  /** Beds that become plantable when the parcel is bought. */
  readonly beds: readonly { readonly id: string; readonly tileX: number; readonly tileZ: number }[];
  readonly description: string;
}

/**
 * The Millbrook estate: a 32x32 grid of five parcels.
 *
 * 32x32 was chosen over one large regional grid because a mature single site
 * should stay walkable; further growth is delivered as additional sites rather
 * than an ever-larger field (§34.2).
 */
export const ESTATE_GRID = Object.freeze({ width: 32, depth: 32, tileSize: 2 });

export const HOMESTEAD_PARCEL_ID = 'parcel-homestead';
export const STARTER_EXTENSION_PARCEL_ID = 'parcel-starter-extension';
export const NORTH_FIELD_PARCEL_ID = 'parcel-north-field';

export const ESTATE_PARCELS: readonly ParcelDefinition[] = Object.freeze([
  {
    id: HOMESTEAD_PARCEL_ID,
    displayName: 'Homestead',
    bounds: { tileX: 8, tileZ: 8, width: 16, depth: 16 },
    ownedAtStart: true,
    purchaseCost: cents(0),
    requiresOwned: [],
    requiresStage: 0,
    gate: { tileX: 8, tileZ: 16 },
    beds: [
      { id: 'plot-1', tileX: 13, tileZ: 13 },
      { id: 'plot-2', tileX: 15, tileZ: 13 },
      { id: 'plot-3', tileX: 17, tileZ: 13 },
      { id: 'plot-4', tileX: 13, tileZ: 15 },
      { id: 'plot-5', tileX: 15, tileZ: 15 },
      { id: 'plot-6', tileX: 17, tileZ: 15 },
    ],
    description: 'The plot you inherited. Six beds, a shelter and not much else.',
  },
  {
    id: STARTER_EXTENSION_PARCEL_ID,
    displayName: 'Starter Extension',
    // A narrow strip between the inherited homestead and the larger North
    // Field. It creates three nearby beds without consuming any tile where a
    // first-session player could already have placed a structure.
    bounds: { tileX: 8, tileZ: 6, width: 16, depth: 2 },
    ownedAtStart: false,
    purchaseCost: cents(2_000),
    requiresOwned: [HOMESTEAD_PARCEL_ID],
    requiresStage: 0,
    gate: { tileX: 15, tileZ: 8 },
    beds: [
      { id: 'plot-n5', tileX: 13, tileZ: 6 },
      { id: 'plot-n6', tileX: 15, tileZ: 6 },
      { id: 'plot-n7', tileX: 17, tileZ: 6 },
    ],
    description: 'Three crop beds just beyond the homestead gate.',
  },
  {
    id: NORTH_FIELD_PARCEL_ID,
    displayName: 'North Field',
    bounds: { tileX: 8, tileZ: 0, width: 16, depth: 6 },
    ownedAtStart: false,
    purchaseCost: cents(7_500),
    requiresOwned: [STARTER_EXTENSION_PARCEL_ID],
    requiresStage: 0,
    gate: { tileX: 15, tileZ: 6 },
    beds: [
      { id: 'plot-n1', tileX: 12, tileZ: 4 },
      { id: 'plot-n2', tileX: 14, tileZ: 4 },
      { id: 'plot-n3', tileX: 16, tileZ: 4 },
      { id: 'plot-n4', tileX: 18, tileZ: 4 },
      { id: 'plot-n8', tileX: 10, tileZ: 4 },
      { id: 'plot-n9', tileX: 12, tileZ: 2 },
      { id: 'plot-n10', tileX: 15, tileZ: 2 },
      { id: 'plot-n11', tileX: 18, tileZ: 2 },
    ],
    description:
      'Eight beds of good ground beyond the north gate. Far enough that carrying every harvest by hand starts to hurt.',
  },
  {
    id: 'parcel-east-pasture',
    displayName: 'East Pasture',
    bounds: { tileX: 24, tileZ: 8, width: 8, depth: 16 },
    ownedAtStart: false,
    purchaseCost: cents(24_000),
    requiresOwned: [HOMESTEAD_PARCEL_ID],
    requiresStage: 1,
    gate: { tileX: 24, tileZ: 15 },
    beds: [
      { id: 'plot-e1', tileX: 27, tileZ: 12 },
      { id: 'plot-e2', tileX: 29, tileZ: 12 },
      { id: 'plot-e3', tileX: 27, tileZ: 14 },
      { id: 'plot-e4', tileX: 29, tileZ: 14 },
    ],
    description:
      'Open grazing with room for a second shelter, a creamery and the animals to fill them.',
  },
  {
    id: 'parcel-south-works',
    displayName: 'South Works',
    bounds: { tileX: 8, tileZ: 24, width: 16, depth: 8 },
    ownedAtStart: false,
    purchaseCost: cents(38_000),
    requiresOwned: [HOMESTEAD_PARCEL_ID],
    requiresStage: 2,
    gate: { tileX: 15, tileZ: 24 },
    beds: [
      { id: 'plot-s1', tileX: 12, tileZ: 28 },
      { id: 'plot-s2', tileX: 14, tileZ: 28 },
      { id: 'plot-s3', tileX: 16, tileZ: 28 },
      { id: 'plot-s4', tileX: 18, tileZ: 28 },
    ],
    description:
      'Flat ground by the road, close to town. Where the processing yard and the worker huts go.',
  },
]);

export const PARCELS_BY_ID: Readonly<Record<ParcelId, ParcelDefinition>> = Object.freeze(
  Object.fromEntries(ESTATE_PARCELS.map((parcel) => [parcel.id, parcel])),
);

export function getParcel(id: string): ParcelDefinition | undefined {
  return PARCELS_BY_ID[id];
}

export function startingParcelIds(): readonly ParcelId[] {
  return ESTATE_PARCELS.filter((parcel) => parcel.ownedAtStart).map((parcel) => parcel.id);
}

/**
 * The Starter Extension split an older North Field parcel in two. Old saves
 * that already owned the North Field keep the connecting strip automatically;
 * this is a layout compatibility grant, not a second purchase.
 */
export function normalizeOwnedParcelIds(ownedParcelIds: readonly ParcelId[]): readonly ParcelId[] {
  const owned = new Set(ownedParcelIds);
  if (owned.has(NORTH_FIELD_PARCEL_ID)) owned.add(STARTER_EXTENSION_PARCEL_ID);
  const known = ESTATE_PARCELS.filter((parcel) => owned.has(parcel.id)).map((parcel) => parcel.id);
  const unknown = ownedParcelIds.filter((id) => !PARCELS_BY_ID[id]);
  return [...known, ...unknown];
}

export function containsTile(bounds: ParcelRect, tileX: number, tileZ: number): boolean {
  return (
    tileX >= bounds.tileX &&
    tileX < bounds.tileX + bounds.width &&
    tileZ >= bounds.tileZ &&
    tileZ < bounds.tileZ + bounds.depth
  );
}

export function parcelAt(tileX: number, tileZ: number): ParcelDefinition | undefined {
  return ESTATE_PARCELS.find((parcel) => containsTile(parcel.bounds, tileX, tileZ));
}

/** Every bed the given owned parcels make plantable. */
export function bedsForParcels(
  ownedParcelIds: readonly ParcelId[],
): readonly { id: string; tileX: number; tileZ: number }[] {
  const owned = new Set(ownedParcelIds);
  return ESTATE_PARCELS.filter((parcel) => owned.has(parcel.id)).flatMap((parcel) => [
    ...parcel.beds,
  ]);
}

/** The parcels a player could buy next, in presentation order. */
export function purchasableParcels(
  ownedParcelIds: readonly ParcelId[],
  stage: number,
): readonly ParcelDefinition[] {
  const owned = new Set(ownedParcelIds);
  return ESTATE_PARCELS.filter(
    (parcel) =>
      !owned.has(parcel.id) &&
      parcel.requiresStage <= stage &&
      parcel.requiresOwned.every((required) => owned.has(required)),
  );
}
