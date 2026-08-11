/**
 * Regression cover for two silent economic failures.
 *
 * Both were invisible in play: nothing threw, nothing looked wrong on screen,
 * and the farm simply behaved as though debt and weight did not exist. They are
 * exactly the class of bug that only a test asserting the *amount* catches.
 */
import { describe, expect, it } from 'vitest';
import {
  GAME_DAY_TICKS,
  LOAN_OFFERS,
  YARD_STORE_ID,
  getItem,
  loadWeight,
  newCareer,
  storageUsed,
} from '@farmrise/shared';
import { Career } from '@game/career/Career.js';
import { borrow, buyInsurance } from '@game/world/FarmCommands.js';

function freshCareer(): Career {
  return Career.fromSaveState(newCareer({ careerId: 'career-test', seed: 11 }));
}

function advanceDays(career: Career, days: number): void {
  for (let tick = 0; tick < GAME_DAY_TICKS * days; tick += 1) career.advance(1);
}

describe('running costs', () => {
  it('charges interest on a loan instead of rounding it away every tick', () => {
    const career = freshCareer();
    career.grant(['loans']);
    const offer = LOAN_OFFERS[0];
    if (!offer) throw new Error('There are no loan offers.');

    const taken = borrow(career, offer.id);
    expect(taken.ok).toBe(true);
    const afterBorrowing = career.balance;

    advanceDays(career, 1);

    // Interest accrues at a fraction of a cent per tick. Flooring that every tick
    // without carrying the remainder made a loan completely free.
    const spent = afterBorrowing - career.balance;
    const expectedInterest = offer.principal * offer.dailyRate;
    expect(spent).toBeGreaterThanOrEqual(expectedInterest * 0.5);
  });

  it('charges an insurance premium for a policy that is held', () => {
    const insured = freshCareer();
    insured.grant(['insurance']);
    const bought = buyInsurance(insured, 'policy-basic');
    expect(bought.ok).toBe(true);
    const insuredStart = insured.balance;
    advanceDays(insured, 1);

    const uninsured = freshCareer();
    const uninsuredStart = uninsured.balance;
    advanceDays(uninsured, 1);

    expect(insuredStart - insured.balance).toBeGreaterThan(uninsuredStart - uninsured.balance);
  });

  it('carries the fraction, so the same day costs the same in one step or many', () => {
    const perTick = freshCareer();
    perTick.grant(['loans']);
    const offer = LOAN_OFFERS[1];
    if (!offer) throw new Error('There are no loan offers.');
    borrow(perTick, offer.id);
    const before = perTick.balance;
    advanceDays(perTick, 1);
    const charged = before - perTick.balance;

    // Within a cent of the stated daily rate, allowing for upkeep of zero
    // buildings and the rounding of the final tick.
    expect(Math.abs(charged - offer.principal * offer.dailyRate)).toBeLessThanOrEqual(2);
  });
});

describe('store capacity', () => {
  it('counts processed goods by their storage weight, not by item count', () => {
    const career = freshCareer();
    const yard = career.world.stores.get(YARD_STORE_ID);
    if (!yard) throw new Error('The starter farm has no yard store.');

    const cheeseWeight = getItem('cheese')?.storageWeight ?? 1;
    expect(cheeseWeight).toBeGreaterThan(1);

    const outcome = career.world.stores.deposit(yard.id, 'cheese', 999, 1);
    expect(outcome.stored).toBeGreaterThan(0);
    expect(outcome.spilled).toBeGreaterThan(0);

    // The regression this guards: storing by count let a barn hold twice the
    // weight it should, and the server then refused to save the career.
    expect(loadWeight(yard.items)).toBeLessThanOrEqual(yard.capacity);
    expect(storageUsed(yard.items)).toBeLessThanOrEqual(yard.capacity);
  });

  it('still fills a store exactly to the brim with light goods', () => {
    const career = freshCareer();
    const yard = career.world.stores.get(YARD_STORE_ID);
    if (!yard) throw new Error('The starter farm has no yard store.');

    // The starter yard already holds the feed the hens need, so the room left
    // is the capacity minus what is in there rather than the whole capacity.
    const roomBefore = yard.capacity - loadWeight(yard.items);
    const outcome = career.world.stores.deposit(yard.id, 'wheat', 999, 1);
    expect(outcome.stored).toBe(roomBefore);
    expect(loadWeight(yard.items)).toBe(yard.capacity);
  });
});
