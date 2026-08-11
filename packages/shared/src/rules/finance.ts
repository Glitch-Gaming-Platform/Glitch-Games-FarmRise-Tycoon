/**
 * Debt, insurance and what happens when the money runs out.
 *
 * The decision recorded in docs/decisions/0018-career-restructuring-instead-of-
 * bankruptcy.md is that a persistent career is never ended by going broke. A
 * career that can be deleted by one bad season would make every one of the
 * plan's long-horizon investments irrational to make.
 *
 * Instead, insolvency forces a restructuring: a loan the player did not choose,
 * on worse terms than one they would have, plus the sale of assets they were
 * not using. It hurts, it is legible, and the farm is still there afterwards.
 */
import { cents, subCents, type Cents } from '../domain/ids.js';
import { GAME_DAY_TICKS, type Ticks } from '../domain/time.js';
import { ok, ruleViolation, type Result } from './result.js';

export interface Loan {
  readonly id: string;
  readonly principal: Cents;
  readonly outstanding: Cents;
  readonly dailyRate: number;
  readonly takenTick: Ticks;
  readonly origin: 'chosen' | 'restructure';
}

export interface LoanOffer {
  readonly id: string;
  readonly displayName: string;
  readonly principal: Cents;
  readonly dailyRate: number;
  readonly description: string;
}

/**
 * The loans on offer.
 *
 * Priced so that the cheap one is only available while the farm is healthy -
 * borrowing is a growth tool for a player with a plan, not a lifeline, because
 * the lifeline is the restructure and it is meant to feel worse than this.
 */
export const LOAN_OFFERS: readonly LoanOffer[] = Object.freeze([
  {
    id: 'loan-seed-advance',
    displayName: 'Seed advance',
    principal: cents(10_000),
    dailyRate: 0.012,
    description: 'A small advance against the coming harvest. Cheap, and quickly repaid.',
  },
  {
    id: 'loan-improvement',
    displayName: 'Improvement loan',
    principal: cents(35_000),
    dailyRate: 0.018,
    description: 'Enough to build something substantial before you have earned it.',
  },
  {
    id: 'loan-expansion',
    displayName: 'Expansion loan',
    principal: cents(90_000),
    dailyRate: 0.026,
    description:
      'Buys the last parcel or a full processing yard. The interest weighs on every season.',
  },
]);

/** Total a farm may owe at once, as a multiple of the largest offer. */
export const MAX_TOTAL_DEBT: Cents = cents(150_000);

export function totalOutstanding(loans: readonly Loan[]): Cents {
  return cents(loans.reduce((sum, loan) => sum + loan.outstanding, 0));
}

export function takeLoan(
  offerId: string,
  loans: readonly Loan[],
  nowTick: Ticks,
): Result<{ loan: Loan; proceeds: Cents }> {
  const offer = LOAN_OFFERS.find((entry) => entry.id === offerId);
  if (!offer) return ruleViolation(`Unknown loan: ${offerId}.`);
  if (loans.some((loan) => loan.id.startsWith(offer.id))) {
    return ruleViolation('You already hold that loan.');
  }
  if (totalOutstanding(loans) + offer.principal > MAX_TOTAL_DEBT) {
    return ruleViolation('The bank will not lend you any more against this farm.');
  }
  return ok({
    loan: {
      id: `${offer.id}-${nowTick}`,
      principal: offer.principal,
      outstanding: offer.principal,
      dailyRate: offer.dailyRate,
      takenTick: nowTick,
      origin: 'chosen',
    },
    proceeds: offer.principal,
  });
}

/** Interest accrued across a span of ticks. Charged against the balance, not capitalised. */
export function interestForTicks(loans: readonly Loan[], dtTicks: Ticks): number {
  return loans.reduce(
    (sum, loan) => sum + (loan.outstanding * loan.dailyRate * dtTicks) / GAME_DAY_TICKS,
    0,
  );
}

