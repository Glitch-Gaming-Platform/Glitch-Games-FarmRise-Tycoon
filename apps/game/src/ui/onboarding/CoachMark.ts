/**
 * The onboarding prompt.
 *
 * Every rule in docs/ONBOARDING.md about prompts is enforced by this one
 * component, so there is no way for a beat to accidentally break them:
 *
 *   - Never modal. It sits above the interact prompt and the world keeps
 *     running behind it.
 *   - Never stacks. There is exactly one instance and showing a new beat
 *     replaces the old one.
 *   - Never steals focus. Nothing here is auto-focused, so a player mid-keypress
 *     is not interrupted.
 *   - At most two short lines of body text.
 *   - Always skippable, and the skip control is always in the same place.
 */
import { el } from '../core/dom.js';
import { createEnglishLocalization, type GameLocalization } from '../i18n/gameI18n.js';

export interface CoachBeat {
  readonly id: string;
  readonly title: string;
  /** Two short lines maximum. Enforced by a unit test on the beat table. */
  readonly body: string;
  /** Rendered as a key cap when the beat is about a specific input. */
  readonly key?: string;
}

export class CoachMark {
  readonly root: HTMLElement;
  readonly #title: HTMLElement;
  readonly #body: HTMLElement;
  readonly #foot: HTMLElement;
  #onSkip: (() => void) | null = null;
  readonly #i18n: GameLocalization;

  constructor(i18n: GameLocalization = createEnglishLocalization()) {
    this.#i18n = i18n;
    this.#title = el('p', { class: 'fr-coach__title' });
    this.#body = el('p', { class: 'fr-coach__body' });
    this.#foot = el('div', { class: 'fr-coach__foot' });
    this.root = el(
      'div',
      {
        class: 'fr-coach',
        testId: 'coach-mark',
        // polite, not assertive: a screen reader should finish the sentence it
        // is on rather than interrupt the player mid-action.
        attrs: { role: 'status', 'aria-live': 'polite' },
      },
      this.#title,
      this.#body,
      this.#foot,
    );
    this.root.hidden = true;
  }

  show(beat: CoachBeat, onSkip: () => void): void {
    this.#title.textContent = beat.title;
    this.#body.textContent = beat.body;
    this.#onSkip = onSkip;

    this.#foot.replaceChildren();
    if (beat.key) {
      this.#foot.append(el('span', { class: 'fr-coach__key', text: beat.key }));
    }
    const skip = el('button', {
      class: 'fr-coach__skip',
      testId: 'coach-skip',
      attrs: { type: 'button' },
    });
    this.#i18n.bindText(skip, 'coach.skip');
    skip.addEventListener('click', () => this.#onSkip?.());
    this.#foot.append(skip);

    this.root.hidden = false;
    this.root.dataset['beat'] = beat.id;
  }

  hide(): void {
    this.root.hidden = true;
    delete this.root.dataset['beat'];
  }

  get visible(): boolean {
    return !this.root.hidden;
  }
}
