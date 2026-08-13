/**
 * The contextual seed ledger opened from an empty crop bed.
 *
 * Selection is deliberately separate from planting: this panel answers
 * "what should I grow?", then the ordinary Work command still commits the
 * seed cost and changes the world. That keeps one authoritative planting path
 * while making the choice visual and comparable.
 */
import { ticksToSeconds, type Cents } from '@farmrise/shared';
import { clear, el } from '../core/dom.js';
import { itemIcon, uiIcon } from '../core/icons.js';
import { createEnglishLocalization, type GameLocalization } from '../i18n/gameI18n.js';
import { localizedButton, localizedText } from '../i18n/localizedDom.js';

export interface SeedOption {
  readonly cropId: string;
  readonly displayName: string;
  readonly cost: Cents;
  readonly growthTicks: number;
  readonly baseYield: number;
  readonly affordable: boolean;
  readonly selected: boolean;
}

export interface SeedSnapshot {
  readonly seasonName: string;
  readonly balance: Cents;
  readonly options: readonly SeedOption[];
}

export interface SeedPanelCallbacks {
  readonly onSelectSeed: (cropId: string) => void;
  readonly onClose: () => void;
}

export class SeedPanel {
  readonly root: HTMLElement;
  readonly #grid: HTMLElement;
  readonly #summary: HTMLElement;
  #visible = false;
  #snapshot: SeedSnapshot | null = null;
  #acceptSelectionAt = 0;

  constructor(
    private readonly callbacks: SeedPanelCallbacks,
    private readonly i18n: GameLocalization = createEnglishLocalization(),
  ) {
    this.#grid = el('div', { class: 'fr-seed-grid', testId: 'seed-options' });
    this.#summary = el('p', { class: 'fr-market__summary' });

    this.root = el(
      'aside',
      {
        class: 'fr-panel-layer fr-seed-panel',
        testId: 'seed-panel',
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
            uiIcon('wheat', '', 'fr-panel-card__icon'),
            localizedText(i18n, 'h2', 'seed.title'),
          ),
          localizedButton(i18n, 'common.close', () => this.callbacks.onClose(), {
            class: 'fr-btn fr-btn--ghost fr-btn--small',
            testId: 'seed-close',
          }),
        ),
        this.#summary,
        localizedText(i18n, 'h3', 'seed.section', { class: 'fr-panel-card__section' }),
        this.#grid,
      ),
    );
    i18n.bindAttribute(this.root, 'aria-label', 'seed.dialog');
    i18n.onChange(() => {
      if (this.#snapshot) this.update(this.#snapshot);
    });
    this.root.hidden = true;
  }

  get visible(): boolean {
    return this.#visible;
  }

  setVisible(visible: boolean): void {
    if (!visible) {
      const activeElement = this.root.ownerDocument.activeElement;
      if (activeElement instanceof HTMLElement && this.root.contains(activeElement)) {
        activeElement.blur();
      }
    }
    this.#visible = visible;
    if (visible) {
      // Touch controls emit on pointerdown so Safari cannot lose the action.
      // The opening finger may still release over the newly mounted card in
      // Chromium, so briefly reject that same gesture instead of selecting a
      // seed the player never tapped.
      this.#acceptSelectionAt = performance.now() + 250;
    }
    this.root.hidden = !visible;
  }

  update(snapshot: SeedSnapshot): void {
    this.#snapshot = snapshot;
    this.#summary.textContent = this.i18n.t('seed.summary', {
      season: snapshot.seasonName,
      balance: this.i18n.formatCents(snapshot.balance),
    });
    clear(this.#grid);

    if (snapshot.options.length === 0) {
      this.#grid.append(localizedText(this.i18n, 'p', 'seed.empty', { class: 'fr-market__empty' }));
      return;
    }

    for (const option of snapshot.options) this.#grid.append(this.#seedCard(option));
  }

  #seedCard(option: SeedOption): HTMLButtonElement {
    const card = el('button', {
      class: `fr-seed-card${option.selected ? ' fr-seed-card--selected' : ''}${
        option.affordable ? '' : ' fr-seed-card--blocked'
      }`,
      testId: `seed-option-${option.cropId}`,
      attrs: {
        type: 'button',
        'aria-pressed': String(option.selected),
        ...(option.affordable ? {} : { disabled: 'true' }),
      },
      on: {
        click: () => {
          if (performance.now() < this.#acceptSelectionAt) return;
          this.callbacks.onSelectSeed(option.cropId);
        },
      },
    });
    card.append(
      uiIcon(itemIcon(option.cropId), '', 'fr-seed-card__icon'),
      el(
        'span',
        { class: 'fr-seed-card__copy' },
        el('strong', { text: option.displayName }),
        el('span', {
          class: 'fr-seed-card__meta',
          text: this.i18n.t('seed.optionMeta', {
            cost: this.i18n.formatCents(option.cost),
            time: this.i18n.formatDurationSeconds(ticksToSeconds(option.growthTicks)),
            yield: this.i18n.formatNumber(option.baseYield),
          }),
        }),
      ),
      el('span', {
        class: 'fr-seed-card__action',
        text: this.i18n.t(
          option.selected ? 'seed.selected' : option.affordable ? 'seed.choose' : 'seed.tooCostly',
        ),
      }),
    );
    return card;
  }
}
