import type { GameLocalization } from './gameI18n.js';
import { el } from '../core/dom.js';

export interface LanguageSelectOptions {
  readonly className?: string;
  readonly testId?: string;
}

export function languageSelect(
  i18n: GameLocalization,
  options: LanguageSelectOptions = {},
): HTMLLabelElement {
  const select = el('select', {
    testId: options.testId,
  }) as HTMLSelectElement;
  i18n.bindAttribute(select, 'aria-label', 'language.selectAria');
  for (const locale of i18n.supportedLocales) {
    select.append(
      el('option', {
        attrs: { value: locale.code, dir: locale.direction },
        text: `${locale.flagEmoji ?? '🌐'} ${locale.nativeName}`,
      }),
    );
  }
  const flag = el('span', {
    class: 'fr-language-flag',
    attrs: { 'aria-hidden': 'true' },
    text: i18n.localeDefinition.flagEmoji ?? '🌐',
  });
  select.value = i18n.locale;
  select.addEventListener('change', () => {
    const locale = select.value;
    if (!i18n.hasLocale(locale)) return;
    select.disabled = true;
    void i18n
      .setLocale(locale)
      .catch(() => {
        select.value = i18n.locale;
      })
      .finally(() => {
        select.disabled = false;
      });
  });
  i18n.onChange((locale) => {
    select.value = locale;
    flag.textContent = i18n.localeDefinition.flagEmoji ?? '🌐';
  });

  const label = i18n.bindText(el('span'), 'language.label');
  const labelWithFlag = el('span', { class: 'fr-language-label' }, flag, label);
  return el(
    'label',
    { class: options.className ?? 'fr-field fr-field--language' },
    labelWithFlag,
    select,
  );
}
