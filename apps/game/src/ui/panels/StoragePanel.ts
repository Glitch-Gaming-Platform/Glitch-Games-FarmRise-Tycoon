import { button, clear, el } from '../core/dom.js';
import { itemIcon, uiIcon } from '../core/icons.js';
import { createEnglishLocalization, type GameLocalization } from '../i18n/gameI18n.js';
import { localizedButton } from '../i18n/localizedDom.js';

export interface StorageRow {
  readonly itemId: string;
  readonly displayName: string;
  readonly quantity: number;
  readonly takeQuantity: number;
}

export interface StorageSnapshot {
  readonly title: string;
  readonly used: number;
  readonly capacity: number;
  readonly carryFree: number;
  readonly rows: readonly StorageRow[];
}

export interface StoragePanelCallbacks {
  readonly onTake: (itemId: string, quantity: number) => void;
  readonly onClose: () => void;
}

/** A deliberately small contextual inventory for storage buildings. */
export class StoragePanel {
  readonly root: HTMLElement;
  readonly #title: HTMLElement;
  readonly #summary: HTMLElement;
  readonly #list: HTMLElement;
  #visible = false;
  #snapshot: StorageSnapshot | null = null;

  constructor(
    private readonly callbacks: StoragePanelCallbacks,
    private readonly i18n: GameLocalization = createEnglishLocalization(),
  ) {
    this.#title = el('h2', { text: 'Storage' });
    this.#summary = el('p', { class: 'fr-market__summary' });
    this.#list = el('div', { class: 'fr-market__list', testId: 'storage-options' });
    this.root = el(
      'aside',
      {
        class: 'fr-panel-layer',
        testId: 'storage-panel',
        attrs: { role: 'dialog', 'aria-label': 'Storage' },
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
            uiIcon('barn', '', 'fr-panel-card__icon'),
            this.#title,
          ),
          localizedButton(i18n, 'common.close', callbacks.onClose, {
            class: 'fr-btn fr-btn--ghost fr-btn--small',
            testId: 'storage-close',
          }),
        ),
        this.#summary,
        this.#list,
      ),
    );
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

  update(snapshot: StorageSnapshot): void {
    this.#snapshot = snapshot;
    this.#title.textContent = snapshot.title;
    this.#summary.textContent = `${this.i18n.formatNumber(snapshot.used)}/${this.i18n.formatNumber(
      snapshot.capacity,
    )} storage used · ${this.i18n.formatNumber(snapshot.carryFree)} carrying space free`;
    clear(this.#list);

    if (snapshot.rows.length === 0) {
      this.#list.append(
        el('p', {
          class: 'fr-market__empty',
          text: 'This building is empty. Carry goods here and use Work to store them.',
        }),
      );
      return;
    }

    for (const row of snapshot.rows) {
      const enabled = row.takeQuantity > 0;
      this.#list.append(
        el(
          'div',
          {
            class: `fr-market__row${enabled ? '' : ' fr-market__row--blocked'}`,
            testId: `storage-row-${row.itemId}`,
          },
          uiIcon(itemIcon(row.itemId), '', 'fr-market__icon'),
          el(
            'div',
            { class: 'fr-market__info' },
            el('strong', { text: row.displayName }),
            el('span', {
              class: 'fr-market__meta',
              text: `${this.i18n.formatNumber(row.quantity)} stored`,
            }),
          ),
          button(
            enabled ? `Take ${this.i18n.formatNumber(row.takeQuantity)}` : 'Carrier full',
            () => {
              this.callbacks.onTake(row.itemId, row.takeQuantity);
            },
            {
              class: 'fr-btn fr-btn--small',
              testId: `storage-take-${row.itemId}`,
              attrs: enabled ? {} : { disabled: 'true' },
            },
          ),
        ),
      );
    }
  }
}
