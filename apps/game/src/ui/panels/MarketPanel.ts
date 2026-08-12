/**
 * The market panel: where the player turns goods into money.
 *
 * This is step 6 of the core loop and it was the single missing piece of the
 * game - every other step existed, and the loop stopped dead at the point of
 * sale. It exists to present exactly one decision, as clearly as possible:
 *
 *   sell now at spot, or hold for a contract that pays more but commits you
 *   to a quantity and a deadline.
 *
 * A harvested item always appears first with an enabled Sell button. Contracts
 * follow and show their premium over spot as a percentage. This keeps the
 * first sale discoverable without hiding the longer-term trade-off.
 */
import { ticksToSeconds, type Cents } from '@farmrise/shared';
import { button, clear, el } from '../core/dom.js';
import { itemIcon, uiIcon } from '../core/icons.js';
import type { InventoryRow } from '@game/items/InventoryView.js';
import { createEnglishLocalization, type GameLocalization } from '../i18n/gameI18n.js';
import { localizedButton, localizedText } from '../i18n/localizedDom.js';

export interface ContractRow {
  readonly action: 'accept' | 'deliver';
  readonly orderId: string;
  readonly itemId: string;
  readonly displayName: string;
  readonly quantity: number;
  readonly payout: Cents;
  readonly spotValue: Cents;
  readonly premiumPercent: number;
  readonly ticksRemaining: number;
  readonly held: number;
  readonly canFulfil: boolean;
}

export interface MarketSnapshot {
  readonly balance: Cents;
  readonly rows: readonly InventoryRow[];
  readonly contractsUnlocked: boolean;
  readonly contracts: readonly ContractRow[];
  readonly storageUsed: number;
  readonly storageCapacity: number;
}

export interface MarketPanelCallbacks {
  readonly onSellSpot: (itemId: string, quantity: number) => void;
  /**
   * Takes an offer, or delivers against a promise already made. One callback
   * because from the player's side both are "yes, that one".
   */
  readonly onFulfil: (orderId: string, action: ContractRow['action']) => void;
  readonly onClose: () => void;
}

export class MarketPanel {
  readonly root: HTMLElement;
  readonly #contracts: HTMLElement;
  readonly #contractsHeading: HTMLElement;
  readonly #inventory: HTMLElement;
  readonly #summary: HTMLElement;
  #visible = false;
  #snapshot: MarketSnapshot | null = null;

