import { describe, expect, it } from 'vitest';
import {
  GAME_DAY_TICKS,
  MAX_WORKERS,
  MAX_WORKER_SKILL,
  TASKS_PER_SKILL_LEVEL,
  WORKER_ROLES,
  actionTicks,
  canPerform,
  carryCapacityFor,
  cents,
  completeTask,
  dailyPayroll,
  defaultPriorities,
  effectiveness,
  nextTaskFor,
  validateHire,
  wagesForTicks,
  type Worker,
} from '../src/index.js';

const worker = (overrides: Partial<Worker> = {}): Worker => ({
  id: 'worker-1',
  role: 'field_hand',
  displayName: 'Aoife',
  skill: 0,
  tasksCompleted: 0,
  priorities: defaultPriorities('field_hand'),
  ...overrides,
});

const hiring = (overrides = {}) => ({
  workers: [] as Worker[],
  balance: cents(50_000),
  freeHuts: 1,
  unlocks: ['workers'],
  ...overrides,
});

describe('validateHire', () => {
  it('takes someone on when the money, the hut and the unlock are all there', () => {
    const result = validateHire('field_hand', hiring());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cost).toBe(WORKER_ROLES.field_hand.hiringCost);
  });

  it('refuses before the career has unlocked hiring', () => {
    expect(validateHire('field_hand', hiring({ unlocks: [] })).ok).toBe(false);
  });

  it('refuses with nowhere for them to live', () => {
    const result = validateHire('field_hand', hiring({ freeHuts: 0 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/hut/i);
  });

  it('refuses without the money', () => {
    expect(validateHire('field_hand', hiring({ balance: cents(10) })).ok).toBe(false);
  });

  it('refuses past the number of people one player can manage', () => {
    const crowd = Array.from({ length: MAX_WORKERS }, (_, index) =>
      worker({ id: `worker-${index}` }),
    );
    expect(validateHire('field_hand', hiring({ workers: crowd, freeHuts: 5 })).ok).toBe(false);
  });

  it('refuses a job that does not exist', () => {
    expect(validateHire('astronaut', hiring()).ok).toBe(false);
  });
});

describe('payroll', () => {
  it('is charged per day whether or not there was work', () => {
    const two = [worker(), worker({ id: 'worker-2', role: 'hauler' })];
    expect(dailyPayroll(two)).toBe(
      cents(WORKER_ROLES.field_hand.wagePerDay + WORKER_ROLES.hauler.wagePerDay),
    );
    expect(wagesForTicks(two, GAME_DAY_TICKS)).toBeCloseTo(dailyPayroll(two), 5);
  });

  it('accrues a sub-cent amount per tick, so the remainder must be carried', () => {
    const perTick = wagesForTicks([worker()], 1);
    expect(perTick).toBeGreaterThan(0);
    expect(perTick).toBeLessThan(1);
  });

  it('is nothing with nobody employed', () => {
    expect(dailyPayroll([])).toBe(0);
  });
});

describe('effectiveness', () => {
  it('starts below the player’s own speed', () => {
    expect(effectiveness(worker())).toBeLessThan(1);
  });

  it('improves with experience but never overtakes the player', () => {
    const veteran = worker({ skill: MAX_WORKER_SKILL });
    expect(effectiveness(veteran)).toBeGreaterThan(effectiveness(worker()));
    expect(effectiveness(veteran)).toBeLessThanOrEqual(1);
  });

  it('makes an experienced worker quicker and able to carry more', () => {
    const veteran = worker({ skill: MAX_WORKER_SKILL });
    expect(actionTicks(veteran)).toBeLessThanOrEqual(actionTicks(worker()));
    expect(carryCapacityFor(veteran)).toBeGreaterThanOrEqual(carryCapacityFor(worker()));
  });
});

describe('completeTask', () => {
  it('promotes a worker once they have done the work for it', () => {
    let current = worker({ tasksCompleted: TASKS_PER_SKILL_LEVEL - 1 });
    current = completeTask(current);
    expect(current.skill).toBe(1);
  });

  it('caps skill', () => {
    const current = completeTask(
      worker({ tasksCompleted: TASKS_PER_SKILL_LEVEL * 99, skill: MAX_WORKER_SKILL }),
    );
    expect(current.skill).toBe(MAX_WORKER_SKILL);
  });
});

describe('task selection', () => {
  it('only accepts jobs its role does', () => {
    expect(canPerform(worker(), 'harvest')).toBe(true);
    expect(canPerform(worker(), 'load_processor')).toBe(false);
  });

  it('follows the player’s priority order', () => {
    const instructed = worker({ priorities: ['harvest', 'tend'] });
    expect(nextTaskFor(instructed, ['tend', 'harvest'])).toBe('harvest');
  });

  it('stands still rather than inventing a job', () => {
    expect(nextTaskFor(worker(), [])).toBeNull();
    expect(nextTaskFor(worker(), ['load_processor'])).toBeNull();
  });
});
