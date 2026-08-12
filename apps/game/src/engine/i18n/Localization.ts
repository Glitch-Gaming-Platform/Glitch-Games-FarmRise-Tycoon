export type TextDirection = 'ltr' | 'rtl';

export interface LocaleDefinition<LocaleCode extends string = string> {
  readonly code: LocaleCode;
  /** Name shown in the language itself, so the picker remains usable in any locale. */
  readonly nativeName: string;
  /** Optional representative flag used as a visual hint; the native name remains authoritative. */
  readonly flagEmoji?: string;
  readonly direction: TextDirection;
  readonly browserTags: readonly string[];
}

export type MessageCatalog = Readonly<Record<string, string>>;

export type MessageValue = string | number | boolean | MessageDescriptor;

/**
 * A locale-neutral piece of player-facing copy.
 *
 * Game systems may emit descriptors without knowing which language is active;
 * presentation resolves them at the UI or render boundary.
 */
export interface MessageDescriptor {
  readonly id: string;
  readonly values?: Readonly<Record<string, MessageValue>>;
  readonly count?: number;
  readonly defaultMessage?: string;
}

export interface LocalizationOptions<LocaleCode extends string> {
  readonly fallbackLocale: LocaleCode;
  readonly fallbackMessages: MessageCatalog;
  readonly initialLocale: LocaleCode;
  readonly initialMessages?: MessageCatalog;
  readonly locales: readonly LocaleDefinition<LocaleCode>[];
  readonly loadMessages: (locale: LocaleCode) => Promise<MessageCatalog>;
}

/** Minimal locale-neutral surface that lower layers may consume. */
export interface TextLocalizer {
  t(key: string, values?: Readonly<Record<string, MessageValue>>, defaultMessage?: string): string;
}

export type LocaleChangeListener<LocaleCode extends string> = (locale: LocaleCode) => void;

interface TextBinding {
  readonly element: WeakRef<HTMLElement>;
  readonly key: string;
  readonly values?: Readonly<Record<string, MessageValue>>;
}

interface AttributeBinding {
  readonly element: WeakRef<HTMLElement>;
  readonly attribute: string;
  readonly key: string;
  readonly values?: Readonly<Record<string, MessageValue>>;
}

/**
 * Small dependency-free localization runtime.
 *
 * Locale resources are loaded on demand, English remains the fallback, and
 * DOM bindings update in place when the player changes language. The runtime
 * deliberately uses the platform Intl APIs for numbers, currency and plural
 * categories so adding a locale is data work rather than formatter code.
 */
export class Localization<LocaleCode extends string = string> {
  readonly #fallbackLocale: LocaleCode;
  readonly #fallbackMessages: MessageCatalog;
  readonly #loadMessages: (locale: LocaleCode) => Promise<MessageCatalog>;
  readonly #locales: readonly LocaleDefinition<LocaleCode>[];
  readonly #messages = new Map<LocaleCode, MessageCatalog>();
  readonly #listeners = new Set<LocaleChangeListener<LocaleCode>>();
  readonly #textBindings = new Set<TextBinding>();
  readonly #attributeBindings = new Set<AttributeBinding>();
  readonly #numberFormatters = new Map<string, Intl.NumberFormat>();
  readonly #pluralRules = new Map<LocaleCode, Intl.PluralRules>();
  #locale: LocaleCode;
  #changeSequence = 0;

  constructor(options: LocalizationOptions<LocaleCode>) {
    this.#fallbackLocale = options.fallbackLocale;
    this.#fallbackMessages = options.fallbackMessages;
    this.#loadMessages = options.loadMessages;
    this.#locales = options.locales;
    this.#locale = options.initialLocale;
    this.#messages.set(options.fallbackLocale, options.fallbackMessages);
    if (options.initialMessages) this.#messages.set(options.initialLocale, options.initialMessages);
  }

  get locale(): LocaleCode {
    return this.#locale;
  }

  get localeDefinition(): LocaleDefinition<LocaleCode> {
    return (
      this.#locales.find((locale) => locale.code === this.#locale) ??
      this.#locales.find((locale) => locale.code === this.#fallbackLocale)!
    );
  }

  get supportedLocales(): readonly LocaleDefinition<LocaleCode>[] {
    return this.#locales;
  }

  hasLocale(locale: string): locale is LocaleCode {
    return this.#locales.some((candidate) => candidate.code === locale);
  }