  constructor(
    private readonly callbacks: MarketPanelCallbacks,
    private readonly i18n: GameLocalization = createEnglishLocalization(),
  ) {
    this.#contracts = el('div', { class: 'fr-market__list', testId: 'market-contracts' });
    this.#contractsHeading = el('h3', {
      class: 'fr-panel-card__section',
      testId: 'market-contracts-heading',
    });
    i18n.bindText(this.#contractsHeading, 'market.contracts');
    this.#inventory = el('div', { class: 'fr-market__list', testId: 'market-inventory' });
    this.#summary = el('p', { class: 'fr-market__summary' });

    this.root = el(
      'aside',
      {
        class: 'fr-panel-layer',
        testId: 'market-panel',
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
            localizedText(i18n, 'h2', 'market.title'),
          ),
          localizedButton(i18n, 'common.close', () => this.callbacks.onClose(), {
            class: 'fr-btn fr-btn--ghost fr-btn--small',
            testId: 'market-close',
          }),
        ),
        this.#summary,
        localizedText(i18n, 'h3', 'market.sellNow', { class: 'fr-panel-card__section' }),
        this.#inventory,
        this.#contractsHeading,
        this.#contracts,
      ),
    );
    i18n.bindAttribute(this.root, 'aria-label', 'market.dialog');
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

  update(snapshot: MarketSnapshot): void {
    this.#snapshot = snapshot;
    this.#summary.textContent = this.i18n.t('market.summary', {
      balance: this.i18n.formatCents(snapshot.balance),
      used: this.i18n.formatNumber(snapshot.storageUsed),
      capacity: this.i18n.formatNumber(snapshot.storageCapacity),
    });

    this.#contractsHeading.hidden = !snapshot.contractsUnlocked;
    this.#contracts.hidden = !snapshot.contractsUnlocked;
    clear(this.#contracts);
    if (snapshot.contractsUnlocked) {
      if (snapshot.contracts.length === 0) {
        this.#contracts.append(
          localizedText(this.i18n, 'p', 'market.noContracts', { class: 'fr-market__empty' }),
        );
      }
      for (const contract of snapshot.contracts) {
        this.#contracts.append(this.#contractRow(contract));
      }
    }

    clear(this.#inventory);
    if (snapshot.rows.length === 0) {
      this.#inventory.append(
        el('p', {
          class: 'fr-market__empty',
          text: this.i18n.t('market.empty'),
        }),
      );
    }
    for (const row of snapshot.rows) {
      this.#inventory.append(this.#inventoryRow(row));
    }
  }

  #contractRow(contract: ContractRow): HTMLElement {
    const premium = Math.round(contract.premiumPercent * 100);
    return el(
      'div',
      { class: `fr-market__row${contract.canFulfil ? '' : ' fr-market__row--blocked'}` },
      uiIcon(itemIcon(contract.itemId), '', 'fr-market__icon'),
      el(
        'div',
        { class: 'fr-market__info' },
        el('strong', {
          text: `${this.i18n.formatNumber(contract.quantity)} × ${contract.displayName}`,
        }),
        el('span', {
          class: 'fr-market__meta',
          text: this.i18n.t('market.contractMeta', {
            payout: this.i18n.formatCents(contract.payout),
            premium: this.i18n.formatNumber(premium),
            time: this.i18n.formatDurationSeconds(ticksToSeconds(contract.ticksRemaining)),
            held: this.i18n.formatNumber(contract.held),
          }),
        }),
      ),
      button(
        contract.action === 'accept'
          ? this.i18n.t('market.accept')
          : contract.canFulfil
            ? this.i18n.t('market.deliver', {
                quantity: this.i18n.formatNumber(Math.min(contract.held, contract.quantity)),
              })
            : this.i18n.t('market.needMore', {
                quantity: this.i18n.formatNumber(contract.quantity - contract.held),
              }),
        () => this.callbacks.onFulfil(contract.orderId, contract.action),
        {
          class: 'fr-btn fr-btn--small',
          testId: `market-fulfil-${contract.itemId}`,
          attrs: contract.canFulfil ? {} : { disabled: 'true' },
        },
      ),
    );
  }

  #inventoryRow(row: InventoryRow): HTMLElement {
    // Two buttons, not a quantity stepper. A stepper is more flexible and
    // slower, and the decision that matters here is "spot or contract", not
    // "how many exactly".
    return el(
      'div',
      { class: 'fr-market__row' },
      uiIcon(itemIcon(row.itemId), '', 'fr-market__icon'),
      el(
        'div',
        { class: 'fr-market__info' },
        el('strong', { text: `${this.i18n.formatNumber(row.quantity)} × ${row.displayName}` }),
        el('span', {
          class: 'fr-market__meta',
          text: this.i18n.t('market.itemMeta', {
            price: this.i18n.formatCents(row.unitPrice),
            total: this.i18n.formatCents(row.totalValue),
          }),
        }),
      ),
      el(
        'div',
        { class: 'fr-market__actions' },
        localizedButton(
          this.i18n,
          'market.sellOne',
          () => this.callbacks.onSellSpot(row.itemId, 1),
          {
            class: 'fr-btn fr-btn--small fr-btn--ghost',
            testId: `market-sell-one-${row.itemId}`,
          },
        ),
        localizedButton(
          this.i18n,
          'market.sellAll',
          () => this.callbacks.onSellSpot(row.itemId, row.quantity),
          {
            class: 'fr-btn fr-btn--small',
            testId: `market-sell-all-${row.itemId}`,
          },
        ),
      ),
    );
  }
}
