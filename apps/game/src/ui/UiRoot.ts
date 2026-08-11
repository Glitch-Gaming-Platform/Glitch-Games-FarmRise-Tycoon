/**
 * Owns the DOM overlay: exactly one screen visible at a time, plus the HUD.
 *
 * Everything UI-related is created here so there is a single place to look for
 * "what can appear on screen and who put it there". Screens are constructed
 * once and toggled rather than created and destroyed, because rebuilding them
 * loses focus state and causes a layout flash.
 */
import { injectStyles } from './core/styles.js';
import type { Screen } from './core/Screen.js';
import { Hud } from './hud/Hud.js';
import { MenuShortcutDock, type MenuShortcutCallbacks } from './hud/MenuShortcutDock.js';
import { LoadingScreen } from './loading/LoadingScreen.js';
import { MainMenu, type MainMenuCallbacks } from './menus/MainMenu.js';
import { PauseMenu, type PauseMenuCallbacks } from './menus/PauseMenu.js';
import { SettingsPanel, type SettingsCallbacks } from './settings/SettingsPanel.js';
import { MarketPanel, type MarketPanelCallbacks } from './panels/MarketPanel.js';
import { BuildPanel, type BuildPanelCallbacks } from './panels/BuildPanel.js';
import { CareerPanel, type CareerPanelCallbacks } from './panels/CareerPanel.js';
import { TownPanel, type TownPanelCallbacks } from './panels/TownPanel.js';
import { CoachMark } from './onboarding/CoachMark.js';
import { OutcomeScreen, type OutcomeCallbacks } from './outcome/OutcomeScreen.js';
import { AccountPanel, type AccountCallbacks } from './account/AccountPanel.js';
import { el } from './core/dom.js';
import { TouchControls, type TouchControlCallbacks } from './hud/TouchControls.js';

export type ScreenName = 'none' | 'menu' | 'loading' | 'pause' | 'settings' | 'outcome';

export interface UiRootOptions {
  readonly container: HTMLElement;
  readonly menu: MainMenuCallbacks;
  readonly pause: PauseMenuCallbacks;
  readonly settings: SettingsCallbacks;
  readonly market: MarketPanelCallbacks;
  readonly build: BuildPanelCallbacks;
  readonly career: CareerPanelCallbacks;
  readonly town: TownPanelCallbacks;
  readonly outcome: OutcomeCallbacks;
  readonly account: AccountCallbacks;
  readonly shortcuts: MenuShortcutCallbacks;
  readonly touchControls?: TouchControlCallbacks;
}

export class UiRoot {
  readonly hud: Hud;
  readonly loading: LoadingScreen;
  readonly settings: SettingsPanel;
  /**
   * Panels are NOT screens. A screen is exclusive and replaces gameplay; a
   * panel floats over a farm that is still growing. Conflating the two would
   * make opening the market pause the game, which would quietly remove the
   * time pressure the market decision depends on.
   */
  readonly market: MarketPanel;
  readonly build: BuildPanel;
  readonly career: CareerPanel;
  readonly town: TownPanel;
  readonly coach = new CoachMark();
  readonly account: AccountPanel;
  readonly shortcuts: MenuShortcutDock;
  readonly touchControls: TouchControls | null;
  readonly outcome: OutcomeScreen;
  readonly #placing: HTMLElement;
  readonly #screens = new Map<ScreenName, Screen>();
  readonly #layer: HTMLElement;
  #current: ScreenName = 'none';
  #shortcutPanel: 'none' | 'market' | 'build' | 'career' | 'town' = 'none';
  #shortcutsAvailable = false;
  #placingActive = false;
  /** Where "Back" from settings returns to. */
  #settingsReturnTo: ScreenName = 'menu';

