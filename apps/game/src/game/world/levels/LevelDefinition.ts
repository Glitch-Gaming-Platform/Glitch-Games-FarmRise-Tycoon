/**
 * A level is pure data: the shape of the land and where things start.
 *
 * Keeping levels declarative means a new farm layout is a data file, not code.
 * What changed for the career is that the *parcels* moved into the shared
 * package: the server validates a land purchase, so it needs the same estate
 * table the client renders. A level now describes the site's scenery, entry
 * points and which region it belongs to, and defers ownership to
 * `@farmrise/shared`'s parcel definitions.
 */
import type { BuildingKind } from '@farmrise/shared';

export interface LevelDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly regionId: string;
  /** The whole estate, including land the player does not own yet. */
  readonly grid: { readonly width: number; readonly depth: number; readonly tileSize: number };
  /** Where the player spawns, in tile coordinates. */
  readonly spawn: { readonly tileX: number; readonly tileZ: number };
  /** Tiles that are impassable scenery (rocks, water edge). */
  readonly blockedTiles: readonly { readonly tileX: number; readonly tileZ: number }[];
  /** Structures the player already owns at the start. */
  readonly startingBuildings: readonly {
    readonly kind: BuildingKind;
    readonly tileX: number;
    readonly tileZ: number;
  }[];
  /** Tile the animal shelter occupies. Animals are penned here. */
  readonly shelter: { readonly tileX: number; readonly tileZ: number };
  /** Reserved walkable tile where animal products wait for collection. */
  readonly animalProductDrop: { readonly tileX: number; readonly tileZ: number };
  /** Where deliveries leave the farm for town. The wagon and buyers meet here. */
  readonly townGate: { readonly tileX: number; readonly tileZ: number };
}
