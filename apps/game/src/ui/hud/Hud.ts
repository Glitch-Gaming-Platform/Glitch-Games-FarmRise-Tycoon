/**
 * The heads-up display.
 *
 * The HUD is a pure observer: it subscribes to world and controller events and
 * renders what it is told. It never calls a command and never reads game state
 * directly, which is what allows `game/` to have no dependency on `ui/` (that
 * direction is enforced by eslint).
 *
 * Updates are pushed on events, plus a cheap 4Hz poll for the continuously
 * changing values (money, storage). Rebuilding text nodes at 60Hz is wasted
 * main-thread work that competes with the render loop.
 */
import { ticksToSeconds, type Cents } from '@farmrise/shared';
import type { HudFeature } from '@game/onboarding/beats.js';
import { clear, el } from '../core/dom.js';
import { TOAST_SECONDS } from '@game/rules/sessionRules.js';
import { createEnglishLocalization, type GameLocalization } from '../i18n/gameI18n.js';

export type ToastTone = 'info' | 'warn' | 'error';

/**
 * A gauge for the thing the player is standing next to.
 *
 * Mirrors the shape the interaction controller produces. It is redeclared here
 * rather than imported so the HUD keeps compiling with no game types at all,
 * which is what lets it be tested on its own.
 */
export interface HudOptions {
  readonly touch?: boolean;
  readonly i18n?: GameLocalization;
}

export interface HudSnapshot {
  readonly balance: Cents;
  readonly storageUsed: number;
  readonly storageCapacity: number;
  readonly selectedCrop: string;
  readonly readyPlots: number;
  readonly warning: {
    label: string;
    phase: 'warning' | 'active';
    ticksRemaining: number;
    preventCost: Cents | null;
  } | null;
  /**
   * Progressive disclosure. A HUD element only renders once onboarding has
   * revealed it, so a new player is not shown a storage meter before they
   * have anything to store. Once onboarding finishes, everything is revealed.
   */
  readonly revealed: ReadonlySet<HudFeature>;
  /** Progress toward the current career milestone, 0..1. */
  readonly objectiveProgress: number;
  /** What the milestone is called, in the player's words. */
  readonly objectiveLabel: string;
  /** True when every requirement is met and the milestone can be claimed. */
  readonly objectiveReady: boolean;
  /** What the player is physically carrying, and how much they can. */
  readonly carry: { readonly units: number; readonly capacity: number } | null;
  /** Current season, shown once the player has lived through one boundary. */
  readonly season: string | null;
}

export class Hud {
  readonly root: HTMLElement;
  readonly #bar: HTMLElement;
  readonly #prompt: HTMLElement;
  readonly #toasts: HTMLElement;
  readonly #top: HTMLElement;
  readonly #objective: HTMLElement;
  readonly #objectiveLabel: HTMLElement;
  readonly #objectiveFill: HTMLElement;
  readonly #timers = new Set<ReturnType<typeof setTimeout>>();
  readonly #touch: boolean;
  readonly #i18n: GameLocalization;
  #snapshot: HudSnapshot | null = null;
  #promptState: readonly [string | null, string | null, string | null] = [null, null, null];

