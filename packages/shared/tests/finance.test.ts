import { describe, expect, it } from 'vitest';
import {
  GAME_DAY_TICKS,
  INSURANCE_POLICIES,
  LOAN_OFFERS,
  MAX_TOTAL_DEBT,
  RESTRUCTURE_PRINCIPAL,
  cents,
  claimAmount,
  interestForTicks,
  isInsolvent,
  premiumForTicks,
  repayLoan,
  restructure,
  takeLoan,
  totalOutstanding,
  type InsolvencyState,
  type Loan,
} from '../src/index.js';

const loan = (overrides: Partial<Loan> = {}): Loan => ({
  id: 'loan-test',
  principal: cents(35_000),
  outstanding: cents(35_000),
  dailyRate: 0.018,
  takenTick: 0,
  origin: 'chosen',
  ...overrides,
});

const insolvency = (overrides: Partial<InsolvencyState> = {}): InsolvencyState => ({
  balance: cents(0),
  loans: [],
  liquidatableValue: cents(0),
  hasPlantableSeed: false,
  growingPlots: 0,
  storedUnits: 0,
  ...overrides,
});

describe('takeLoan', () => {
  it('hands over the principal named in the offer', () => {
    const offer = LOAN_OFFERS[0];
    if (!offer) throw new Error('There are no loan offers.');
    const result = takeLoan(offer.id, [], 100);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.proceeds).toBe(offer.principal);
    expect(result.value.loan.outstanding).toBe(offer.principal);
    expect(result.value.loan.origin).toBe('chosen');
  });

  it('refuses an offer that does not exist', () => {
    expect(takeLoan('loan-imaginary', [], 0).ok).toBe(false);
  });

  it('refuses to lend the same loan twice', () => {
    const offer = LOAN_OFFERS[0];
    if (!offer) throw new Error('There are no loan offers.');
    const first = takeLoan(offer.id, [], 0);
    if (!first.ok) throw new Error(first.reason);
    expect(takeLoan(offer.id, [first.value.loan], 10).ok).toBe(false);
  });

  it('refuses to push total debt past the ceiling', () => {
    const maxed = [loan({ outstanding: MAX_TOTAL_DEBT })];
    const offer = LOAN_OFFERS[0];
    if (!offer) throw new Error('There are no loan offers.');
    expect(takeLoan(offer.id, maxed, 0).ok).toBe(false);
  });
});

describe('interestForTicks', () => {
  it('charges the stated rate across a whole day', () => {
    const owed = interestForTicks([loan()], GAME_DAY_TICKS);
    expect(owed).toBeCloseTo(35_000 * 0.018, 5);
  });

  it('accrues a real amount per tick, small enough to need a carried remainder', () => {
    const perTick = interestForTicks([loan()], 1);
    expect(perTick).toBeGreaterThan(0);
    // The regression this guards: flooring this every tick made loans free.
    expect(perTick).toBeLessThan(1);
  });

  it('is zero with no debt', () => {
    expect(interestForTicks([], GAME_DAY_TICKS)).toBe(0);
  });

  it('sums across several loans', () => {
    const two = interestForTicks([loan(), loan({ id: 'loan-b' })], GAME_DAY_TICKS);
    expect(two).toBeCloseTo(interestForTicks([loan()], GAME_DAY_TICKS) * 2, 5);
  });
});

describe('repayLoan', () => {
  it('reduces the debt and the balance by the same amount', () => {
    const result = repayLoan(loan(), cents(5_000), cents(20_000));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.loan.outstanding).toBe(30_000);
    expect(result.value.balance).toBe(15_000);
  });

  it('never overpays past the outstanding balance', () => {
    const result = repayLoan(loan({ outstanding: cents(1_000) }), cents(5_000), cents(9_000));
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.loan.outstanding).toBe(0);
    expect(result.value.balance).toBe(8_000);
  });

  it('refuses money the player does not have', () => {
    expect(repayLoan(loan(), cents(5_000), cents(100)).ok).toBe(false);
  });

  it('refuses a non-positive repayment', () => {
    expect(repayLoan(loan(), cents(0), cents(9_000)).ok).toBe(false);
  });
});

describe('insurance', () => {
  it('charges a premium per tick that is real but sub-cent', () => {
    const policy = INSURANCE_POLICIES[0];
    if (!policy) throw new Error('There are no policies.');
    const perTick = premiumForTicks(policy.premiumPerDay, 1);
    expect(perTick).toBeGreaterThan(0);
    expect(perTick).toBeLessThan(1);
    expect(premiumForTicks(policy.premiumPerDay, GAME_DAY_TICKS)).toBeCloseTo(
      policy.premiumPerDay,
      5,
    );
  });

  it('reimburses the covered fraction of a loss and never more', () => {
    expect(claimAmount(cents(10_000), 0.4)).toBe(4_000);
    expect(claimAmount(cents(10_000), 2)).toBe(10_000);
    expect(claimAmount(cents(-500), 0.4)).toBe(0);
  });
});

describe('isInsolvent', () => {
  it('is true only when there is no way back into the loop', () => {
    expect(isInsolvent(insolvency())).toBe(true);
  });

  it('is false while a crop is still in the ground', () => {
    expect(isInsolvent(insolvency({ growingPlots: 1 }))).toBe(false);
  });

  it('is false while there is anything left to sell', () => {
    expect(isInsolvent(insolvency({ storedUnits: 3 }))).toBe(false);
  });

  it('is false while the player can still afford a seed', () => {
    expect(isInsolvent(insolvency({ hasPlantableSeed: true }))).toBe(false);
  });
});

describe('restructure', () => {
  it('refuses to restructure a farm that can still trade its way out', () => {
    expect(restructure(insolvency({ storedUnits: 5 }), 1_000).ok).toBe(false);
  });

  it('puts the player back in the game on punishing terms', () => {
    const result = restructure(insolvency(), 1_000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.loan.origin).toBe('restructure');
    expect(result.value.loan.outstanding).toBe(RESTRUCTURE_PRINCIPAL);
    expect(result.value.balance).toBeGreaterThanOrEqual(RESTRUCTURE_PRINCIPAL);
    const chosenWorstRate = Math.max(...LOAN_OFFERS.map((offer) => offer.dailyRate));
    expect(result.value.loan.dailyRate).toBeGreaterThan(chosenWorstRate);
  });

  it('adds whatever idle assets were sold to the balance', () => {
    const result = restructure(insolvency({ liquidatableValue: cents(3_000) }), 1_000);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.liquidated).toBe(3_000);
    expect(result.value.balance).toBe(RESTRUCTURE_PRINCIPAL + 3_000);
  });

  it('refuses when the farm already carries the maximum debt', () => {
    const result = restructure(insolvency({ loans: [loan({ outstanding: MAX_TOTAL_DEBT })] }), 1);
    expect(result.ok).toBe(false);
  });

  it('explains itself in words a player can act on', () => {
    const result = restructure(insolvency(), 1_000);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.explanation).toMatch(/still yours/i);
  });
});

describe('totalOutstanding', () => {
  it('adds up every debt', () => {
    expect(totalOutstanding([loan(), loan({ outstanding: cents(1_000) })])).toBe(36_000);
  });
});
