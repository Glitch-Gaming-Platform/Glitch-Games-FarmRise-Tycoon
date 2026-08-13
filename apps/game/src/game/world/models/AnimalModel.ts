/**
 * Livestock.
 *
 * Animals turn a crop the player could have sold into a product worth more,
 * on a clock the player does not control. Feed is drawn from the farm's stores
 * rather than a global pool, so a herd on a distant parcel with no feed nearby
 * is a logistics problem rather than an accounting one.
 */
import { ANIMALS, type AnimalSpecies } from '@farmrise/shared';
import { EventBus } from '@engine/core/EventBus.js';

export interface AnimalGroup {
  readonly id: string;
  readonly species: AnimalSpecies;
  readonly shelterId: string;
  count: number;
  cycleTicks: number;
  tileX: number;
  tileZ: number;
  sheltered: boolean;
}

export interface AnimalProduce {
  readonly itemId: string;
  readonly quantity: number;
  readonly shelterId: string;
}

export interface AnimalModelEvents extends Record<string, unknown> {
  'animal:purchased': { species: AnimalSpecies; count: number; shelterId: string };
  'animal:produced': { itemId: string; quantity: number; shelterId: string };
  'animal:hungry': {
    species: AnimalSpecies;
    feedItemId: string;
    needed: number;
    available: number;
  };
  'animal:lost': { species: AnimalSpecies; count: number };
}

export interface FeedSource {
  /** How much of this feed the farm can reach. */
  available(itemId: string): number;
  consume(itemId: string, quantity: number): void;
}

export class AnimalModel {
  readonly events = new EventBus<AnimalModelEvents>();
  #groups: AnimalGroup[] = [];
  #nextId = 1;

  get groups(): readonly AnimalGroup[] {
    return this.#groups;
  }

  get(id: string): AnimalGroup | undefined {
    return this.#groups.find((group) => group.id === id);
  }

  countOf(species: AnimalSpecies): number {
    return this.#groups
      .filter((group) => group.species === species)
      .reduce((sum, group) => sum + group.count, 0);
  }

  totalCount(): number {
    return this.#groups.reduce((sum, group) => sum + group.count, 0);
  }

  /** Shelter slots in use, for the purchase check. */
  usedSlots(): number {
    return this.#groups.reduce(
      (sum, group) => sum + group.count * (ANIMALS[group.species]?.shelterSlots ?? 1),
      0,
    );
  }

  /** Shelter slots occupied at one stable shelter identity. */
  usedSlotsAt(shelterId: string): number {
    return this.#groups
      .filter((group) => group.shelterId === shelterId)
      .reduce((sum, group) => sum + group.count * (ANIMALS[group.species]?.shelterSlots ?? 1), 0);
  }

  add(
    species: AnimalSpecies,
    count: number,
    shelter: { readonly id: string; readonly tileX: number; readonly tileZ: number },
  ): void {
    const existing = this.#groups.find(
      (group) => group.species === species && group.shelterId === shelter.id,
    );
    if (existing) existing.count += count;
    else {
      this.#groups.push({
        id: `animals-${this.#nextId}`,
        species,
        shelterId: shelter.id,
        count,
        cycleTicks: 0,
        tileX: shelter.tileX,
        tileZ: shelter.tileZ,
        sheltered: false,
      });
      this.#nextId += 1;
    }
    this.events.emit('animal:purchased', { species, count, shelterId: shelter.id });
  }

  /** Removes animals to an incident. Never takes the last of a species. */
  removeTo(groupId: string, losses: number): number {
    const group = this.get(groupId);
    if (!group || losses <= 0) return 0;
    const removed = Math.min(group.count, Math.floor(losses));
    group.count -= removed;
    if (removed > 0) this.events.emit('animal:lost', { species: group.species, count: removed });
    return removed;
  }

  setSheltered(groupId: string, sheltered: boolean): void {
    const group = this.get(groupId);
    if (group) group.sheltered = sheltered;
  }

  /**
   * Advances every group and returns what was produced and where.
   *
   * No feed means no produce this cycle - a visible, recoverable consequence
   * rather than losing the animals, which would make a supply gap
   * unrecoverable and contradict the disruption pillar.
   */
  advance(
    dtTicks: number,
    feed: FeedSource,
    feedWaiverSpecies: readonly AnimalSpecies[] = [],
  ): readonly AnimalProduce[] {
    const produced: AnimalProduce[] = [];
    for (const group of this.#groups) {
      if (group.count <= 0) continue;
      const definition = ANIMALS[group.species];
      if (!definition) continue;

      group.cycleTicks += dtTicks;
      if (group.cycleTicks < definition.cycleTicks) continue;
      group.cycleTicks -= definition.cycleTicks;

      const needed = definition.feedPerCycle * group.count;
      const available = feed.available(definition.feedItemId);
      const feedWaived = feedWaiverSpecies.includes(group.species);
      if (available < needed && !feedWaived) {
        this.events.emit('animal:hungry', {
          species: group.species,
          feedItemId: definition.feedItemId,
          needed,
          available,
        });
        continue;
      }
      if (!feedWaived) feed.consume(definition.feedItemId, needed);

      const quantity = definition.producePerCycle * group.count;
      produced.push({
        itemId: definition.producesItemId,
        quantity,
        shelterId: group.shelterId,
      });
      this.events.emit('animal:produced', {
        itemId: definition.producesItemId,
        quantity,
        shelterId: group.shelterId,
      });
    }
    return produced;
  }

  /** Group ids an animal-targeting incident could pick. */
  incidentCandidates(): string[] {
    return this.#groups.filter((group) => group.count > 0).map((group) => group.id);
  }

  hydrate(groups: readonly AnimalGroup[]): void {
    this.#groups = groups.map((group) => ({ ...group }));
    for (const group of this.#groups) {
      const match = /(\d+)$/.exec(group.id);
      if (match) this.#nextId = Math.max(this.#nextId, Number(match[1]) + 1);
    }
  }

  toSaveState(): AnimalGroup[] {
    return this.#groups.map((group) => ({ ...group }));
  }
}
