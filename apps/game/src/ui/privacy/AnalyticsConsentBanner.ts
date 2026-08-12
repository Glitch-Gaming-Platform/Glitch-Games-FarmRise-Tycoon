import type { AnalyticsConsentState } from '@analytics/consent.js';
import { button, el } from '../core/dom.js';

export interface AnalyticsConsentBannerOptions {
  readonly initialState: AnalyticsConsentState;
  readonly onDecision: (granted: boolean, source: 'banner' | 'settings') => void;
}

/** Strict opt-in privacy choice shown before any external analytics provider loads. */
export class AnalyticsConsentBanner {
  readonly root: HTMLElement;
  #source: 'banner' | 'settings';

  constructor(private readonly options: AnalyticsConsentBannerOptions) {
    this.#source = options.initialState === 'unknown' ? 'banner' : 'settings';
    this.root = el(
      'div',
      {
        class: 'fr-consent',
        testId: 'analytics-consent',
        attrs: {
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': 'analytics-consent-title',
        },
      },
      el(
        'div',
        { class: 'fr-panel fr-panel--compact fr-consent__panel' },
        el('span', { class: 'fr-ribbon', text: 'Your privacy' }),
        el('h1', {
          class: 'fr-title',
          text: 'Help improve the farm',
          attrs: { id: 'analytics-consent-title' },
        }),
        el('p', {
          class: 'fr-subtitle',
          text: 'Anonymous usage analytics are on by default, including coarse device and browser details, so we can find confusing steps, crashes and slow performance. We never send passwords, account details, chat or anything you type.',
        }),
        el('p', {
          class: 'fr-consent__note',
          text: 'Optional. The game still works if you turn analytics off, and you can change this choice later in Settings.',
        }),
        el(
          'div',
          { class: 'fr-actions' },
          button('Keep analytics on', () => this.#decide(true), {
            class: 'fr-btn fr-btn--primary',
            testId: 'analytics-consent-allow',
          }),
          button('Turn analytics off', () => this.#decide(false), {
            class: 'fr-btn fr-btn--secondary',
            testId: 'analytics-consent-deny',
          }),
        ),
      ),
    );
    this.root.hidden = options.initialState !== 'unknown';
  }

  showPreferences(): void {
    this.#source = 'settings';
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  #decide(granted: boolean): void {
    this.hide();
    this.options.onDecision(granted, this.#source);
  }
}
