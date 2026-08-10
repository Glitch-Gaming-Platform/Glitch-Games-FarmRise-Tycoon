/**
 * A level is pure data: the shape of the land and where things start.
 *
 * Keeping levels declarative means a new farm layout is a data file, not code,
 * and the same definition can be loaded by the server when it re-simulates a
 * save.
 */
import type { BuildingKind } from '@farmrise/shared';

export interface PlotPlacement {
  readonly id: string;
  readonly tileX: number;
  readonly tileZ: number;
}

export interface LevelDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly grid: { readonly width: number; readonly depth: number; readonly tileSize: number };
  /** Where the player spawns, in tile coordinates. */
  readonly spawn: { readonly tileX: number; readonly tileZ: number };
  readonly plots: readonly PlotPlacement[];
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
}
