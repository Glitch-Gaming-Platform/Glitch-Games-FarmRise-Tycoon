/**
 * Which land the player owns, and what that means for the grid.
 *
 * Buying land used to increment a number. Here it changes the world: the
 * parcel's tiles stop being blocked, its gate opens, its beds appear and its
 * ground becomes buildable (docs/PROGRESSION_GAMEPLAY_PLAN.md §32.4).
 *
 * The estate grid exists in full from the first tick. Unowned parcels are
 * visible and walked past rather than absent, which is what makes the purchase
 * feel like taking something you had been looking at.
 */
import { ESTATE_PARCELS, getParcel, type ParcelDefinition, type ParcelId } from '@farmrise/shared';
import { GRID_LAYER, TileFlag, type TileGrid } from '@engine/physics/TileGrid.js';

export class ParcelModel {
  #owned: Set<ParcelId>;

  constructor(
    private readonly grid: TileGrid,
    ownedParcelIds: readonly ParcelId[],
  ) {
    this.#owned = new Set(ownedParcelIds);
    this.applyToGrid();
  }

  get ownedIds(): readonly ParcelId[] {
    return [...this.#owned];
  }

  get count(): number {
    return this.#owned.size;
  }

  owns(parcelId: string): boolean {
    return this.#owned.has(parcelId);
  }

  ownedParcels(): readonly ParcelDefinition[] {
    return ESTATE_PARCELS.filter((parcel) => this.#owned.has(parcel.id));
  }

  /** Beds on owned land. The field model creates a plot for each of these. */
  ownedBeds(): readonly { id: string; tileX: number; tileZ: number }[] {
    return this.ownedParcels().flatMap((parcel) => [...parcel.beds]);
  }

  ownsTile(tileX: number, tileZ: number): boolean {
    const index = this.grid.layers.get(GRID_LAYER.Ownership, tileX, tileZ);
    return index > 0 && this.#owned.has(ESTATE_PARCELS[index - 1]?.id ?? '');
  }

  parcelAtTile(tileX: number, tileZ: number): ParcelDefinition | undefined {
    const index = this.grid.layers.get(GRID_LAYER.Ownership, tileX, tileZ);
    return index > 0 ? ESTATE_PARCELS[index - 1] : undefined;
  }

  /** Records a completed purchase. Validation happens in the shared land rules. */
  acquire(parcelId: string): ParcelDefinition | null {
    const parcel = getParcel(parcelId);
    if (!parcel || this.#owned.has(parcel.id)) return null;
    this.#owned.add(parcel.id);
    this.applyToGrid();
    return parcel;
  }

  /**
   * Writes ownership into the grid.
   *
   * The ownership layer records which parcel every tile belongs to whether or
   * not it is owned, so the renderer can draw a boundary and the purchase
   * preview can highlight exactly what is for sale. Blocking is the separate
   * question of whether the player may walk there.
   */
  applyToGrid(): void {
    for (const [index, parcel] of ESTATE_PARCELS.entries()) {
      const { tileX, tileZ, width, depth } = parcel.bounds;
      this.grid.layers.fillRect(GRID_LAYER.Ownership, tileX, tileZ, width, depth, index + 1);

      const owned = this.#owned.has(parcel.id);
      for (let dz = 0; dz < depth; dz += 1) {
        for (let dx = 0; dx < width; dx += 1) {
          const x = tileX + dx;
          const z = tileZ + dz;
          // Only clear the block an unowned parcel put there. A rock, a
          // building or a fence must stay blocked after the land is bought.
          if (owned) {
            if (this.grid.hasFlag(x, z, TileFlag.Gate)) {
              this.grid.setFlag(x, z, TileFlag.Gate, false);
              this.grid.setFlag(x, z, TileFlag.Blocked, false);
            } else if (!this.grid.hasFlag(x, z, TileFlag.Occupied)) {
              this.grid.setFlag(x, z, TileFlag.Blocked, false);
            }
          } else {
            this.grid.setFlag(x, z, TileFlag.Blocked, true);
            this.grid.setFlag(x, z, TileFlag.Gate, true);
          }
        }
      }
    }
  }

  /** True when this tile may be built on: owned, unoccupied and not a bed. */
  isBuildable(tileX: number, tileZ: number): boolean {
    return (
      this.ownsTile(tileX, tileZ) &&
      !this.grid.hasFlag(tileX, tileZ, TileFlag.Occupied) &&
      !this.grid.hasFlag(tileX, tileZ, TileFlag.Soil)
    );
  }
}
