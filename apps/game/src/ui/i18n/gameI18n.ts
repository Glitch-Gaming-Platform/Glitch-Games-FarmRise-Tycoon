import {
  Localization,
  type LocaleDefinition,
  type MessageCatalog,
} from '@engine/i18n/Localization.js';
import EN_MESSAGES from './messages/en.js';

export const LANGUAGE_STORAGE_KEY = 'farmrise:language';

export const SUPPORTED_LOCALES = [
  {
    code: 'en',
    nativeName: 'English',
    flagEmoji: '🇺🇸',
    direction: 'ltr',
    browserTags: ['en'],
  },
  {
    code: 'zh-Hans',
    nativeName: '简体中文',
    flagEmoji: '🇨🇳',
    direction: 'ltr',
    browserTags: ['zh', 'zh-cn', 'zh-sg', 'zh-hans'],
  },
  {
    code: 'hi',
    nativeName: 'हिन्दी',
    flagEmoji: '🇮🇳',
    direction: 'ltr',
    browserTags: ['hi'],
  },
  {
    code: 'es',
    nativeName: 'Español',
    flagEmoji: '🇪🇸',
    direction: 'ltr',
    browserTags: ['es'],
  },
  {
    code: 'ar',
    nativeName: 'العربية',
    flagEmoji: '🇸🇦',
    direction: 'rtl',
    browserTags: ['ar'],
  },
  {
    code: 'fr',
    nativeName: 'Français',
    flagEmoji: '🇫🇷',
    direction: 'ltr',
    browserTags: ['fr'],
  },
  {
    code: 'bn',
    nativeName: 'বাংলা',
    flagEmoji: '🇧🇩',
    direction: 'ltr',
    browserTags: ['bn'],
  },
  {
    code: 'pt',
    nativeName: 'Português',
    flagEmoji: '🇧🇷',
    direction: 'ltr',
    browserTags: ['pt'],
  },
  {
    code: 'id',
    nativeName: 'Bahasa Indonesia',
    flagEmoji: '🇮🇩',
    direction: 'ltr',
    browserTags: ['id', 'in'],
  },
  {
    code: 'ur',
    nativeName: 'اردو',
    flagEmoji: '🇵🇰',
    direction: 'rtl',
    browserTags: ['ur'],
  },
  {
    code: 'ja',
    nativeName: '日本語',
    flagEmoji: '🇯🇵',
    direction: 'ltr',
    browserTags: ['ja'],
  },
  {
    code: 'de',
    nativeName: 'Deutsch',
    flagEmoji: '🇩🇪',
    direction: 'ltr',
    browserTags: ['de'],
  },
] as const satisfies readonly LocaleDefinition[];

export type GameLocale = (typeof SUPPORTED_LOCALES)[number]['code'];
export type GameLocalization = Localization<GameLocale>;

export interface CreateGameLocalizationOptions {
  readonly initialLocale?: GameLocale;
  readonly detect?: boolean;
  readonly persist?: boolean;
  readonly storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  readonly navigatorLanguages?: readonly string[];
  readonly document?: Document | null;
}

const MESSAGE_LOADERS: Readonly<Record<GameLocale, () => Promise<MessageCatalog>>> = {
  en: async () => EN_MESSAGES,
  'zh-Hans': async () => (await import('./messages/zh-Hans.js')).default,
  hi: async () => (await import('./messages/hi.js')).default,
  es: async () => (await import('./messages/es.js')).default,
  ar: async () => (await import('./messages/ar.js')).default,
  fr: async () => (await import('./messages/fr.js')).default,
  bn: async () => (await import('./messages/bn.js')).default,
  pt: async () => (await import('./messages/pt.js')).default,
  id: async () => (await import('./messages/id.js')).default,
  ur: async () => (await import('./messages/ur.js')).default,
  ja: async () => (await import('./messages/ja.js')).default,
  de: async () => (await import('./messages/de.js')).default,
};

export async function createGameLocalization(
  options: CreateGameLocalizationOptions = {},
): Promise<GameLocalization> {
  const storage = options.storage === undefined ? safeStorage() : options.storage;
  const detected = options.detect === false ? 'en' : detectGameLocale(options.navigatorLanguages);
  const stored = readStoredLocale(storage);
  const initialLocale = options.initialLocale ?? stored ?? detected;
  const initialMessages = await loadGameMessages(initialLocale);
  const localization = new Localization<GameLocale>({
    fallbackLocale: 'en',
    fallbackMessages: EN_MESSAGES,
    initialLocale,
    initialMessages,
    locales: SUPPORTED_LOCALES,
    loadMessages: loadGameMessages,
  });
  const doc = options.document === undefined ? globalThis.document : options.document;
  const persist = options.persist !== false;

  const applyLocale = (locale: GameLocale): void => {
    const definition = SUPPORTED_LOCALES.find((candidate) => candidate.code === locale)!;
    if (doc) {
      doc.documentElement.lang = locale;
      doc.documentElement.dir = definition.direction;
      doc.title = localization.t('app.title');
      const description = doc.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (description) description.content = localization.t('app.description');
    }
    if (persist && storage) {
      try {
        storage.setItem(LANGUAGE_STORAGE_KEY, locale);
      } catch {
        // Language detection still works when private browsing blocks storage.
      }
    }
  };

  applyLocale(initialLocale);
  localization.onChange(applyLocale);
  return localization;
}

export function createEnglishLocalization(): GameLocalization {
  return new Localization<GameLocale>({
    fallbackLocale: 'en',
    fallbackMessages: EN_MESSAGES,
    initialLocale: 'en',
    initialMessages: EN_MESSAGES,
    locales: SUPPORTED_LOCALES,
    loadMessages: loadGameMessages,
  });
}

export function detectGameLocale(languages: readonly string[] = browserLanguages()): GameLocale {
  for (const language of languages) {
    const normalized = normalizeTag(language);
    for (const locale of SUPPORTED_LOCALES) {
      if (locale.browserTags.some((tag) => matchesTag(normalized, tag))) return locale.code;
    }
  }
  return 'en';
}

export async function loadGameMessages(locale: GameLocale): Promise<MessageCatalog> {
  return MESSAGE_LOADERS[locale]();
}

function readStoredLocale(storage: Pick<Storage, 'getItem'> | null): GameLocale | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(LANGUAGE_STORAGE_KEY);
    return SUPPORTED_LOCALES.some((locale) => locale.code === value) ? (value as GameLocale) : null;
  } catch {
    return null;
  }
}

function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function browserLanguages(): readonly string[] {
  const languages = globalThis.navigator?.languages;
  if (languages && languages.length > 0) return languages;
  const language = globalThis.navigator?.language;
  return language ? [language] : [];
}

function normalizeTag(tag: string): string {
  return tag.trim().replaceAll('_', '-').toLowerCase();
}

function matchesTag(browserTag: string, supportedTag: string): boolean {
  const candidate = normalizeTag(supportedTag);
  return browserTag === candidate || browserTag.startsWith(`${candidate}-`);
}
