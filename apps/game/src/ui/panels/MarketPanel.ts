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
import { formatCents, formatTicks, type Cents } from '@farmrise/shared';
import { button, clear, el } from '../core/dom.js';
import { itemIcon, uiIcon } from '../core/icons.js';
import type { InventoryRow } from '@game/items/InventoryView.js';

export interface ContractRow {
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
  readonly contracts: readonly ContractRow[];
  readonly storageUsed: number;
  readonly storageCapacity: number;
}

export interface MarketPanelCallbacks {
  readonly onSellSpot: (itemId: string, quantity: number) => void;
  readonly onFulfil: (orderId: string) => void;
  readonly onClose: () => void;
}

export class MarketPanel {
  readonly root: HTMLElement;
  readonly #contracts: HTMLElement;
  readonly #inventory: HTMLElement;
  readonly #summary: HTMLElement;
  #visible = false;

  constructor(private readonly callbacks: MarketPanelCallbacks) {
    this.#contracts = el('div', { class: 'fr-market__list', testId: 'market-contracts' });
    this.#inventory = el('div', { class: 'fr-market__list', testId: 'market-inventory' });
    this.#summary = el('p', { class: 'fr-market__summary' });

    this.root = el(
      'aside',
      {
        class: 'fr-panel-layer',
        testId: 'market-panel',
        attrs: { role: 'dialog', 'aria-label': 'Market' },
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
            el('h2', { text: 'Millbrook Grocers' }),
          ),
          button('Close', () => this.callbacks.onClose(), {
            class: 'fr-btn fr-btn--ghost fr-btn--small',
            testId: 'market-close',
          }),
        ),
        this.#summary,
        el('h3', { class: 'fr-panel-card__section', text: 'Sell now' }),
        this.#inventory,
        el('h3', { class: 'fr-panel-card__section', text: 'Contracts' }),
        this.#contracts,
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

  update(snapshot: MarketSnapshot): void {
    this.#summary.textContent =
      `${formatCents(snapshot.balance)} in hand  ·  ` +
      `storage ${snapshot.storageUsed}/${snapshot.storageCapacity}`;

    clear(this.#contracts);
    if (snapshot.contracts.length === 0) {
      this.#contracts.append(
        el('p', { class: 'fr-market__empty', text: 'No contracts posted right now.' }),
      );
    }
    for (const contract of snapshot.contracts) {
      this.#contracts.append(this.#contractRow(contract));
    }

    clear(this.#inventory);
    if (snapshot.rows.length === 0) {
      this.#inventory.append(
        el('p', {
          class: 'fr-market__empty',
          text: 'Nothing harvested yet. Grow something first.',
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
        el('strong', { text: `${contract.quantity} × ${contract.displayName}` }),
        el('span', {
          class: 'fr-market__meta',
          text:
            `${formatCents(contract.payout)}  ` +
            `(+${premium}% over spot)  ·  ${formatTicks(contract.ticksRemaining)} left  ·  ` +
            `you hold ${contract.held}`,
        }),
      ),
      button(
        contract.canFulfil ? 'Fulfil' : `Need ${contract.quantity - contract.held} more`,
        () => this.callbacks.onFulfil(contract.orderId),
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
        el('strong', { text: `${row.quantity} × ${row.displayName}` }),
        el('span', {
          class: 'fr-market__meta',
          text: `${formatCents(row.unitPrice)} each  ·  ${row.formattedTotal} for all`,
        }),
      ),
      el(
        'div',
        { class: 'fr-market__actions' },
        button('Sell 1', () => this.callbacks.onSellSpot(row.itemId, 1), {
          class: 'fr-btn fr-btn--small fr-btn--ghost',
          testId: `market-sell-one-${row.itemId}`,
        }),
        button('Sell all', () => this.callbacks.onSellSpot(row.itemId, row.quantity), {
          class: 'fr-btn fr-btn--small',
          testId: `market-sell-all-${row.itemId}`,
        }),
      ),
    );
  }
}
