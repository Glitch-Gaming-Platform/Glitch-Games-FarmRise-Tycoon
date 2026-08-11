/**
 * Named byte layers over a tile grid.
 *
 * The original grid packed everything into one flag byte, which was right when
 * there were five things to say about a tile. A career needs to say a dozen -
 * who owns it, what terrain it is, whether a utility reaches it, whether an
 * incident has made it temporarily dangerous - and most of them are small
 * numbers rather than booleans.
 *
 * Continuing to add bits to one byte would have coupled unrelated systems
 * together and run out of room immediately, so each concern gets its own layer
 * (docs/PROGRESSION_GAMEPLAY_PLAN.md §34.4).
 *
 * Layer names are strings supplied by the caller, because the engine must not
 * know that "ownership" means parcels or that "hazard" means blight. Layers are
 * created on first use, so a game that needs none pays for none.
 */
export class GridLayers {
  readonly #layers = new Map<string, Uint8Array>();

  constructor(
    private readonly width: number,
    private readonly depth: number,
  ) {}

  /** The backing array for a layer, allocated on first request. */
  layer(name: string): Uint8Array {
    const existing = this.#layers.get(name);
    if (existing) return existing;
    const created = new Uint8Array(this.width * this.depth);
    this.#layers.set(name, created);
    return created;
  }

  has(name: string): boolean {
    return this.#layers.has(name);
  }

  get(name: string, x: number, z: number): number {
    if (x < 0 || z < 0 || x >= this.width || z >= this.depth) return 0;
    return this.layer(name)[z * this.width + x] ?? 0;
  }

  set(name: string, x: number, z: number, value: number): void {
    if (x < 0 || z < 0 || x >= this.width || z >= this.depth) return;
    this.layer(name)[z * this.width + x] = value & 0xff;
  }

  fillRect(name: string, x: number, z: number, width: number, depth: number, value: number): void {
    for (let dz = 0; dz < depth; dz += 1) {
      for (let dx = 0; dx < width; dx += 1) {
        this.set(name, x + dx, z + dz, value);
      }
    }
  }

  clear(name: string): void {
    this.#layers.get(name)?.fill(0);
  }

  clearAll(): void {
    for (const layer of this.#layers.values()) layer.fill(0);
  }

  /** Layer names currently allocated. Used by the debug overlay and tests. */
  names(): readonly string[] {
    return [...this.#layers.keys()];
  }

  /** Snapshot of one layer, for tests. */
  toBytes(name: string): Uint8Array {
    return this.layer(name).slice();
  }
}
