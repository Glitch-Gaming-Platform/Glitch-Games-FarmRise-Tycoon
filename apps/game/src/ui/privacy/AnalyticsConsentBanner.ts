import type { AnalyticsConsentState } from '@analytics/consent.js';
import { el } from '../core/dom.js';
import { createEnglishLocalization, type GameLocalization } from '../i18n/gameI18n.js';
import { localizedButton, localizedText } from '../i18n/localizedDom.js';

export interface AnalyticsConsentBannerOptions {
  readonly initialState: AnalyticsConsentState;
  readonly onDecision: (granted: boolean, source: 'banner' | 'settings') => void;
}

/** Strict opt-in privacy choice shown before any external analytics provider loads. */
export class AnalyticsConsentBanner {
  readonly root: HTMLElement;
  #source: 'banner' | 'settings';

  constructor(
    private readonly options: AnalyticsConsentBannerOptions,
    i18n: GameLocalization = createEnglishLocalization(),
  ) {
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
        localizedText(i18n, 'span', 'privacy.ribbon', { class: 'fr-ribbon' }),
        localizedText(i18n, 'h1', 'privacy.title', {
          class: 'fr-title',
          attrs: { id: 'analytics-consent-title' },
        }),
        localizedText(i18n, 'p', 'privacy.body', { class: 'fr-subtitle' }),
        localizedText(i18n, 'p', 'privacy.note', { class: 'fr-consent__note' }),
        el(
          'div',
          { class: 'fr-actions' },
          localizedButton(i18n, 'privacy.keepOn', () => this.#decide(true), {
            class: 'fr-btn fr-btn--primary',
            testId: 'analytics-consent-allow',
          }),
          localizedButton(i18n, 'privacy.turnOff', () => this.#decide(false), {
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