  constructor(options: HudOptions = {}) {
    this.#touch = options.touch ?? false;
    this.#i18n = options.i18n ?? createEnglishLocalization();
    this.#bar = el('div', { class: 'fr-hud__bar', testId: 'hud-bar' });
    this.#prompt = el('div', { class: 'fr-hud__prompt', testId: 'hud-prompt' });
    this.#prompt.hidden = true;
    this.#toasts = el('div', {
      class: 'fr-hud__toasts',
      attrs: { role: 'log', 'aria-live': 'polite' },
    });
    this.#objectiveLabel = el('div', { class: 'fr-objective__label' });
    this.#objectiveFill = el('div', { class: 'fr-objective__fill' });
    this.#objective = el(
      'div',
      { class: 'fr-objective', testId: 'hud-objective' },
      this.#objectiveLabel,
      el('div', { class: 'fr-objective__track' }, this.#objectiveFill),
    );
    this.#objective.hidden = true;
    this.#top = el('div', { class: 'fr-hud__top' }, this.#objective, this.#bar, this.#toasts);

    this.root = el('div', { class: 'fr-hud', testId: 'hud' }, this.#top, this.#prompt);
    this.#i18n.onChange(() => {
      if (this.#snapshot) this.render(this.#snapshot);
      this.setPrompt(...this.#promptState);
    });
  }

  render(snapshot: HudSnapshot): void {
    this.#snapshot = snapshot;
    const shows = (feature: HudFeature) => snapshot.revealed.has(feature);

    this.#objective.hidden = !shows('objective');
    if (shows('objective')) {
      const percent = Math.round(snapshot.objectiveProgress * 100);
      this.#objectiveLabel.textContent = snapshot.objectiveReady
        ? this.#i18n.t(this.#touch ? 'hud.claimTouch' : 'hud.claimDesktop', {
            objective: snapshot.objectiveLabel,
          })
        : this.#i18n.t('hud.progress', {
            objective: snapshot.objectiveLabel,
            percent: this.#i18n.formatNumber(percent),
          });
      this.#objectiveFill.style.width = `${Math.min(100, percent)}%`;
      this.#objective.classList.toggle('fr-objective--ready', snapshot.objectiveReady);
    }

    clear(this.#bar);
    // Each stat appears only once it can mean something. A storage meter
    // shown before the player owns anything is noise they have to learn to
    // ignore, and anything a player learns to ignore is wasted.
    if (shows('money')) {
      this.#bar.append(
        stat(this.#i18n.t('hud.money'), this.#i18n.formatCents(snapshot.balance), 'hud-balance'),
      );
    }
    if (shows('storage')) {
      this.#bar.append(
        stat(
          this.#i18n.t('hud.store'),
          `${this.#i18n.formatNumber(snapshot.storageUsed)}/${this.#i18n.formatNumber(snapshot.storageCapacity)}`,
          'hud-storage',
        ),
      );
    }
    if (shows('seed')) {
      this.#bar.append(stat(this.#i18n.t('hud.seed'), snapshot.selectedCrop, 'hud-crop'));
    }
    if (shows('ready')) {
      this.#bar.append(
        stat(this.#i18n.t('hud.ready'), this.#i18n.formatNumber(snapshot.readyPlots), 'hud-ready'),
      );
    }
    // Carrying is only shown while it constrains the player. A permanent
    // "0/8" teaches nothing; "24/30" while walking home is the whole mechanic.
    if (snapshot.carry && snapshot.carry.units > 0) {
      this.#bar.append(
        stat(
          this.#i18n.t('hud.carrying'),
          `${this.#i18n.formatNumber(snapshot.carry.units)}/${this.#i18n.formatNumber(snapshot.carry.capacity)}`,
          'hud-carry',
        ),
      );
    }
    if (snapshot.season) {
      this.#bar.append(stat(this.#i18n.t('hud.season'), snapshot.season, 'hud-season'));
    }
    this.#bar.hidden = this.#bar.childElementCount === 0;

    if (snapshot.warning && shows('warning')) {
      const prevent =
        snapshot.warning.preventCost === null
          ? ''
          : this.#i18n.t(this.#touch ? 'hud.preventTouch' : 'hud.preventDesktop', {
              cost: this.#i18n.formatCents(snapshot.warning.preventCost),
            });
      this.#bar.hidden = false;
      this.#bar.append(
        stat(
          '⚠',
          snapshot.warning.phase === 'warning'
            ? this.#i18n.t('hud.warningIn', {
                warning: snapshot.warning.label,
                time: this.#i18n.formatDurationSeconds(
                  ticksToSeconds(snapshot.warning.ticksRemaining),
                ),
                prevent,
              })
            : this.#i18n.t('hud.warningActive', {
                warning: snapshot.warning.label,
                time: this.#i18n.formatDurationSeconds(
                  ticksToSeconds(snapshot.warning.ticksRemaining),
                ),
              }),
          'hud-warning',
        ),
      );
    }
  }

  setPrompt(
    label: string | null,
    secondaryLabel: string | null = null,
    notice: string | null = null,
  ): void {
    this.#promptState = [label, secondaryLabel, notice];
    clear(this.#prompt);
    this.#prompt.hidden = label === null && notice === null;
    if (label) {
      const primary = this.#i18n.t(this.#touch ? 'hud.primaryTouch' : 'hud.primaryDesktop', {
        action: label,
      });
      const secondary = secondaryLabel
        ? `  |  ${this.#i18n.t(this.#touch ? 'hud.secondaryTouch' : 'hud.secondaryDesktop', {
            action: secondaryLabel,
          })}`
        : '';
      this.#prompt.append(
        el('span', { class: 'fr-hud__prompt-actions', text: `${primary}${secondary}` }),
      );
    }
    if (notice) {
      this.#prompt.append(el('span', { class: 'fr-hud__prompt-notice', text: notice }));
    }
  }

  toast(message: string, tone: ToastTone = 'info'): void {
    const node = el('div', {
      class: `fr-toast${tone === 'info' ? '' : ` fr-toast--${tone}`}`,
      text: message,
    });
    this.#toasts.append(node);
    const timer = setTimeout(() => {
      node.remove();
      this.#timers.delete(timer);
    }, TOAST_SECONDS * 1000);
    this.#timers.add(timer);
  }

  dispose(): void {
    for (const timer of this.#timers) clearTimeout(timer);
    this.#timers.clear();
    this.root.remove();
  }
}

function stat(label: string, value: string, testId: string): HTMLElement {
  return el(
    'span',
    { testId },
    el('span', { text: `${label} `, style: { opacity: '0.6' } }),
    el('strong', { text: value }),
  );
}
