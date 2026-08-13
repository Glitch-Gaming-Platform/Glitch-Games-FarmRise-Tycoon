import { beforeEach, describe, expect, it } from 'vitest';
import {
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  createGameLocalization,
  detectGameLocale,
  loadGameMessages,
} from '../../src/ui/i18n/gameI18n.js';
import { localizeGameText } from '../../src/ui/i18n/gameText.js';
import { languageSelect } from '../../src/ui/i18n/LanguageSelect.js';
import EN_MESSAGES from '../../src/ui/i18n/messages/en.js';
import type { MessageCatalog } from '../../src/engine/i18n/Localization.js';

const ENGLISH_CATALOG: MessageCatalog = EN_MESSAGES;

describe('game localization', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
  });

  it('detects supported browser languages and falls back to English', () => {
    expect(detectGameLocale(['es-MX'])).toBe('es');
    expect(detectGameLocale(['zh-CN'])).toBe('zh-Hans');
    expect(detectGameLocale(['ar-EG'])).toBe('ar');
    expect(detectGameLocale(['ja-JP'])).toBe('ja');
    expect(detectGameLocale(['de-DE'])).toBe('de');
    expect(detectGameLocale(['ko-KR'])).toBe('en');
  });

  it('prefers a saved player choice over browser detection', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr');

    const i18n = await createGameLocalization({ navigatorLanguages: ['es-MX'] });

    expect(i18n.locale).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
    expect(i18n.t('menu.settings')).toBe('Paramètres');
  });

  it('updates bound UI, document direction, and persistence immediately', async () => {
    const i18n = await createGameLocalization({
      initialLocale: 'en',
      detect: false,
    });
    const label = i18n.bindText(document.createElement('span'), 'menu.play');

    await i18n.setLocale('ar');

    expect(label.textContent).toBe('ابدأ العمل في المزرعة');
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('ar');
  });

  it('ships twelve locale catalogs with translated entry points and valid placeholders', async () => {
    expect(SUPPORTED_LOCALES).toHaveLength(12);
    const required = [
      'language.label',
      'menu.play',
      'settings.title',
      'hud.money',
      'interaction.harvest',
      'seed.title',
    ];

    for (const locale of SUPPORTED_LOCALES) {
      const catalog = await loadGameMessages(locale.code);
      for (const key of required) expect(catalog[key], `${locale.code}:${key}`).toBeTruthy();
      for (const [key, translation] of Object.entries(catalog)) {
        const source = ENGLISH_CATALOG[key];
        expect(source, `${locale.code}:${key} is not in the English source catalog`).toBeTruthy();
        expect(placeholders(translation), `${locale.code}:${key}`).toEqual(placeholders(source!));
      }
    }
  });

  it('shows a representative flag for every language and updates it live', async () => {
    expect(SUPPORTED_LOCALES.every((locale) => Boolean(locale.flagEmoji))).toBe(true);
    const i18n = await createGameLocalization({ initialLocale: 'en', detect: false });
    const field = languageSelect(i18n);
    const flag = field.querySelector<HTMLElement>('.fr-language-flag');
    const options = field.querySelectorAll<HTMLOptionElement>('option');

    expect(flag?.textContent).toBe('🇺🇸');
    expect(options[0]?.textContent).toBe('🇺🇸 English');
    expect([...options].some((option) => option.textContent === '🇯🇵 日本語')).toBe(true);

    await i18n.setLocale('de');

    expect(flag?.textContent).toBe('🇩🇪');
  });

  it('localizes controller prompts at the presentation boundary', async () => {
    const i18n = await createGameLocalization({ initialLocale: 'es', detect: false });

    expect(localizeGameText(i18n, 'Plant Wheat')).toBe('Plantar Trigo');
    expect(localizeGameText(i18n, 'Harvest Wheat')).toBe('Cosechar Trigo');
    expect(localizeGameText(i18n, 'Choose seed')).toBe('Cambiar semilla');
    expect(localizeGameText(i18n, 'Put down (4)')).toBe('Dejar (4)');
  });
});

function placeholders(message: string): string[] {
  return [...message.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]!).sort();
}
