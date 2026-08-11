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
import { formatCents, formatTicks, type Cents } from '@farmrise/shared';
import type { HudFeature } from '@game/onboarding/beats.js';
import { clear, el } from '../core/dom.js';
import { TOAST_SECONDS } from '@game/rules/sessionRules.js';

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
  readonly #objective: HTMLElement;
  readonly #objectiveLabel: HTMLElement;
  readonly #objectiveFill: HTMLElement;
  readonly #timers = new Set<ReturnType<typeof setTimeout>>();
  readonly #touch: boolean;

  constructor(options: HudOptions = {}) {
    this.#touch = options.touch ?? false;
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

    this.root = el(
      'div',
      { class: 'fr-hud', testId: 'hud' },
      this.#objective,
      this.#bar,
      this.#prompt,
      this.#toasts,
    );
  }

  render(snapshot: HudSnapshot): void {
    const shows = (feature: HudFeature) => snapshot.revealed.has(feature);

    this.#objective.hidden = !shows('objective');
    if (shows('objective')) {
      const percent = Math.round(snapshot.objectiveProgress * 100);
      this.#objectiveLabel.textContent = snapshot.objectiveReady
        ? `${snapshot.objectiveLabel}  ·  ${this.#touch ? 'tap Career' : 'press C'} to claim`
        : `${snapshot.objectiveLabel}  ·  ${percent}%`;
      this.#objectiveFill.style.width = `${Math.min(100, percent)}%`;
      this.#objective.classList.toggle('fr-objective--ready', snapshot.objectiveReady);
    }

    clear(this.#bar);
    // Each stat appears only once it can mean something. A storage meter
    // shown before the player owns anything is noise they have to learn to
    // ignore, and anything a player learns to ignore is wasted.
    if (shows('money')) {
      this.#bar.append(stat('Money', formatCents(snapshot.balance), 'hud-balance'));
    }
    if (shows('storage')) {
      this.#bar.append(
        stat('Store', `${snapshot.storageUsed}/${snapshot.storageCapacity}`, 'hud-storage'),
      );
    }
    if (shows('seed')) {
      this.#bar.append(stat('Seed', snapshot.selectedCrop, 'hud-crop'));
    }
    if (shows('ready')) {
      this.#bar.append(stat('Ready', String(snapshot.readyPlots), 'hud-ready'));
    }
    // Carrying is only shown while it constrains the player. A permanent
    // "0/8" teaches nothing; "24/30" while walking home is the whole mechanic.
    if (snapshot.carry && snapshot.carry.units > 0) {
      this.#bar.append(
        stat('Carrying', `${snapshot.carry.units}/${snapshot.carry.capacity}`, 'hud-carry'),
      );
    }
    if (snapshot.season) {
      this.#bar.append(stat('Season', snapshot.season, 'hud-season'));
    }
    this.#bar.hidden = this.#bar.childElementCount === 0;

    if (snapshot.warning && shows('warning')) {
      const prevent =
        snapshot.warning.preventCost === null
          ? ''
          : `  ·  ${this.#touch ? 'Protect' : 'F'} to prevent ${formatCents(snapshot.warning.preventCost)}`;
      this.#bar.hidden = false;
      this.#bar.append(
        stat(
          '⚠',
          snapshot.warning.phase === 'warning'
            ? `${snapshot.warning.label} in ${formatTicks(snapshot.warning.ticksRemaining)}${prevent}`
            : `${snapshot.warning.label} active · ${formatTicks(snapshot.warning.ticksRemaining)} left`,
          'hud-warning',
        ),
      );
    }
  }

  setPrompt(label: string | null, secondaryLabel: string | null = null): void {
    this.#prompt.hidden = label === null;
    if (label) {
      const primary = `${label}  ·  ${this.#touch ? 'tap Work' : 'press E'}`;
      const secondary = secondaryLabel
        ? `  |  ${secondaryLabel}  ·  ${this.#touch ? 'tap Seed' : 'press Q'}`
        : '';
      this.#prompt.textContent = `${primary}${secondary}`;
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
