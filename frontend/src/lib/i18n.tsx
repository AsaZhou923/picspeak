'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { enTranslations, type TranslationDictionary, type TranslationKey } from './i18n-en';
import { zhTranslations } from './i18n-zh';

export type { TranslationKey } from './i18n-en';

export type Locale = 'zh' | 'en' | 'ja';

export const LOCALE_LABELS: Record<Locale, string> = {
  zh: '\u4e2d\u6587',
  en: 'English',
  ja: '\u65e5\u672c\u8a9e',
};

export type Translator = (key: TranslationKey) => string;

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: Translator;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: (key) => key,
});

const STORAGE_KEY = 'picspeak-locale';
const LOCALE_SYNC_EVENT = 'picspeak-locale-sync';

function documentLang(locale: Locale): string {
  if (locale === 'zh') return 'zh-CN';
  return locale;
}

function isLocale(value: string | null | undefined): value is Locale {
  return Boolean(value && Object.prototype.hasOwnProperty.call(LOCALE_LABELS, value));
}

function detectPathLocale(): Locale | null {
  if (typeof window === 'undefined') return null;
  const firstSegment = window.location.pathname.split('/').filter(Boolean)[0];
  return isLocale(firstSegment) ? firstSegment : null;
}

async function loadTranslations(locale: Locale): Promise<TranslationDictionary> {
  switch (locale) {
    case 'zh':
      return zhTranslations;
    case 'ja':
      return (await import('./i18n-ja')).jaTranslations;
    case 'en':
    default:
      return enTranslations;
  }
}

export function I18nProvider({
  children,
  initialLocale,
  defaultLocale = 'en',
  initialMessages,
}: {
  children: React.ReactNode;
  /** When set, skips localStorage / browser-detection and pins this locale. */
  initialLocale?: Locale;
  /** Default locale when there is no URL prefix or saved user preference. */
  defaultLocale?: Locale;
  /** Initial SSR translation bundle so crawlers receive localized HTML. */
  initialMessages?: TranslationDictionary;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? defaultLocale);
  const [messages, setMessages] = useState<TranslationDictionary>(initialMessages ?? enTranslations);

  useEffect(() => {
    // If a locale was pinned by the URL route, honour it and persist it.
    if (initialLocale) {
      setLocaleState(initialLocale);
      if (initialMessages) {
        setMessages(initialMessages);
      }
      try {
        localStorage.setItem(STORAGE_KEY, initialLocale);
      } catch {
        // ignore
      }
      return;
    }

    const pathLocale = detectPathLocale();
    if (pathLocale) {
      setLocaleState(pathLocale);
      return;
    }

    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
      if (saved && saved in LOCALE_LABELS) {
        setLocaleState(saved);
        return;
      }
    } catch {
      // ignore
    }

    setLocaleState(defaultLocale);
  }, [defaultLocale, initialLocale, initialMessages]);

  useEffect(() => {
    if (initialLocale || typeof window === 'undefined') {
      return;
    }

    const handleLocaleSync = (event: Event) => {
      const nextLocale = (event as CustomEvent<Locale>).detail;
      if (isLocale(nextLocale)) {
        setLocaleState(nextLocale);
      }
    };

    window.addEventListener(LOCALE_SYNC_EVENT, handleLocaleSync);
    return () => window.removeEventListener(LOCALE_SYNC_EVENT, handleLocaleSync);
  }, [initialLocale]);

  useEffect(() => {
    let cancelled = false;

    async function syncMessages() {
      const nextMessages = await loadTranslations(locale);
      if (!cancelled) {
        setMessages(nextMessages);
      }
    }

    void syncMessages();

    return () => {
      cancelled = true;
    };
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<Locale>(LOCALE_SYNC_EVENT, { detail: l }));
    }
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = documentLang(locale);
  }, [locale]);

  const t = useCallback(
    (key: TranslationKey): string => {
      return messages[key] ?? zhTranslations[key] ?? key;
    },
    [messages]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
