import { describe, expect, it } from 'vitest';
import { BUYER_DEFINITIONS, cents } from '@farmrise/shared';
import { Career } from '@game/career/Career.js';
import { createProgressionReviewCareer } from '@game/debug/progressionReview.js';
import {
  acceptContract,
  cancelStandingContract,
  deliverContract,
  failContract,
  setWorkerPriorities,
  type ContractOffer,
} from '@game/world/FarmCommands.js';
import { addToYard, fundedCareer } from '../helpers/career.js';

function wheatOffer(careerTick = 0): ContractOffer {
  return {
    id: 'offer-standing-wheat',
    buyerId: 'millbrook_grocers',
    itemId: 'wheat',
    quantity: 2,
    unitPrice: cents(90),
    minimumQuality: 0,
    deadlineTick: careerTick + BUYER_DEFINITIONS.millbrook_grocers.deadlineTicks,
  };
}

describe('standing delivery commands', () => {
  it('requires the scheduled-delivery unlock', () => {
    const career = fundedCareer();
    career.grant(['contracts']);

    const result = acceptContract(career, wheatOffer(), true);

    expect(result.ok).toBe(false);
    expect(career.contracts).toHaveLength(0);
  });

  it('re-arms a completed delivery for the next buyer window', () => {
    const career = fundedCareer();
    career.grant(['contracts', 'scheduled_delivery']);
    expect(acceptContract(career, wheatOffer(), true).ok).toBe(true);
    const first = career.contracts[0]!;
    addToYard(career, 'wheat', 2);

    const delivered = deliverContract(career, first.id, 2);

    expect(delivered).toMatchObject({ ok: true, value: { complete: true, delivered: 2 } });
    expect(career.statistics.contractsCompleted).toBe(1);
    expect(career.contracts[0]).toMatchObject({
      status: 'open',
      delivered: 0,
      acceptedTick: first.deadlineTick,
      deadlineTick: first.deadlineTick + first.recurringEveryTicks,
    });
    addToYard(career, 'wheat', 2);
    expect(deliverContract(career, first.id, 2)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/window has not opened/i),
    });
  });

  it('re-arms a missed occurrence and lets the player end the schedule', () => {
    const career = fundedCareer();
    career.grant(['contracts', 'scheduled_delivery']);
    expect(acceptContract(career, wheatOffer(), true).ok).toBe(true);
    const contract = career.contracts[0]!;
    career.advance(contract.deadlineTick + 1);

    failContract(career, contract.id);

    expect(career.statistics.contractsFailed).toBe(1);
    expect(career.contracts[0]).toMatchObject({
      status: 'open',
      delivered: 0,
      acceptedTick: career.tick,
      deadlineTick: career.tick + contract.recurringEveryTicks,
    });
    expect(cancelStandingContract(career, contract.id).ok).toBe(true);
    expect(career.contracts[0]?.status).toBe('cancelled');
  });
});

describe('worker priorities', () => {
  it('accepts a complete reordered task list and rejects duplicates', () => {
    const career = Career.fromSaveState(createProgressionReviewCareer(3));
    const worker = career.world.workforce.workers[0]!;
    const reordered = [...worker.priorities.slice(1), worker.priorities[0]!];

    expect(setWorkerPriorities(career, worker.id, reordered).ok).toBe(true);
    expect(career.world.workforce.get(worker.id)?.priorities).toEqual(reordered);
    expect(
      setWorkerPriorities(
        career,
        worker.id,
        reordered.map(() => reordered[0]!),
      ),
    ).toMatchObject({ ok: false });
  });
});
