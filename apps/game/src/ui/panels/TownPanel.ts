import type { Cents } from '@farmrise/shared';
import { button, clear, el } from '../core/dom.js';
import { uiIcon } from '../core/icons.js';
import { createEnglishLocalization, type GameLocalization } from '../i18n/gameI18n.js';
import { localizedButton, localizedText } from '../i18n/localizedDom.js';
import { timedProgress } from '../core/TimedProgress.js';

export interface TownProjectRow {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly benefit: string;
  readonly cost: Cents;
  readonly materials: string;
  readonly enabled: boolean;
}

export interface TownPanelSnapshot {
  readonly stageName: string;
  readonly population: string;
  readonly prosperity: number;
  readonly summary: string;
  readonly activeProject: {
    readonly title: string;
    readonly remainingTicks: number;
    readonly totalTicks: number;
  } | null;
  readonly projectsUnlocked: boolean;
  readonly projects: readonly TownProjectRow[];
}

export interface TownPanelCallbacks {
  readonly onStartProject: (projectId: string) => void;
  readonly onClose: () => void;
}

export class TownPanel {
  readonly root: HTMLElement;
  readonly #body: HTMLElement;
  readonly #summary: HTMLElement;
  #visible = false;
  #snapshot: TownPanelSnapshot | null = null;

  constructor(
    private readonly callbacks: TownPanelCallbacks,
    private readonly i18n: GameLocalization = createEnglishLocalization(),
  ) {
    this.#body = el('div', { class: 'fr-market__list', testId: 'town-projects' });
    this.#summary = el('p', { class: 'fr-market__summary' });
    this.root = el(
      'aside',
      {
        class: 'fr-panel-layer',
        testId: 'town-panel',
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
            uiIcon('market', '', 'fr-panel-card__icon'),
            localizedText(i18n, 'h2', 'town.title'),
          ),
          localizedButton(i18n, 'common.close', callbacks.onClose, {
            class: 'fr-btn fr-btn--ghost fr-btn--small',
            testId: 'town-close',
          }),
        ),
        this.#summary,
        localizedText(i18n, 'h3', 'town.projects', { class: 'fr-panel-card__section' }),
        this.#body,
      ),
    );
    i18n.bindAttribute(this.root, 'aria-label', 'town.dialog');
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

  update(snapshot: TownPanelSnapshot): void {
    this.#snapshot = snapshot;
    this.#summary.textContent = this.i18n.t('town.summary', {
      stage: snapshot.stageName,
      population: snapshot.population,
      prosperity: this.i18n.formatNumber(Math.floor(snapshot.prosperity)),
      summary: snapshot.summary,
    });
    clear(this.#body);
    if (!snapshot.projectsUnlocked) {
      this.#body.append(
        el('p', {
          class: 'fr-market__empty',
          text: this.i18n.t('town.locked'),
        }),
      );
      return;
    }
    if (snapshot.activeProject) {
      this.#body.append(
        el(
          'div',
          { class: 'fr-market__row fr-market__row--best' },
          uiIcon('land', '', 'fr-market__icon'),
          el(
            'div',
            { class: 'fr-market__info' },
            el('strong', { text: snapshot.activeProject.title }),
            timedProgress(
              this.i18n,
              {
                state: this.i18n.t('common.building'),
                progress:
                  1 - snapshot.activeProject.remainingTicks / snapshot.activeProject.totalTicks,
                remainingTicks: snapshot.activeProject.remainingTicks,
              },
              'town-project-wait',
            ),
          ),
          localizedButton(this.i18n, 'common.building', () => {}, {
            class: 'fr-btn fr-btn--small',
            attrs: { disabled: 'true' },
          }),
        ),
      );
    }
    if (snapshot.projects.length === 0 && !snapshot.activeProject) {
      this.#body.append(
        el('p', {
          class: 'fr-market__empty',
          text: this.i18n.t('town.noProject'),
        }),
      );
    }
    for (const project of snapshot.projects) {
      this.#body.append(
        el(
          'div',
          { class: `fr-market__row${project.enabled ? '' : ' fr-market__row--blocked'}` },
          uiIcon('land', '', 'fr-market__icon'),
          el(
            'div',
            { class: 'fr-market__info' },
            el('strong', { text: project.title }),
            el('span', {
              class: 'fr-market__meta',
              text: this.i18n.t('town.projectMeta', {
                cost: this.i18n.formatCents(project.cost),
                materials: project.materials,
                description: project.description,
                benefit: project.benefit,
              }),
            }),
          ),
          button(
            this.i18n.t(project.enabled ? 'town.fund' : 'common.unavailable'),
            () => {
              this.callbacks.onStartProject(project.id);
            },
            {
              class: 'fr-btn fr-btn--small',
              testId: `town-project-${project.id}`,
              attrs: project.enabled ? {} : { disabled: 'true' },
            },
          ),
        ),
      );
    }
  }
}