export function repayLoan(
  loan: Loan,
  amount: Cents,
  balance: Cents,
): Result<{ loan: Loan; balance: Cents }> {
  if (amount <= 0) return ruleViolation('Repayment must be positive.');
  if (amount > balance) return ruleViolation('You do not have that much.');
  const applied = Math.min(amount, loan.outstanding) as Cents;
  return ok({
    loan: { ...loan, outstanding: subCents(loan.outstanding, applied) },
    balance: subCents(balance, applied),
  });
}

// -- insurance -------------------------------------------------------------

export interface InsurancePolicy {
  readonly policyId: string;
  readonly displayName: string;
  readonly premiumPerDay: Cents;
  readonly coverage: number;
  readonly description: string;
}

export const INSURANCE_POLICIES: readonly InsurancePolicy[] = Object.freeze([
  {
    policyId: 'policy-basic',
    displayName: 'Basic cover',
    premiumPerDay: cents(180),
    coverage: 0.4,
    description: 'Reimburses two fifths of what an incident costs you. Cheap enough to forget.',
  },
  {
    policyId: 'policy-full',
    displayName: 'Full cover',
    premiumPerDay: cents(520),
    coverage: 0.75,
    description:
      'Three quarters back on any incident loss. A real cost every day, whether or not one comes.',
  },
]);

export function premiumForTicks(premiumPerDay: Cents, dtTicks: Ticks): number {
  return (premiumPerDay * dtTicks) / GAME_DAY_TICKS;
}

export function claimAmount(loss: Cents, coverage: number): Cents {
  return cents(Math.max(0, loss) * Math.min(1, Math.max(0, coverage)));
}

// -- restructuring ---------------------------------------------------------

/** Interest on a loan the player did not choose. Deliberately the worst rate available. */
export const RESTRUCTURE_DAILY_RATE = 0.035;
/** Cash a restructuring puts in the player's hand. Enough to plant, not enough to relax. */
export const RESTRUCTURE_PRINCIPAL: Cents = cents(12_000);

export interface InsolvencyState {
  readonly balance: Cents;
  readonly loans: readonly Loan[];
  /** Value the farm could raise by selling things it is not using. */
  readonly liquidatableValue: Cents;
  readonly hasPlantableSeed: boolean;
  readonly growingPlots: number;
  readonly storedUnits: number;
}

/**
 * Insolvency is having no way back into the loop, not merely being poor.
 *
 * All of it has to be true at once: no money for the cheapest seed, nothing
 * stored to sell, nothing growing that will finish on its own. A player who is
 * simply broke is having a bad season, and telling them otherwise would
 * contradict the entire event design.
 */
export function isInsolvent(state: InsolvencyState): boolean {
  return !state.hasPlantableSeed && state.storedUnits === 0 && state.growingPlots === 0;
}

export interface Restructure {
  readonly loan: Loan;
  readonly balance: Cents;
  /** How much of the liquidatable value was actually sold. */
  readonly liquidated: Cents;
  readonly explanation: string;
}

/**
 * Forces a career back into a playable state.
 *
 * The career continues. What the player loses is optionality: a punitive loan
 * that will drag on every season until it is cleared, and whichever idle assets
 * the bank decided to sell.
 */
export function restructure(state: InsolvencyState, nowTick: Ticks): Result<Restructure> {
  if (!isInsolvent(state)) {
    return ruleViolation('The farm is not insolvent; there is still a way to trade out of this.');
  }
  if (totalOutstanding(state.loans) >= MAX_TOTAL_DEBT) {
    return ruleViolation('This farm cannot carry any more debt.');
  }

  const liquidated = state.liquidatableValue;
  const loan: Loan = {
    id: `loan-restructure-${nowTick}`,
    principal: RESTRUCTURE_PRINCIPAL,
    outstanding: RESTRUCTURE_PRINCIPAL,
    dailyRate: RESTRUCTURE_DAILY_RATE,
    takenTick: nowTick,
    origin: 'restructure',
  };

  return ok({
    loan,
    balance: cents(state.balance + RESTRUCTURE_PRINCIPAL + liquidated),
    liquidated,
    explanation:
      'The bank has restructured the farm: idle assets were sold and an emergency loan issued. The interest is punishing, but the land, the buildings you use and every relationship you have built are still yours.',
  });
}
