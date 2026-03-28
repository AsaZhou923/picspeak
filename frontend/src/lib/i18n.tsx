'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { zhTranslations, type TranslationDictionary, type TranslationKey } from './i18n-zh';

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
  locale: 'zh',
  setLocale: () => {},
  t: (key) => key,
});

const STORAGE_KEY = 'picspeak-locale';

function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return 'zh';

  const candidates = Array.isArray(navigator.languages) && navigator.languages.length > 0
    ? navigator.languages
    : [navigator.language];

  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim().toLowerCase();
    if (normalized.startsWith('zh')) return 'zh';
    if (normalized.startsWith('ja')) return 'ja';
    if (normalized.startsWith('en')) return 'en';
  }

  return 'zh';
}

async function loadTranslations(locale: Locale): Promise<TranslationDictionary> {
  switch (locale) {
    case 'zh':
      return zhTranslations;
    case 'ja':
      return (await import('./i18n-ja')).jaTranslations as unknown as TranslationDictionary;
    case 'en':
    default:
      return (await import('./i18n-en')).enTranslations as unknown as TranslationDictionary;
  }
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('zh');
  const [messages, setMessages] = useState<TranslationDictionary>(zhTranslations);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
      if (saved && saved in LOCALE_LABELS) {
        setLocaleState(saved);
        return;
      }
    } catch {
      // ignore
    }

    setLocaleState(detectBrowserLocale());
  }, []);

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
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale;
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
