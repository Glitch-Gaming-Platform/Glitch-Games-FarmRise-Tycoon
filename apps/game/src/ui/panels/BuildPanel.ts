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
  formatTicks,
  getItem,
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

export interface LandOption {
  readonly parcelId: string;
  readonly displayName: string;
  readonly cost: Cents;
  readonly bedCount: number;
  readonly description: string;
  readonly affordable: boolean;
  readonly available: boolean;
  readonly progress: number;
  readonly requirement: string | null;
}

export interface BuildSnapshot {
  readonly balance: Cents;
  readonly options: readonly BuildOption[];
  readonly animals: readonly AnimalOption[];
  readonly shelterFree: number;
  readonly land: readonly LandOption[];
  readonly carriers: readonly CarrierOption[];
}

export interface BuildPanelCallbacks {
  readonly onSelectBuilding: (kind: BuildingKind) => void;
  readonly onBuyAnimal: (species: AnimalSpecies) => void;
  readonly onBuyLand: (parcelId: string) => void;
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
      const animalName = option.species === 'chicken' ? 'hen' : 'cow';
      const feedName = getItem(definition.feedItemId)?.displayName ?? definition.feedItemId;
      const productName =
        getItem(definition.producesItemId)?.displayName ?? definition.producesItemId;
      this.#list.append(
        this.#row({
          testId: `build-animal-${option.species}`,
          icon: option.species === 'chicken' ? 'chicken' : 'cow',
          title: definition.displayName,
          meta:
            `${formatCents(definition.purchaseCost)}  ·  Each ${animalName} needs ` +
            `${definition.feedPerCycle} stored ${feedName} every ${formatTicks(definition.cycleTicks)} ` +
            `to make ${definition.producePerCycle} ${productName}. Collect the ${productName} ` +
            `by the shelter, then sell them at Market. ` +
            `${snapshot.shelterFree} shelter space free`,
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

    // Land, listed last and visually distinct. Starter Extension deliberately
    // appears immediately above North Field so onboarding and the long-term
    // objective remain visible together.
    this.#list.append(el('h3', { class: 'fr-panel-card__section', text: 'Expand' }));
    if (snapshot.land.length === 0) {
      this.#list.append(el('p', { class: 'fr-market__empty', text: 'You own every field.' }));
    }
    for (const parcel of snapshot.land) {
      const progress = Math.round(parcel.progress * 100);
      this.#list.append(
        this.#row({
          testId: `build-land-${parcel.parcelId}`,
          rowTestId: `build-land-row-${parcel.parcelId}`,
          icon: 'land',
          title: parcel.displayName,
          meta:
            `${formatCents(parcel.cost)}  ·  ${parcel.bedCount} crop beds  ·  ` +
            (parcel.available
              ? `${progress}% saved  ·  ${parcel.description}`
              : (parcel.requirement ?? 'Not available yet')),
          action: parcel.available ? (parcel.affordable ? 'Buy land' : `${progress}%`) : 'Locked',
          enabled: parcel.affordable && parcel.available,
          onClick: () => this.callbacks.onBuyLand(parcel.parcelId),
          highlight: parcel.affordable && parcel.available,
        }),
      );
    }
  }

  #row(config: {
    testId: string;
    rowTestId?: string;
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
        testId: config.rowTestId,
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
