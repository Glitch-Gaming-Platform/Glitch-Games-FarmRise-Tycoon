/**
 * What the player is holding, and in what.
 *
 * This is the model that makes distance cost something. Before it existed a
 * harvest teleported into a global inventory; now it goes into the player's
 * arms, and the walk back to the barn is the price of farming a bed that is
 * far away (docs/PROGRESSION_GAMEPLAY_PLAN.md §38.4).
 */
import {
  CARRIERS,
  blendQuality,
  carryCapacity,
  getItem,
  loadWeight,
  loadedSpeedMultiplier,
  ok,
  ruleViolation,
  type CarrierKind,
  type Inventory,
  type Result,
} from '@farmrise/shared';
import { EventBus } from '@engine/core/EventBus.js';

export interface CarryModelEvents extends Record<string, unknown> {
  'carry:changed': { units: number; capacity: number };
  'carry:full': { itemId: string; refused: number };
  'carry:carrier-changed': { carrier: CarrierKind };
}

export class CarryModel {
  readonly events = new EventBus<CarryModelEvents>();
  #carrier: CarrierKind = 'arms';
  #owned = new Set<CarrierKind>(['arms']);
  #items: Inventory = {};
  #quality: Record<string, number> = {};
  #cartTile: { tileX: number; tileZ: number } | null = null;

  get carrier(): CarrierKind {
    return this.#carrier;
  }

  get ownedCarriers(): readonly CarrierKind[] {
    return [...this.#owned];
  }

  get items(): Inventory {
    return this.#items;
  }

  get quality(): Readonly<Record<string, number>> {
    return this.#quality;
  }

  get cartTile(): { tileX: number; tileZ: number } | null {
    return this.#cartTile;
  }

  get capacity(): number {
    return carryCapacity(this.#carrier);
  }

  get used(): number {
    return loadWeight(this.#items);
  }

  get free(): number {
    return Math.max(0, this.capacity - this.used);
  }

  get isEmpty(): boolean {
    return this.used <= 0;
  }

  /** Movement multiplier the current load imposes. */
  speedMultiplier(): number {
    return loadedSpeedMultiplier({ items: this.#items, carrier: this.#carrier });
  }

  own(carrier: CarrierKind): void {
    this.#owned.add(carrier);
  }

  owns(carrier: CarrierKind): boolean {
    return this.#owned.has(carrier);
  }

  use(carrier: CarrierKind): Result<void> {
    if (!this.#owned.has(carrier)) return ruleViolation('You do not have one of those.');
    if (!this.isEmpty && carrier !== this.#carrier) {
      return ruleViolation('Put down what you are carrying first.');
    }
    this.#carrier = carrier;
    this.events.emit('carry:carrier-changed', { carrier });
    return ok(undefined);
  }

  parkCart(tileX: number, tileZ: number): void {
    this.#cartTile = { tileX, tileZ };
  }

  /**
   * Picks goods up, taking as much as will fit.
   *
   * Returns what was refused so the caller can leave the rest where it was -
   * which is what creates the "one more trip" decision that hauling exists for.
   */
  pickUp(itemId: string, quantity: number, quality = 1): { taken: number; refused: number } {
    const weight = getItem(itemId)?.storageWeight ?? 1;
    const taken = Math.max(0, Math.min(quantity, Math.floor(this.free / weight)));
    const refused = Math.max(0, quantity - taken);

    if (taken > 0) {
      const existing = this.#items[itemId] ?? 0;
      this.#quality = {
        ...this.#quality,
        [itemId]: blendQuality(existing, this.#quality[itemId] ?? 1, taken, quality),
      };
      this.#items = { ...this.#items, [itemId]: existing + taken };
      this.events.emit('carry:changed', { units: this.used, capacity: this.capacity });
    }
    if (refused > 0) this.events.emit('carry:full', { itemId, refused });
    return { taken, refused };
  }

  put(itemId: string, quantity: number): Result<{ quality: number }> {
    const held = this.#items[itemId] ?? 0;
    if (held < quantity) return ruleViolation('You are not carrying that much.');
    const quality = this.#quality[itemId] ?? 1;
    this.#items = { ...this.#items, [itemId]: held - quantity };
    this.events.emit('carry:changed', { units: this.used, capacity: this.capacity });
    return ok({ quality });
  }

  /** Everything, in one go. Used when depositing at a store. */
  drain(): { items: Inventory; quality: Record<string, number> } {
    const items = { ...this.#items };
    const quality = { ...this.#quality };
    this.#items = {};
    this.#quality = {};
    this.events.emit('carry:changed', { units: 0, capacity: this.capacity });
    return { items, quality };
  }

  /** Damages the load, for the broken-axle incident. */
  spill(multiplier: number): number {
    let lost = 0;
    const next: Record<string, number> = {};
    for (const [itemId, quantity] of Object.entries(this.#items)) {
      const kept = Math.floor(quantity * Math.max(0, multiplier));
      lost += quantity - kept;
      next[itemId] = kept;
    }
    this.#items = next;
    this.events.emit('carry:changed', { units: this.used, capacity: this.capacity });
    return lost;
  }

  hydrate(state: {
    carrier: CarrierKind;
    ownedCarriers: readonly CarrierKind[];
    items: Inventory;
    quality: Record<string, number>;
    cartTileX: number | null;
    cartTileZ: number | null;
  }): void {
    this.#carrier = CARRIERS[state.carrier] ? state.carrier : 'arms';
    this.#owned = new Set(state.ownedCarriers.length > 0 ? state.ownedCarriers : ['arms']);
    this.#items = { ...state.items };
    this.#quality = { ...state.quality };
    this.#cartTile =
      state.cartTileX !== null && state.cartTileZ !== null
        ? { tileX: state.cartTileX, tileZ: state.cartTileZ }
        : null;
  }

  toSaveState() {
    return {
      carrier: this.#carrier,
      ownedCarriers: [...this.#owned],
      items: { ...this.#items },
      quality: { ...this.#quality },
      cartTileX: this.#cartTile?.tileX ?? null,
      cartTileZ: this.#cartTile?.tileZ ?? null,
    };
  }
}
