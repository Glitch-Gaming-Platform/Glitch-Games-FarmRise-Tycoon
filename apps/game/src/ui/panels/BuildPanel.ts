/**
 * The reinvest panel: step 7 of the core loop.
 *
 * The design pillar is "Meaningful Reinvestment - money must always present a
 * choice between increasing output, reducing labour, protecting assets, or
 * saving toward new land." So the panel shows all five options together, with
 * prices, and never hides the ones the player cannot yet afford. Seeing that
 * the land parcel costs more than everything else is how a player learns to
 * save for it.
 */
import {
  ANIMALS,
  BUILDINGS,
  CARRIERS,
  formatCents,
  type AnimalSpecies,
  type BuildingKind,
  type CarrierKind,
  type Cents,
} from '@farmrise/shared';
import { button, clear, el } from '../core/dom.js';
import { uiIcon, type UiIconId } from '../core/icons.js';

export interface BuildOption {
  readonly kind: BuildingKind;
  readonly cost: Cents;
  readonly affordable: boolean;
}

export interface AnimalOption {
  readonly species: AnimalSpecies;
  readonly affordable: boolean;
  readonly shelterRequired: number;
}

export interface CarrierOption {
  readonly kind: Exclude<CarrierKind, 'arms'>;
  readonly affordable: boolean;
}

export interface BuildSnapshot {
  readonly balance: Cents;
  readonly options: readonly BuildOption[];
  readonly animals: readonly AnimalOption[];
  readonly shelterFree: number;
  readonly landCost: Cents;
  readonly canAffordLand: boolean;
  readonly landAvailable: boolean;
  readonly landProgress: number;
  /** Name of the parcel currently for sale, so the row says what it is buying. */
  readonly landName: string | null;
  readonly carriers: readonly CarrierOption[];
}

export interface BuildPanelCallbacks {
  readonly onSelectBuilding: (kind: BuildingKind) => void;
  readonly onBuyAnimal: (species: AnimalSpecies) => void;
  readonly onBuyLand: () => void;
  readonly onBuyCarrier: (kind: Exclude<CarrierKind, 'arms'>) => void;
  readonly onClose: () => void;
}

export class BuildPanel {
  readonly root: HTMLElement;
  readonly #list: HTMLElement;
  readonly #summary: HTMLElement;
  #visible = false;

  constructor(private readonly callbacks: BuildPanelCallbacks) {
    this.#list = el('div', { class: 'fr-market__list', testId: 'build-options' });
    this.#summary = el('p', { class: 'fr-market__summary' });

    this.root = el(
      'aside',
      {
        class: 'fr-panel-layer',
        testId: 'build-panel',
        attrs: { role: 'dialog', 'aria-label': 'Build and reinvest' },
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
            el('h2', { text: 'Build & Reinvest' }),
          ),
          button('Close', () => this.callbacks.onClose(), {
            class: 'fr-btn fr-btn--ghost fr-btn--small',
            testId: 'build-close',
          }),
        ),
        this.#summary,
        el('h3', { class: 'fr-panel-card__section', text: 'Build' }),
        this.#list,
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

  update(snapshot: BuildSnapshot): void {
    this.#summary.textContent = `${formatCents(snapshot.balance)} in hand`;
    clear(this.#list);

    for (const option of snapshot.options) {
      const definition = BUILDINGS[option.kind];
      this.#list.append(
        this.#row({
          testId: `build-${option.kind}`,
          icon: buildIcon(option.kind),
          title: definition.displayName,
          meta: `${formatCents(option.cost)}  ·  ${definition.description}`,
          action: option.affordable ? 'Place' : 'Too costly',
          enabled: option.affordable,
          onClick: () => this.callbacks.onSelectBuilding(option.kind),
        }),
      );
    }

