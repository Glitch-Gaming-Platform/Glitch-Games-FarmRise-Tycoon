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
  getItem,
  isGuardianAnimal,
  ticksToSeconds,
  type AnimalSpecies,
  type BuildingKind,
  type CarrierKind,
  type Cents,
} from '@farmrise/shared';
import { button, clear, el } from '../core/dom.js';
import { uiIcon, type UiIconId } from '../core/icons.js';
import { createEnglishLocalization, type GameLocalization } from '../i18n/gameI18n.js';
import { localizedButton, localizedText } from '../i18n/localizedDom.js';
import {
  animalName as localizedAnimalName,
  buildingName,
  domainText,
  itemName,
} from '../i18n/domainText.js';

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
  readonly context?: 'livestock' | null;
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
  #snapshot: BuildSnapshot | null = null;

  constructor(
    private readonly callbacks: BuildPanelCallbacks,
    private readonly i18n: GameLocalization = createEnglishLocalization(),
  ) {
    this.#list = el('div', { class: 'fr-market__list', testId: 'build-options' });
    this.#summary = el('p', { class: 'fr-market__summary' });

    this.root = el(
      'aside',
      {
        class: 'fr-panel-layer',
        testId: 'build-panel',
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
            uiIcon('barn', '', 'fr-panel-card__icon'),
            localizedText(i18n, 'h2', 'build.title'),
          ),
          localizedButton(i18n, 'common.close', () => this.callbacks.onClose(), {
            class: 'fr-btn fr-btn--ghost fr-btn--small',
            testId: 'build-close',
          }),
        ),
        this.#summary,
        localizedText(i18n, 'h3', 'build.section', { class: 'fr-panel-card__section' }),
        this.#list,
      ),
    );
    i18n.bindAttribute(this.root, 'aria-label', 'build.dialog');
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
    this.root.hidden = !visible;
  }

  update(snapshot: BuildSnapshot): void {
    this.#snapshot = snapshot;
    this.#summary.textContent = this.i18n.t('build.summary', {
      balance: this.i18n.formatCents(snapshot.balance),
    });
    clear(this.#list);

    for (const option of snapshot.context === 'livestock' ? [] : snapshot.options) {
      const definition = BUILDINGS[option.kind];
      this.#list.append(
        this.#row({
          testId: `build-${option.kind}`,
          rowTestId: `build-row-${option.kind}`,
          icon: buildIcon(option.kind),
          title: buildingName(this.i18n, option.kind, definition.displayName),
          meta: `${this.i18n.formatCents(option.cost)}  ·  ${domainText(
            this.i18n,
            'building',
            option.kind,
            'description',
            definition.description,
          )}`,
          action: this.i18n.t(option.affordable ? 'build.place' : 'build.tooCostly'),
          enabled: option.affordable,
          onClick: () => this.callbacks.onSelectBuilding(option.kind),
        }),
      );
    }

    if (snapshot.animals.length > 0) {
      this.#list.append(
        localizedText(this.i18n, 'h3', 'build.livestock', { class: 'fr-panel-card__section' }),
      );
    }
    for (const option of snapshot.animals) {
      const definition = ANIMALS[option.species];
      const hasShelter = snapshot.shelterFree >= option.shelterRequired;
      const animal = localizedAnimalName(this.i18n, option.species, definition.displayName);
      const meta = isGuardianAnimal(definition)
        ? this.i18n.t('build.guardianMeta', {
            cost: this.i18n.formatCents(definition.purchaseCost),
            foxes: this.i18n.formatNumber(definition.foxesDeterredPerRaid),
            free: this.i18n.formatNumber(snapshot.shelterFree),
          })
        : (() => {
            const feedDefinition = getItem(definition.feedItemId);
            const productDefinition = getItem(definition.producesItemId);
            const feedName = itemName(
              this.i18n,
              definition.feedItemId,
              feedDefinition?.displayName ?? definition.feedItemId,
            );
            const productName = itemName(
              this.i18n,
              definition.producesItemId,
              productDefinition?.displayName ?? definition.producesItemId,
            );
            return this.i18n.t('build.animalMeta', {
              cost: this.i18n.formatCents(definition.purchaseCost),
              animal,
              feedQuantity: this.i18n.formatNumber(definition.feedPerCycle),
              feed: feedName,
              time: this.i18n.formatDurationSeconds(ticksToSeconds(definition.cycleTicks)),
              produceQuantity: this.i18n.formatNumber(definition.producePerCycle),
              product: productName,
              free: this.i18n.formatNumber(snapshot.shelterFree),
            });
          })();
      this.#list.append(
        this.#row({
          testId: `build-animal-${option.species}`,
          rowTestId: `build-animal-row-${option.species}`,
          icon:
            option.species === 'chicken'
              ? 'chicken'
              : option.species === 'sheep'
                ? 'sheep'
                : option.species === 'dog'
                  ? 'dog'
                  : 'cow',
          title: animal,
          meta,
          action: this.i18n.t(option.affordable && hasShelter ? 'build.buy' : 'common.unavailable'),
          enabled: option.affordable && hasShelter,
          onClick: () => this.callbacks.onBuyAnimal(option.species),
        }),
      );
    }

    if (!snapshot.context && snapshot.carriers.length > 0) {
      this.#list.append(
        localizedText(this.i18n, 'h3', 'build.hauling', { class: 'fr-panel-card__section' }),
      );
    }
    for (const option of snapshot.context ? [] : snapshot.carriers) {
      const definition = CARRIERS[option.kind];
      this.#list.append(
        this.#row({
          testId: `build-carrier-${option.kind}`,
          rowTestId: `build-carrier-row-${option.kind}`,
          icon: 'land',
          title: domainText(this.i18n, 'carrier', option.kind, 'name', definition.displayName),
          meta: this.i18n.t('build.carrierMeta', {
            cost: this.i18n.formatCents(definition.purchaseCost),
            capacity: this.i18n.formatNumber(definition.capacity),
            description: domainText(
              this.i18n,
              'carrier',
              option.kind,
              'description',
              definition.description,
            ),
          }),
          action: this.i18n.t(option.affordable ? 'build.buy' : 'build.tooCostly'),
          enabled: option.affordable,
          onClick: () => this.callbacks.onBuyCarrier(option.kind),
        }),
      );
    }

    // Land, listed last and visually distinct. Starter Extension deliberately
    // appears immediately above North Field so onboarding and the long-term
    // objective remain visible together.
    if (!snapshot.context) {
      this.#list.append(
        localizedText(this.i18n, 'h3', 'build.expand', { class: 'fr-panel-card__section' }),
      );
    }
    if (!snapshot.context && snapshot.land.length === 0) {
      this.#list.append(
        localizedText(this.i18n, 'p', 'build.ownedAllFields', { class: 'fr-market__empty' }),
      );
    }
    for (const parcel of snapshot.context ? [] : snapshot.land) {
      const progress = Math.round(parcel.progress * 100);
      this.#list.append(
        this.#row({
          testId: `build-land-${parcel.parcelId}`,
          rowTestId: `build-land-row-${parcel.parcelId}`,
          icon: 'land',
          title: parcel.displayName,
          meta: this.i18n.t('build.landMeta', {
            cost: this.i18n.formatCents(parcel.cost),
            beds: this.i18n.formatNumber(parcel.bedCount),
            detail: parcel.available
              ? this.i18n.t('build.saved', {
                  progress: this.i18n.formatNumber(progress),
                  description: parcel.description,
                })
              : (parcel.requirement ?? this.i18n.t('build.notAvailable')),
          }),
          action: parcel.available
            ? parcel.affordable
              ? this.i18n.t('build.buyLand')
              : `${this.i18n.formatNumber(progress)}%`
            : this.i18n.t('common.locked'),
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
    animal_shelter: 'animalShelter',
    water_trough: 'waterTrough',
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
