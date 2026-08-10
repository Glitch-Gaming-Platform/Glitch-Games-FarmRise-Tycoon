/**
 * Locally generated market contracts.
 *
 * The server owns contracts when a player is signed in, but the first
 * playable must work with no backend at all - and without contracts there is
 * no spot-versus-contract decision, which is the trade-off the whole market
 * step exists to create. So the client generates its own when the server has
 * not supplied any.
 *
 * This is NOT a second source of truth. When the server sends contracts they
 * replace these wholesale, and the server still validates every fulfilment
 * against its own stored inventory. A forged local contract buys nothing:
 * the payout is computed server-side from the server's own order row.
 */
import {
  DEFAULT_BUYER_ID,
  ITEMS,
  asOrderId,
  cents,
  createRng,
  secondsToTicks,
  spotPriceFor,
  type MarketOrder,
  type Rng,
} from '@farmrise/shared';

/** How long a locally generated contract stays open. */
const WINDOW_TICKS = secondsToTicks(240);
/** Target number of open contracts. Three is enough to present a choice. */
const TARGET_OPEN = 3;

function makeOrder(rng: Rng, itemId: string, tick: number, index: number): MarketOrder {
  const spot = spotPriceFor(itemId);
  // 15-45% over spot, matching the server's generator. The premium is the
  // entire reason to accept a deadline.
  const premium = 1.15 + rng.next() * 0.3;
  return {
    id: asOrderId(`local-${tick}-${index}`),
    buyerId: DEFAULT_BUYER_ID,
    itemId,
    quantity: 4 + rng.int(0, 9),
    unitPrice: cents(Math.round(spot * premium)),
    deadlineTick: tick + WINDOW_TICKS + rng.int(0, secondsToTicks(180)),
    status: 'open',
  };
}

/**
 * Tops up the open contract list.
 *
 * Expired orders are dropped, and new ones are generated from the world's own
 * seeded RNG so a reload produces the same market rather than a reroll the
 * player could farm.
 */
export function refreshLocalContracts(
  existing: readonly MarketOrder[],
  tick: number,
  rng: Rng,
): MarketOrder[] {
  const live = existing.filter((order) => order.deadlineTick > tick && order.status === 'open');
  if (live.length >= TARGET_OPEN) return live;

  const itemIds = Object.keys(ITEMS);
  const generated = [...live];
  for (let index = live.length; index < TARGET_OPEN; index += 1) {
    generated.push(makeOrder(rng, rng.pick(itemIds), tick, index));
  }
  return generated;
}

export function createContractRng(seed: number): Rng {
  return createRng(seed);
}