  async setLocale(locale: LocaleCode): Promise<void> {
    if (locale === this.#locale) return;
    const sequence = ++this.#changeSequence;
    let messages = this.#messages.get(locale);
    if (!messages) {
      messages = await this.#loadMessages(locale);
      this.#messages.set(locale, messages);
    }
    // A slower earlier import must not overwrite a later player choice.
    if (sequence !== this.#changeSequence) return;
    this.#locale = locale;
    this.#numberFormatters.clear();
    this.#refreshBindings();
    for (const listener of this.#listeners) listener(locale);
  }

  onChange(listener: LocaleChangeListener<LocaleCode>): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  t(key: string, values?: Readonly<Record<string, MessageValue>>, defaultMessage?: string): string {
    const messages = this.#messages.get(this.#locale);
    const count = typeof values?.['count'] === 'number' ? values['count'] : undefined;
    const template =
      this.#lookup(messages, key, count) ??
      this.#lookup(this.#fallbackMessages, key, count) ??
      defaultMessage ??
      key;
    return this.#interpolate(template, values);
  }

  resolve(message: string | MessageDescriptor | null | undefined): string {
    if (message === null || message === undefined) return '';
    if (typeof message === 'string') return message;
    const values =
      message.count === undefined ? message.values : { ...message.values, count: message.count };
    return this.t(message.id, values, message.defaultMessage);
  }

  formatNumber(value: number, options: Intl.NumberFormatOptions = {}): string {
    const cacheKey = `${this.#locale}:${JSON.stringify(options)}`;
    let formatter = this.#numberFormatters.get(cacheKey);
    if (!formatter) {
      formatter = new Intl.NumberFormat(this.#locale, options);
      this.#numberFormatters.set(cacheKey, formatter);
    }
    return formatter.format(value);
  }

  formatCents(value: number, currency = 'USD'): string {
    return this.formatNumber(value / 100, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  formatPercent(value: number, maximumFractionDigits = 0): string {
    return this.formatNumber(value, { style: 'percent', maximumFractionDigits });
  }

  formatDurationSeconds(totalSeconds: number): string {
    const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    if (minutes === 0) {
      return this.t('time.secondsShort', { value: this.formatNumber(seconds) });
    }
    if (seconds === 0) {
      return this.t('time.minutesShort', { value: this.formatNumber(minutes) });
    }
    return this.t('time.minutesSecondsShort', {
      minutes: this.formatNumber(minutes),
      seconds: this.formatNumber(seconds),
    });
  }

  bindText<T extends HTMLElement>(
    element: T,
    key: string,
    values?: Readonly<Record<string, MessageValue>>,
  ): T {
    const binding: TextBinding = { element: new WeakRef(element), key, values };
    this.#textBindings.add(binding);
    element.textContent = this.t(key, values);
    return element;
  }

  bindAttribute<T extends HTMLElement>(
    element: T,
    attribute: string,
    key: string,
    values?: Readonly<Record<string, MessageValue>>,
  ): T {
    const binding: AttributeBinding = {
      element: new WeakRef(element),
      attribute,
      key,
      values,
    };
    this.#attributeBindings.add(binding);
    element.setAttribute(attribute, this.t(key, values));
    return element;
  }

  #lookup(catalog: MessageCatalog | undefined, key: string, count?: number): string | undefined {
    if (!catalog) return undefined;
    if (count !== undefined) {
      let rules = this.#pluralRules.get(this.#locale);
      if (!rules) {
        rules = new Intl.PluralRules(this.#locale);
        this.#pluralRules.set(this.#locale, rules);
      }
      const category = rules.select(count);
      const plural = catalog[`${key}.${category}`] ?? catalog[`${key}.other`];
      if (plural !== undefined) return plural;
    }
    return catalog[key];
  }

  #interpolate(template: string, values?: Readonly<Record<string, MessageValue>>): string {
    if (!values) return template;
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
      const value = values[key];
      if (value === undefined) return match;
      if (typeof value === 'object') return this.resolve(value);
      return String(value);
    });
  }

  #refreshBindings(): void {
    for (const binding of this.#textBindings) {
      const element = binding.element.deref();
      if (!element) {
        this.#textBindings.delete(binding);
        continue;
      }
      element.textContent = this.t(binding.key, binding.values);
    }
    for (const binding of this.#attributeBindings) {
      const element = binding.element.deref();
      if (!element) {
        this.#attributeBindings.delete(binding);
        continue;
      }
      element.setAttribute(binding.attribute, this.t(binding.key, binding.values));
    }
  }
}

export function message(
  id: string,
  values?: Readonly<Record<string, MessageValue>>,
  defaultMessage?: string,
): MessageDescriptor {
  return { id, values, defaultMessage };
}