    if (snapshot.animals.length > 0) {
      this.#list.append(el('h3', { class: 'fr-panel-card__section', text: 'Livestock' }));
    }
    for (const option of snapshot.animals) {
      const definition = ANIMALS[option.species];
      const hasShelter = snapshot.shelterFree >= option.shelterRequired;
      this.#list.append(
        this.#row({
          testId: `build-animal-${option.species}`,
          icon: option.species === 'chicken' ? 'chicken' : 'cow',
          title: definition.displayName,
          meta:
            `${formatCents(definition.purchaseCost)}  ·  ${definition.feedPerCycle} ` +
            `${definition.feedItemId} per cycle → ${definition.producePerCycle} ` +
            `${definition.producesItemId}  ·  ${snapshot.shelterFree} shelter space free`,
          action: option.affordable && hasShelter ? 'Buy' : 'Unavailable',
          enabled: option.affordable && hasShelter,
          onClick: () => this.callbacks.onBuyAnimal(option.species),
        }),
      );
    }

    if (snapshot.carriers.length > 0) {
      this.#list.append(el('h3', { class: 'fr-panel-card__section', text: 'Hauling' }));
    }
    for (const option of snapshot.carriers) {
      const definition = CARRIERS[option.kind];
      this.#list.append(
        this.#row({
          testId: `build-carrier-${option.kind}`,
          icon: 'land',
          title: definition.displayName,
          meta:
            `${formatCents(definition.purchaseCost)}  ·  ${definition.capacity} capacity. ` +
            definition.description,
          action: option.affordable ? 'Buy' : 'Too costly',
          enabled: option.affordable,
          onClick: () => this.callbacks.onBuyCarrier(option.kind),
        }),
      );
    }

    // Land, listed last and visually distinct. It is the row that changes the
    // shape of the farm rather than what stands on it, so it reads as a
    // destination rather than as another purchase.
    const progress = Math.round(snapshot.landProgress * 100);
    this.#list.append(el('h3', { class: 'fr-panel-card__section', text: 'Expand' }));
    this.#list.append(
      this.#row({
        testId: 'build-land',
        icon: 'land',
        title: snapshot.landName ?? 'Neighbouring parcel',
        meta: snapshot.landAvailable
          ? `${formatCents(snapshot.landCost)}  ·  ${progress}% saved  ·  Opens the gate`
          : 'You own every field on the estate.',
        action: snapshot.canAffordLand ? 'Buy land' : `${progress}%`,
        enabled: snapshot.canAffordLand && snapshot.landAvailable,
        onClick: () => this.callbacks.onBuyLand(),
        highlight: snapshot.canAffordLand && snapshot.landAvailable,
      }),
    );
  }

  #row(config: {
    testId: string;
    icon: UiIconId;
    title: string;
    meta: string;
    action: string;
    enabled: boolean;
    onClick: () => void;
    highlight?: boolean;
  }): HTMLElement {
    return el(
      'div',
      {
        class:
          'fr-market__row' +
          (config.enabled ? '' : ' fr-market__row--blocked') +
          (config.highlight ? ' fr-market__row--best' : ''),
      },
      uiIcon(config.icon, '', 'fr-market__icon'),
      el(
        'div',
        { class: 'fr-market__info' },
        el('strong', { text: config.title }),
        el('span', { class: 'fr-market__meta', text: config.meta }),
      ),
      button(config.action, config.onClick, {
        class: 'fr-btn fr-btn--small',
        testId: config.testId,
        attrs: config.enabled ? {} : { disabled: 'true' },
      }),
    );
  }
}

/**
 * Icon for a build option.
 *
 * Every shipped building has matching interface art. The land fallback keeps
 * a newly registered kind usable until the next deterministic icon render.
 */
function buildIcon(kind: BuildingKind): UiIconId {
  const icons: Readonly<Partial<Record<BuildingKind, UiIconId>>> = {
    barn: 'barn',
    irrigation: 'irrigation',
    road: 'road',
    fence: 'fence',
    loading_pad: 'loadingPad',
    cold_store: 'coldStore',
    worker_hut: 'workerHut',
    well: 'well',
    mill: 'mill',
    creamery: 'creamery',
    preserve_kitchen: 'preserveKitchen',
  };
  return icons[kind] ?? 'land';
}
