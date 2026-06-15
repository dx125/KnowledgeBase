import { useCallback, useState } from 'react';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from './i18n';

const STORAGE_KEY = 'kb.locale';

function readInitial(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && SUPPORTED_LOCALES.includes(stored as Locale)) return stored as Locale;
  return DEFAULT_LOCALE;
}

export function useLocale() {
  const [locale, setLocaleState] = useState<Locale>(readInitial);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
  }, []);

  return { locale, setLocale };
}
