import { formatCents, formatTicks, type Cents } from '@farmrise/shared';
import { button, clear, el } from '../core/dom.js';
import { uiIcon } from '../core/icons.js';

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
  readonly activeProject: { readonly title: string; readonly remainingTicks: number } | null;
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

  constructor(private readonly callbacks: TownPanelCallbacks) {
    this.#body = el('div', { class: 'fr-market__list', testId: 'town-projects' });
    this.#summary = el('p', { class: 'fr-market__summary' });
    this.root = el(
      'aside',
      {
        class: 'fr-panel-layer',
        testId: 'town-panel',
        attrs: { role: 'dialog', 'aria-label': 'Millbrook town' },
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
            el('h2', { text: 'Millbrook' }),
          ),
          button('Close', callbacks.onClose, {
            class: 'fr-btn fr-btn--ghost fr-btn--small',
            testId: 'town-close',
          }),
        ),
        this.#summary,
        el('h3', { class: 'fr-panel-card__section', text: 'Community projects' }),
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

  update(snapshot: TownPanelSnapshot): void {
    this.#summary.textContent =
      `${snapshot.stageName}  ·  ${snapshot.population} people  ·  ` +
      `${Math.floor(snapshot.prosperity)} prosperity. ${snapshot.summary}`;
    clear(this.#body);
    if (!snapshot.projectsUnlocked) {
      this.#body.append(
        el('p', {
          class: 'fr-market__empty',
          text: 'Keep supplying Millbrook. The council will invite established producers to fund projects later.',
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
            el('span', {
              class: 'fr-market__meta',
              text: `${formatTicks(snapshot.activeProject.remainingTicks)} remaining`,
            }),
          ),
          button('Building', () => {}, {
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
          text: 'No project is ready for funding. Deliver more contracts to grow the town.',
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
              text:
                `${formatCents(project.cost)} + ${project.materials}. ` +
                `${project.description} ${project.benefit}`,
            }),
          ),
          button(
            project.enabled ? 'Fund' : 'Unavailable',
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
