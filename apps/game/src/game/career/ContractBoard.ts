/**
 * The offers on the table.
 *
 * Offers are generated locally so the market screen has something to show
 * offline, from the career's market RNG stream so the sequence is reproducible.
 * The server still owns the money: accepting is a promise, and the payout for a
 * delivery is re-computed authoritatively when the save is written.
 *
 * Each buyer's offers look like that buyer - the cannery asks for a lot of one
 * thing, the restaurant asks for a little of something good - because a second
 * buyer that behaves like the first is not a second buyer.
 */
import {
  BUYER_DEFINITIONS,
  BUYER_IDS,
  applyContractCommitmentBonus,
  buyerAvailability,
  isContractItemUnlocked,
  marketItemIdsForSeason,
  spotPriceFor,
  townDemandMultiplier,
  trustVolumeMultiplier,
  type BuyerDefinition,
  type BuyerId,
  type Cents,
} from '@farmrise/shared';
import type { Career } from './Career.js';
import { offeredUnitPrice, type ContractOffer } from '../world/commands/market.js';

export interface BoardEntry {
  readonly offer: ContractOffer;
  readonly buyer: BuyerDefinition;
  readonly spotValue: Cents;
}

/** How long an unaccepted offer stays on the board. */
const OFFER_LIFETIME_TICKS = 60 * 240;

export class ContractBoard {
  #entries: BoardEntry[] = [];
  #nextRefreshTick = 0;
  #sequence = 0;

  constructor(private readonly career: Career) {}

  get entries(): readonly BoardEntry[] {
    return this.#entries;
  }

  /** Offers from buyers who will currently deal with this farm. */
  available(): readonly BoardEntry[] {
    if (!this.career.has('contracts')) return [];
    const taken = new Set(this.career.contracts.map((contract) => contract.id));
    return this.#entries.filter((entry) => !taken.has(entry.offer.id));
  }

  fixedUpdate(): void {
    if (this.career.tick < this.#nextRefreshTick) return;
    this.#nextRefreshTick = this.career.tick + OFFER_LIFETIME_TICKS / 2;
    this.refresh();
  }

  /** Rebuilds the board, keeping offers that have not expired. */
  refresh(): void {
    if (!this.career.has('contracts')) {
      this.#entries = [];
      return;
    }
    this.#entries = this.#entries.filter((entry) => entry.offer.deadlineTick > this.career.tick);

    for (const buyerId of BUYER_IDS) {
      const relationship = this.career.relationship(buyerId);
      const availability = buyerAvailability(
        buyerId,
        this.career.stage,
        relationship.trust,
        this.career.unlocks,
      );
      if (!availability.ok || !availability.value.available) continue;
      if (this.#entries.filter((entry) => entry.offer.buyerId === buyerId).length >= 2) continue;
      const entry = this.#generate(buyerId);
      if (entry) this.#entries.push(entry);
    }
  }

  #generate(buyerId: BuyerId): BoardEntry | null {
    const buyer = BUYER_DEFINITIONS[buyerId];
    const rng = this.career.rng('market');
    const relationship = this.career.relationship(buyerId);

    const seasonalItems = new Set(marketItemIdsForSeason(this.career.season));
    const preferences = buyer.itemPreference.filter(
      (itemId) => seasonalItems.has(itemId) && isContractItemUnlocked(itemId, this.career.unlocks),
    );
    const itemId = preferences[rng.int(0, preferences.length)];
    if (!itemId) return null;

    const span = buyer.orderSize.max - buyer.orderSize.min;
    const quantity = Math.max(
      1,
      Math.round(
        (buyer.orderSize.min + rng.next() * span) *
          trustVolumeMultiplier(relationship.trust) *
          townDemandMultiplier(this.career.town.prosperity),
      ),
    );

    this.#sequence += 1;
    const unitPrice = applyContractCommitmentBonus(
      offeredUnitPrice(this.career, buyerId, itemId),
      rng.next(),
    );

    return {
      buyer,
      spotValue: (spotPriceFor(itemId) * quantity) as Cents,
      offer: {
        id: `offer-${buyerId}-${this.career.tick}-${this.#sequence}`,
        buyerId,
        itemId,
        quantity,
        unitPrice,
        minimumQuality: buyer.minimumQuality,
        deadlineTick: this.career.tick + buyer.deadlineTicks,
      },
    };
  }
}
