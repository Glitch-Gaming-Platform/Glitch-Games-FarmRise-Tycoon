/**
 * Borrowing, insuring and being bailed out.
 *
 * The restructuring command is the one that implements the decision in
 * docs/decisions/0017: a career is never ended by running out of money. It is
 * called by the career director, never by a button, because being insolvent is
 * not a choice the player makes.
 */
import {
  INSURANCE_POLICIES,
  LOAN_OFFERS,
  cheapestSeedCost,
  ok,
  repayLoan,
  restructure,
  ruleViolation,
  takeLoan,
  type Cents,
  type Result,
} from '@farmrise/shared';
import { cents } from '@farmrise/shared';
import type { Career } from '../../career/Career.js';

export function borrow(career: Career, offerId: string): Result<{ proceeds: Cents }> {
  if (!career.unlocks.includes('loans')) {
    return ruleViolation('No lender will look at a farm this size yet.');
  }
  const check = takeLoan(offerId, career.loans as never, career.tick);
  if (!check.ok) return check;

  career.addLoan(check.value.loan as never);
  career.adjustBalance(check.value.proceeds, 'loan');
  return ok({ proceeds: check.value.proceeds });
}

export function repay(career: Career, loanId: string, amount: number): Result<void> {
  const loan = career.loans.find((entry) => entry.id === loanId);
  if (!loan) return ruleViolation('You do not hold that loan.');

  const check = repayLoan(loan as never, cents(amount), career.balance);
  if (!check.ok) return check;

  career.adjustBalance(cents(-(loan.outstanding - check.value.loan.outstanding)), 'repayment');
  career.setLoans(
    career.loans
      .map((entry) => (entry.id === loanId ? (check.value.loan as never) : entry))
      .filter((entry) => entry.outstanding > 0),
  );
  return ok(undefined);
}

export function buyInsurance(career: Career, policyId: string): Result<void> {
  if (!career.unlocks.includes('insurance')) {
    return ruleViolation('No insurer covers a farm this size yet.');
  }
  const policy = INSURANCE_POLICIES.find((entry) => entry.policyId === policyId);
  if (!policy) return ruleViolation('No such policy.');
  if (career.insurance?.policyId === policyId)
    return ruleViolation('You already hold that policy.');

  career.setInsurance({
    policyId: policy.policyId,
    premiumPerDay: policy.premiumPerDay,
    coverage: policy.coverage,
    startedTick: career.tick,
    claimsMade: 0,
  });
  return ok(undefined);
}

export function cancelInsurance(career: Career): Result<void> {
  if (!career.insurance) return ruleViolation('You are not insured.');
  career.setInsurance(null);
  return ok(undefined);
}

/**
 * Forces an insolvent career back into a playable state.
 *
 * The farm shrinks and the terms are punitive, but the land, the buildings in
 * use and every relationship survive. The alternative - ending the career -
 * would make every long-horizon investment in this game irrational.
 */
export function restructureCareer(career: Career): Result<{ explanation: string }> {
  const world = career.world;
  const storedUnits = Object.values(world.inventory).reduce((sum, n) => sum + n, 0);

  // Idle assets the bank would sell: anything under construction, plus a cart
  // that is not needed. Land and working buildings are never taken.
  const liquidatable = world.structures.buildings
    .filter((building) => building.remainingBuildTicks > 0)
    .reduce((sum) => sum + 1_500, 0);

  const check = restructure(
    {
      balance: career.balance,
      loans: career.loans as never,
      liquidatableValue: cents(liquidatable),
      hasPlantableSeed: career.balance >= cheapestSeedCost(),
      growingPlots: world.fields.growingCount(),
      storedUnits,
    },
    career.tick,
  );
  if (!check.ok) return check;

  career.addLoan(check.value.loan as never);
  career.adjustBalance(cents(check.value.balance - career.balance), 'restructuring');
  career.bump('restructures');
  career.events.emit('career:restructured', { explanation: check.value.explanation });
  return ok({ explanation: check.value.explanation });
}

export function loanOffers() {
  return LOAN_OFFERS;
}

export function insurancePolicies() {
  return INSURANCE_POLICIES;
}
