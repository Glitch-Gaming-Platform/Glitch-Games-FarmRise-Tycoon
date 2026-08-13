import type { Cents } from '@farmrise/shared';
import { button, clear, el } from '../core/dom.js';
import { uiIcon } from '../core/icons.js';
import { createEnglishLocalization, type GameLocalization } from '../i18n/gameI18n.js';
import { localizedButton, localizedText } from '../i18n/localizedDom.js';

export interface CareerMilestoneSnapshot {
  readonly id: string;
  readonly title: string;
  readonly nextStageName: string;
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

export interface WorkerActionRow extends CareerActionRow {
  readonly workerId?: string;
}

export interface LoanRow extends CareerActionRow {
  readonly loanId?: string;
  readonly amount?: number;
}

export interface CareerPanelSnapshot {
  readonly context?: 'processing' | 'workforce' | null;
  readonly balance: Cents;
  readonly stageName: string;
  readonly health: string;
  readonly milestone: CareerMilestoneSnapshot | null;
  readonly specializations: readonly CareerActionRow[];
  readonly processors: readonly ProcessorActionRow[];
  readonly workers: readonly WorkerActionRow[];
  readonly loans: readonly LoanRow[];
  readonly insurance: readonly CareerActionRow[];
}

export interface CareerPanelCallbacks {
  readonly onClaimMilestone: (milestoneId: string) => void;
  readonly onChooseSpecialization: (id: string) => void;
  readonly onQueueProcessing: (buildingId: string, recipeId: string) => void;
  readonly onHireWorker: (role: string) => void;
  readonly onPrioritizeWorker: (workerId: string) => void;
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
  #snapshot: CareerPanelSnapshot | null = null;

  constructor(
    private readonly callbacks: CareerPanelCallbacks,
    private readonly i18n: GameLocalization = createEnglishLocalization(),
  ) {
    this.#body = el('div', { class: 'fr-career__body', testId: 'career-options' });
    this.#summary = el('p', { class: 'fr-market__summary' });
    this.root = el(
      'aside',
      {
        class: 'fr-panel-layer',
        testId: 'career-panel',
        attrs: { role: 'dialog' },
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
            localizedText(i18n, 'h2', 'career.title'),
          ),
          localizedButton(i18n, 'common.close', callbacks.onClose, {
            class: 'fr-btn fr-btn--ghost fr-btn--small',
            testId: 'career-close',
          }),
        ),
        this.#summary,
        this.#body,
      ),
    );
    i18n.bindAttribute(this.root, 'aria-label', 'career.dialog');
    i18n.onChange(() => {
      if (this.#snapshot) this.update(this.#snapshot);
    });
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
    this.#snapshot = snapshot;
    this.#summary.textContent = this.i18n.t('career.summary', {
      stage: snapshot.stageName,
      health: snapshot.health,
      balance: this.i18n.formatCents(snapshot.balance),
    });
    clear(this.#body);

    if (!snapshot.context) {
      this.#body.append(
        localizedText(this.i18n, 'h3', 'career.currentMilestone', {
          class: 'fr-panel-card__section',
        }),
      );
      this.#body.append(this.#milestone(snapshot.milestone));
      this.#appendRows('career.specialization', snapshot.specializations, (row) =>
        this.callbacks.onChooseSpecialization(row.id),
      );
    }
    if (snapshot.context !== 'workforce') {
      this.#appendRows('career.processing', snapshot.processors, (row) =>
        this.callbacks.onQueueProcessing(row.buildingId, row.recipeId),
      );
    }
    if (snapshot.context !== 'processing') {
      this.#appendRows('career.workers', snapshot.workers, (row) => {
        if (row.workerId) this.callbacks.onPrioritizeWorker(row.workerId);
        else this.callbacks.onHireWorker(row.id);
      });
    }
    if (!snapshot.context) {
      this.#appendRows('career.finance', snapshot.loans, (row) => {
        if (row.loanId && row.amount) this.callbacks.onRepayLoan(row.loanId, row.amount);
        else this.callbacks.onTakeLoan(row.id);
      });
      this.#appendRows('career.insurance', snapshot.insurance, (row) => {
        if (row.id === 'cancel-policy') this.callbacks.onCancelInsurance();
        else this.callbacks.onBuyInsurance(row.id);
      });
    }
  }

  #milestone(milestone: CareerMilestoneSnapshot | null): HTMLElement {
    if (!milestone) {
      return localizedText(this.i18n, 'p', 'career.complete', { class: 'fr-market__empty' });
    }
    const fill = el('div', { class: 'fr-objective__fill' });
    fill.style.width = `${Math.round(milestone.progress * 100)}%`;
    const card = el(
      'div',
      { class: `fr-career__milestone${milestone.ready ? ' fr-career__milestone--ready' : ''}` },
      el('strong', { text: milestone.title }),
      el('span', {
        class: 'fr-career__next-stage',
        text: this.i18n.t('career.nextStage', { stage: milestone.nextStageName }),
        testId: 'career-next-stage',
      }),
      el('div', { class: 'fr-objective__track' }, fill),
      el('p', {
        class: 'fr-career__requirements-intro',
        text: this.i18n.t('career.advanceRequirements', { stage: milestone.nextStageName }),
      }),
      el(
        'ul',
        { class: 'fr-career__requirements', testId: 'career-requirements' },
        ...milestone.requirements.map((requirement) =>
          el('li', { class: 'fr-career__requirement', text: requirement }),
        ),
      ),
      el('span', { class: 'fr-market__meta', text: milestone.summary }),
      button(
        milestone.ready
          ? this.i18n.t('career.advance', { stage: milestone.nextStageName })
          : this.i18n.t('career.notReady'),
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
    this.i18n.bindAttribute(
      card.querySelector<HTMLElement>('.fr-objective__track')!,
      'aria-label',
      'career.milestoneProgress',
    );
    return card;
  }

  #appendRows<T extends CareerActionRow>(
    titleKey: string,
    rows: readonly T[],
    onAction: (row: T) => void,
  ): void {
    if (rows.length === 0) return;
    this.#body.append(
      localizedText(this.i18n, 'h3', titleKey, { class: 'fr-panel-card__section' }),
    );
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
