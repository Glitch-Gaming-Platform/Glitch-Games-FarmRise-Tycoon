/**
 * Mobile-only equivalents of the gameplay action map.
 *
 * The joystick and each action button own their pointer ids so two thumbs can
 * move and work at the same time. The callbacks feed InputSystem's fixed-tick
 * action buffer; this component never dispatches synthetic keyboard or mouse
 * events.
 */
import type { GameAction } from '@game/GameActions.js';
import { el } from '../core/dom.js';
import { createEnglishLocalization, type GameLocalization } from '../i18n/gameI18n.js';

export interface TouchControlCallbacks {
  readonly setAction: (action: GameAction, down: boolean) => void;
  readonly setActionValue: (action: GameAction, value: number) => void;
}

export type TouchControlMode = 'hidden' | 'gameplay' | 'placement';

export class TouchControls {
  readonly root: HTMLElement;
  readonly #gameplay: HTMLElement;
  readonly #placement: HTMLElement;
  readonly #releases: Array<() => void> = [];

  constructor(
    callbacks: TouchControlCallbacks,
    private readonly i18n: GameLocalization = createEnglishLocalization(),
  ) {
    const movement = this.#joystick(callbacks);
    const actions = el(
      'div',
      { class: 'fr-touch-actions' },
      this.#actionButton(
        'cycleCrop',
        'touch.changeSeed',
        'touch.seed',
        'touch-cycle',
        callbacks,
        true,
      ),
      this.#actionButton(
        'prevent',
        'touch.protectFarm',
        'touch.protect',
        'touch-prevent',
        callbacks,
        true,
      ),
      this.#actionButton('interact', 'touch.work', 'touch.work', 'touch-interact', callbacks, true),
    );

    this.#gameplay = el(
      'div',
      { class: 'fr-touch-gameplay' },
      movement,
      actions,
      this.#actionButton('pause', 'touch.pause', null, 'touch-pause', callbacks, true, 'Ⅱ'),
    );
    this.#placement = el(
      'div',
      { class: 'fr-touch-placement' },
      this.#actionButton(
        'rotatePlacement',
        'touch.rotatePlacement',
        'touch.rotate',
        'touch-rotate',
        callbacks,
        true,
      ),
      this.#actionButton(
        'cancel',
        'touch.cancelPlacement',
        'touch.cancel',
        'touch-cancel',
        callbacks,
        true,
      ),
    );
    this.root = el(
      'nav',
      {
        class: 'fr-touch-controls',
        testId: 'touch-controls',
        attrs: { 'data-engine-input-ignore': 'true' },
      },
      this.#gameplay,
      this.#placement,
    );
    i18n.bindAttribute(this.root, 'aria-label', 'touch.controls');
    this.setMode('hidden');
  }

  setMode(mode: TouchControlMode): void {
    this.root.hidden = mode === 'hidden';
    this.#gameplay.hidden = mode !== 'gameplay';
    this.#placement.hidden = mode !== 'placement';
  }

  dispose(): void {
    for (const release of this.#releases) release();
    this.#releases.length = 0;
    this.root.remove();
  }

  #joystick(callbacks: TouchControlCallbacks): HTMLElement {
    const knob = el('span', { class: 'fr-touch-joystick__knob' });
    const base = el(
      'div',
      {
        class: 'fr-touch-joystick',
        testId: 'touch-joystick',
        attrs: { role: 'slider' },
      },
      knob,
    );
    this.i18n.bindAttribute(base, 'aria-label', 'touch.move');
    this.i18n.bindAttribute(base, 'aria-valuetext', 'touch.centered');
    let pointerId: number | null = null;

    const setVector = (clientX: number, clientY: number): void => {
      const rect = base.getBoundingClientRect();
      const radius = Math.max(1, Math.min(rect.width, rect.height) * 0.32);
      let x = (clientX - (rect.left + rect.width / 2)) / radius;
      let y = (clientY - (rect.top + rect.height / 2)) / radius;
      const length = Math.hypot(x, y);
      if (length > 1) {
        x /= length;
        y /= length;
      }
      const deadZone = 0.12;
      const scale = length <= deadZone ? 0 : Math.min(1, (length - deadZone) / (1 - deadZone));
      const normalisedLength = Math.hypot(x, y);
      const outputX = normalisedLength === 0 ? 0 : (x / normalisedLength) * scale;
      const outputY = normalisedLength === 0 ? 0 : (y / normalisedLength) * scale;

      callbacks.setActionValue('moveLeft', Math.max(0, -outputX));
      callbacks.setActionValue('moveRight', Math.max(0, outputX));
      callbacks.setActionValue('moveForward', Math.max(0, -outputY));
      callbacks.setActionValue('moveBack', Math.max(0, outputY));
      knob.style.transform = `translate(${outputX * radius}px, ${outputY * radius}px)`;
      base.setAttribute(
        'aria-valuetext',
        scale === 0
          ? this.i18n.t('touch.centered')
          : `${Math.round(outputX * 100)}, ${Math.round(-outputY * 100)}`,
      );
    };
    const reset = (): void => {
      for (const action of ['moveLeft', 'moveRight', 'moveForward', 'moveBack'] as const) {
        callbacks.setActionValue(action, 0);
      }
      knob.style.transform = 'translate(0px, 0px)';
      base.setAttribute('aria-valuetext', this.i18n.t('touch.centered'));
    };
    const press = (event: PointerEvent): void => {
      if (pointerId !== null) return;
      event.preventDefault();
      pointerId = event.pointerId;
      base.setPointerCapture?.(event.pointerId);
      base.classList.add('fr-touch-joystick--active');
      setVector(event.clientX, event.clientY);
    };
    const move = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) return;
      event.preventDefault();
      setVector(event.clientX, event.clientY);
    };
    const release = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) return;
      event.preventDefault();
      pointerId = null;
      base.classList.remove('fr-touch-joystick--active');
      reset();
    };

    base.addEventListener('pointerdown', press);
    base.addEventListener('pointermove', move);
    base.addEventListener('pointerup', release);
    base.addEventListener('pointercancel', release);
    base.addEventListener('lostpointercapture', release);
    this.#releases.push(() => {
      if (pointerId !== null) reset();
      base.removeEventListener('pointerdown', press);
      base.removeEventListener('pointermove', move);
      base.removeEventListener('pointerup', release);
      base.removeEventListener('pointercancel', release);
      base.removeEventListener('lostpointercapture', release);
    });
    return base;
  }

  #actionButton(
    action: GameAction,
    labelKey: string,
    textKey: string | null,
    testId: string,
    callbacks: TouchControlCallbacks,
    compact = false,
    literalText?: string,
  ): HTMLButtonElement {
    const button = el('button', {
      class: `fr-touch-button${compact ? ' fr-touch-button--compact' : ''}`,
      text: literalText ?? '',
      testId,
      attrs: { type: 'button' },
    });
    this.i18n.bindAttribute(button, 'aria-label', labelKey);
    if (textKey) this.i18n.bindText(button, textKey);
    const pointers = new Set<number>();

    const press = (event: PointerEvent): void => {
      event.preventDefault();
      if (pointers.has(event.pointerId)) return;
      pointers.add(event.pointerId);
      button.setPointerCapture?.(event.pointerId);
      if (pointers.size === 1) {
        // These controls map only to edge-triggered gameplay actions. Queue a
        // complete pulse on contact so the fixed-step input buffer cannot lose
        // the action if mobile Safari cancels capture during a gesture.
        callbacks.setAction(action, true);
        callbacks.setAction(action, false);
      }
      button.classList.add('fr-touch-button--pressed');
    };
    const release = (event: PointerEvent): void => {
      if (!pointers.delete(event.pointerId)) return;
      event.preventDefault();
      if (pointers.size === 0) {
        button.classList.remove('fr-touch-button--pressed');
      }
    };
    const activateFromKeyboard = (event: MouseEvent): void => {
      if (event.detail !== 0) return;
      callbacks.setAction(action, true);
      callbacks.setAction(action, false);
    };

    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('click', activateFromKeyboard);
    this.#releases.push(() => {
      button.removeEventListener('pointerdown', press);
      button.removeEventListener('pointerup', release);
      button.removeEventListener('pointercancel', release);
      button.removeEventListener('lostpointercapture', release);
      button.removeEventListener('click', activateFromKeyboard);
    });
    return button;
  }
}
