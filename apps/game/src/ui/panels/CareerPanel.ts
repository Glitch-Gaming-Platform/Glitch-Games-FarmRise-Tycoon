import { formatCents, type Cents } from '@farmrise/shared';
import { button, clear, el } from '../core/dom.js';
import { uiIcon } from '../core/icons.js';

export interface CareerMilestoneSnapshot {
  readonly id: string;
  readonly title: string;
  readonly roleName: string;
  readonly summary: string;
  readonly progress: number;
  readonly ready: boolean;
  readonly requirements: readonly string[];
}

export interface CareerActionRow {
  readonly id: string;
  readonly title: string;
  readonly meta: string;
  readonly action: string;
  readonly enabled: boolean;
  readonly selected?: boolean;
}

export interface ProcessorActionRow extends CareerActionRow {
  readonly buildingId: string;
  readonly recipeId: string;
}

export interface LoanRow extends CareerActionRow {
  readonly loanId?: string;
  readonly amount?: number;
}

export interface CareerPanelSnapshot {
  readonly balance: Cents;
  readonly stageName: string;
  readonly health: string;
  readonly milestone: CareerMilestoneSnapshot | null;
  readonly specializations: readonly CareerActionRow[];
  readonly processors: readonly ProcessorActionRow[];
  readonly workers: readonly CareerActionRow[];
  readonly loans: readonly LoanRow[];
  readonly insurance: readonly CareerActionRow[];
}

export interface CareerPanelCallbacks {
  readonly onClaimMilestone: (milestoneId: string) => void;
  readonly onChooseSpecialization: (id: string) => void;
  readonly onQueueProcessing: (buildingId: string, recipeId: string) => void;
  readonly onHireWorker: (role: string) => void;
  readonly onTakeLoan: (offerId: string) => void;
  readonly onRepayLoan: (loanId: string, amount: number) => void;
  readonly onBuyInsurance: (policyId: string) => void;
  readonly onCancelInsurance: () => void;
  readonly onClose: () => void;
}

export class CareerPanel {
  readonly root: HTMLElement;
  readonly #body: HTMLElement;
  readonly #summary: HTMLElement;
  #visible = false;

  constructor(private readonly callbacks: CareerPanelCallbacks) {
    this.#body = el('div', { class: 'fr-career__body', testId: 'career-options' });
    this.#summary = el('p', { class: 'fr-market__summary' });
    this.root = el(
      'aside',
      {
        class: 'fr-panel-layer',
        testId: 'career-panel',
        attrs: { role: 'dialog', 'aria-label': 'Farm office' },
      },
      el(
        'div',
        { class: 'fr-panel-card' },
        el(
          'header',
          { class: 'fr-panel-card__head' },
          el(
            'div',
            { class: 'fr-panel-card__title' },
            uiIcon('land', '', 'fr-panel-card__icon'),
            el('h2', { text: 'Farm Office' }),
          ),
          button('Close', callbacks.onClose, {
            class: 'fr-btn fr-btn--ghost fr-btn--small',
            testId: 'career-close',
          }),
        ),
        this.#summary,
        this.#body,
      ),
    );
    this.root.hidden = true;
  }

  get visible(): boolean {
    return this.#visible;
  }

  setVisible(visible: boolean): void {
    this.#visible = visible;
    this.root.hidden = !visible;
  }

  update(snapshot: CareerPanelSnapshot): void {
    this.#summary.textContent = `${snapshot.stageName}  ·  ${snapshot.health}  ·  ${formatCents(snapshot.balance)} in hand`;
    clear(this.#body);

    this.#body.append(el('h3', { class: 'fr-panel-card__section', text: 'Current milestone' }));
    this.#body.append(this.#milestone(snapshot.milestone));
    this.#appendRows('Specialization', snapshot.specializations, (row) =>
      this.callbacks.onChooseSpecialization(row.id),
    );
    this.#appendRows('Processing', snapshot.processors, (row) =>
      this.callbacks.onQueueProcessing(row.buildingId, row.recipeId),
    );
    this.#appendRows('Workers', snapshot.workers, (row) => this.callbacks.onHireWorker(row.id));
    this.#appendRows('Finance', snapshot.loans, (row) => {
      if (row.loanId && row.amount) this.callbacks.onRepayLoan(row.loanId, row.amount);
      else this.callbacks.onTakeLoan(row.id);
    });
    this.#appendRows('Insurance', snapshot.insurance, (row) => {
      if (row.id === 'cancel-policy') this.callbacks.onCancelInsurance();
      else this.callbacks.onBuyInsurance(row.id);
    });
  }

  #milestone(milestone: CareerMilestoneSnapshot | null): HTMLElement {
    if (!milestone) {
      return el('p', { class: 'fr-market__empty', text: 'Every estate milestone is complete.' });
    }
    const fill = el('div', { class: 'fr-objective__fill' });
    fill.style.width = `${Math.round(milestone.progress * 100)}%`;
    return el(
      'div',
      { class: `fr-career__milestone${milestone.ready ? ' fr-career__milestone--ready' : ''}` },
      el('strong', { text: milestone.title }),
      el('span', { class: 'fr-market__meta', text: `Next role: ${milestone.roleName}` }),
      el(
        'div',
        { class: 'fr-objective__track', attrs: { 'aria-label': 'Milestone progress' } },
        fill,
      ),
      ...milestone.requirements.map((requirement) =>
        el('span', { class: 'fr-career__requirement', text: requirement }),
      ),
      el('span', { class: 'fr-market__meta', text: milestone.summary }),
      button(
        milestone.ready ? 'Claim milestone' : 'Not ready',
        () => {
          this.callbacks.onClaimMilestone(milestone.id);
        },
        {
          class: 'fr-btn fr-btn--small',
          testId: `career-claim-${milestone.id}`,
          attrs: milestone.ready ? {} : { disabled: 'true' },
        },
      ),
    );
  }

  #appendRows<T extends CareerActionRow>(
    title: string,
    rows: readonly T[],
    onAction: (row: T) => void,
  ): void {
    if (rows.length === 0) return;
    this.#body.append(el('h3', { class: 'fr-panel-card__section', text: title }));
    const list = el('div', { class: 'fr-market__list' });
    for (const row of rows) {
      list.append(
        el(
          'div',
          {
            class:
              'fr-market__row fr-career__row' +
              (row.enabled ? '' : ' fr-market__row--blocked') +
              (row.selected ? ' fr-market__row--best' : ''),
          },
          uiIcon('land', '', 'fr-market__icon'),
          el(
            'div',
            { class: 'fr-market__info' },
            el('strong', { text: row.title }),
            el('span', { class: 'fr-market__meta', text: row.meta }),
          ),
          button(row.action, () => onAction(row), {
            class: 'fr-btn fr-btn--small',
            testId: `career-action-${row.id}`,
            attrs: row.enabled ? {} : { disabled: 'true' },
          }),
        ),
      );
    }
    this.#body.append(list);
  }
}
