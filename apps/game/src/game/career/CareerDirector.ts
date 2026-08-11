/**
 * The career's clock-keeper.
 *
 * SessionController used to own the run: first-session panels, onboarding, and
 * the terminal outcome. A career has no terminal outcome, so that job split in
 * three (docs/PROGRESSION_GAMEPLAY_PLAN.md §39.1). This is the part that
 * watches the long horizon: milestones, season boundaries, contract deadlines,
 * town building, and the moment a farm has to be restructured rather than
 * abandoned.
 */
import {
  COMMUNITY_PROJECTS_BY_ID,
  calendarAt,
  seasonDefinition,
  type CalendarDate,
  type MilestoneDefinition,
  type RunSummary,
  type Season,
} from '@farmrise/shared';
import { EventBus } from '@engine/core/EventBus.js';
import type { Career } from './Career.js';
import { failContract } from '../world/commands/market.js';
import { restructureCareer } from '../world/commands/finance.js';

export interface CareerDirectorEvents extends Record<string, unknown> {
  'career:milestone-ready': { milestone: MilestoneDefinition };
  'career:milestone-claimed': { milestone: MilestoneDefinition };
  'career:season-review': { summary: RunSummary; date: CalendarDate; advice: string };
  'career:contract-failed': { contractId: string; buyerId: string };
  'career:project-completed': { projectId: string; displayName: string };
  'career:restructured': { explanation: string };
  'career:warning': { message: string };
}

export class CareerDirector {
  readonly events = new EventBus<CareerDirectorEvents>();

  #announcedMilestoneId: string | null = null;
  #lastSeasonTick = 0;
  #warnedStrained = false;
  #seasonOpeningStats: { earned: number; spent: number; harvested: number; cycles: number };

  constructor(private readonly career: Career) {
    this.#lastSeasonTick = career.tick;
    this.#seasonOpeningStats = this.#snapshot();
  }

  fixedUpdate(): void {
    this.#checkContracts();
    this.#advanceTownProject();
    this.#checkMilestone();
    this.#checkSeasonBoundary();
    this.#checkSolvency();
  }

  /** Claims the milestone the player has earned. Called from the milestone card. */
  claim(milestoneId: string) {
    const result = this.career.claim(milestoneId);
    if (result.ok) {
      this.#announcedMilestoneId = null;
      this.events.emit('career:milestone-claimed', { milestone: result.value.milestone });
    }
    return result;
  }

  #checkMilestone(): void {
    const milestone = this.career.milestone();
    if (!milestone) return;
    if (this.#announcedMilestoneId === milestone.id) return;
    if (this.career.milestoneProgress() < 1) return;

    this.#announcedMilestoneId = milestone.id;
    this.events.emit('career:milestone-ready', { milestone });
  }

  #checkContracts(): void {
    for (const contract of this.career.contracts) {
      if (contract.status !== 'open') continue;
      if (this.career.tick <= contract.deadlineTick) continue;
      failContract(this.career, contract.id);
      this.events.emit('career:contract-failed', {
        contractId: contract.id,
        buyerId: contract.buyerId,
      });
    }
  }

  #advanceTownProject(): void {
    const active = this.career.town.activeProject;
    if (!active) return;

    const remainingTicks = Math.max(0, active.remainingTicks - 1);
    if (remainingTicks > 0) {
      this.career.setTown({
        ...this.career.town,
        activeProject: { ...active, remainingTicks },
      });
      return;
    }

    const project = COMMUNITY_PROJECTS_BY_ID[active.id];
    this.career.setTown({
      ...this.career.town,
      prosperity: this.career.town.prosperity + (project?.prosperity ?? 0),
      completedProjectIds: [...this.career.town.completedProjectIds, active.id],
      activeProject: null,
    });
    if (project) {
      this.events.emit('career:project-completed', {
        projectId: project.id,
        displayName: project.displayName,
      });
    }
  }

  /**
   * A season boundary is a review, not a reset.
   *
   * Nothing is taken away. What the player gets is a summary of the stretch
   * they just played and a sentence about what the next season is good for,
   * which is the whole point of having seasons at all.
   */
  #checkSeasonBoundary(): void {
    const previous = calendarAt(this.#lastSeasonTick);
    const current = this.career.date;
    if (previous.season === current.season && previous.year === current.year) return;

    const summary = this.summary('season');
    this.#lastSeasonTick = this.career.tick;
    this.#seasonOpeningStats = this.#snapshot();
    this.events.emit('career:season-review', {
      summary,
      date: current,
      advice: this.#adviceFor(current.season),
    });
  }

  #checkSolvency(): void {
    const health = this.career.health();
    if (health === 'strained' && !this.#warnedStrained) {
      this.#warnedStrained = true;
      this.events.emit('career:warning', {
        message:
          'Running costs are outpacing income. Sell something, or take a loan before the bank chooses for you.',
      });
      return;
    }
    if (health === 'healthy') {
      this.#warnedStrained = false;
      return;
    }
    if (health !== 'insolvent') return;

    const result = restructureCareer(this.career);
    if (result.ok) {
      this.#warnedStrained = false;
      this.events.emit('career:restructured', { explanation: result.value.explanation });
    }
  }

  /** A summary of the stretch of play since the last season boundary. */
  summary(outcome: RunSummary['outcome']): RunSummary {
    const stats = this.career.statistics;
    const opening = this.#seasonOpeningStats;
    return {
      outcome,
      stage: this.career.stage,
      stageName: this.career.milestone()?.roleName ?? 'Farmer',
      season: this.career.season,
      elapsedTicks: this.career.tick - this.#lastSeasonTick,
      finalBalance: this.career.balance,
      peakBalance: stats.peakBalance as never,
      totalEarned: (stats.lifetimeEarned - opening.earned) as never,
      totalSpent: (stats.lifetimeSpent - opening.spent) as never,
      cropsHarvested: stats.cropsHarvested - opening.harvested,
      cyclesCompleted: stats.cyclesCompleted - opening.cycles,
      goodsHauled: stats.goodsHauled,
      goodsProcessed: stats.goodsProcessed,
      contractsCompleted: stats.contractsCompleted,
      incidentsSurvived: stats.incidentsSurvived,
      incidentsMitigated: stats.incidentsMitigated,
      buildingsBuilt: stats.buildingsBuilt,
    };
  }

  #adviceFor(season: Season): string {
    return seasonDefinition(season).summary;
  }

  #snapshot() {
    const stats = this.career.statistics;
    return {
      earned: stats.lifetimeEarned,
      spent: stats.lifetimeSpent,
      harvested: stats.cropsHarvested,
      cycles: stats.cyclesCompleted,
    };
  }
}