  constructor(options: UiRootOptions) {
    injectStyles();
    this.touchControls = options.touchControls ? new TouchControls(options.touchControls) : null;
    this.hud = new Hud({ touch: this.touchControls !== null });
    this.#layer = document.createElement('div');
    this.#layer.dataset['engineInputIgnore'] = 'true';
    this.#layer.style.position = 'absolute';
    this.#layer.style.inset = '0';
    // The overlay must not eat clicks meant for the canvas; individual panels
    // re-enable pointer events on themselves.
    this.#layer.style.pointerEvents = 'none';
    options.container.appendChild(this.#layer);

    this.loading = new LoadingScreen();
    this.settings = new SettingsPanel(options.settings);
    this.market = new MarketPanel(options.market);
    this.build = new BuildPanel(options.build);
    this.career = new CareerPanel(options.career);
    this.town = new TownPanel(options.town);
    this.outcome = new OutcomeScreen(options.outcome);
    this.account = new AccountPanel(options.account);
    this.shortcuts = new MenuShortcutDock(options.shortcuts);
    this.#placing = el('div', { class: 'fr-placing', testId: 'placing-banner' });
    this.#placing.hidden = true;
    this.#register('menu', new MainMenu(options.menu));
    this.#register('loading', this.loading);
    this.#register('pause', new PauseMenu(options.pause));
    this.#register('settings', this.settings);

    this.#register('outcome', this.outcome);
    this.#layer.append(
      this.hud.root,
      this.market.root,
      this.build.root,
      this.career.root,
      this.town.root,
      this.account.root,
      this.shortcuts.root,
    );
    if (this.touchControls) this.#layer.append(this.touchControls.root);
    this.#layer.append(this.coach.root, this.#placing);
    this.show('none');
  }

  get current(): ScreenName {
    return this.#current;
  }

  show(name: ScreenName): void {
    for (const [id, screen] of this.#screens) {
      const visible = id === name;
      screen.root.hidden = !visible;
      screen.root.style.pointerEvents = visible ? 'auto' : 'none';
      if (visible) screen.show?.();
      else screen.hide?.();
    }
    // The HUD belongs to gameplay: it is visible while playing and while paused
    // (so the player can see what they were looking at), never in a menu.
    const inGame = name !== 'menu' && name !== 'loading' && name !== 'outcome';
    this.hud.root.hidden = !inGame;
    if (!inGame) {
      this.market.setVisible(false);
      this.build.setVisible(false);
      this.career.setVisible(false);
      this.town.setVisible(false);
      this.coach.hide();
      this.setPlacing(null);
    }
    this.#current = name;
    this.#syncShortcuts();
  }

  setMenuShortcutsAvailable(available: boolean): void {
    this.#shortcutsAvailable = available;
    this.#syncShortcuts();
  }

  setMenuShortcutPanel(panel: 'none' | 'market' | 'build' | 'career' | 'town'): void {
    this.#shortcutPanel = panel;
    this.#syncShortcuts();
  }

  openSettings(returnTo: ScreenName): void {
    this.#settingsReturnTo = returnTo;
    this.show('settings');
  }

  closeSettings(): void {
    this.show(this.#settingsReturnTo);
  }

  /** The build-placement banner. Null hides it. */
  setPlacing(text: string | null, blocked = false): void {
    this.#placingActive = text !== null;
    this.#placing.hidden = text === null;
    if (text !== null) this.#placing.textContent = text;
    this.#placing.classList.toggle('fr-placing--blocked', blocked);
    this.#syncShortcuts();
  }

  dispose(): void {
    for (const screen of this.#screens.values()) screen.dispose?.();
    this.#screens.clear();
    this.hud.dispose();
    this.touchControls?.dispose();
    this.#layer.remove();
  }

  #register(name: ScreenName, screen: Screen): void {
    this.#screens.set(name, screen);
    this.#layer.appendChild(screen.root);
  }

  #syncShortcuts(): void {
    const gameplay =
      this.#shortcutsAvailable && this.#current === 'none' && this.#shortcutPanel === 'none';
    this.shortcuts.setVisible(gameplay && !this.#placingActive);
    this.touchControls?.setMode(
      !gameplay ? 'hidden' : this.#placingActive ? 'placement' : 'gameplay',
    );
  }
}
