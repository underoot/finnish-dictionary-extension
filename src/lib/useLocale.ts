import { useEffect, useState } from 'react';
import { TRANSLATIONS, RTL_LOCALES, type Messages } from './i18n';

function mapBrowserLang(lang: string): string {
  const lower = lang.toLowerCase();
  if (TRANSLATIONS[lower]) return lower;
  const prefix = lower.split('-')[0];
  if (TRANSLATIONS[prefix]) return prefix;
  return 'en';
}

type LocaleState = { locale: string; msgs: Messages; isRtl: boolean };

function buildState(locale: string): LocaleState {
  const msgs = TRANSLATIONS[locale] ?? TRANSLATIONS['en'];
  return { locale, msgs, isRtl: RTL_LOCALES.has(locale) };
}

export function useLocale(): LocaleState {
  const [state, setState] = useState<LocaleState>(() => {
    const fallback = mapBrowserLang(typeof navigator !== 'undefined' ? navigator.language : 'en');
    return buildState(fallback);
  });

  useEffect(() => {
    chrome.storage.local.get('pref:uiLocale').then((result) => {
      const stored = result['pref:uiLocale'];
      if (stored && TRANSLATIONS[stored]) {
        setState(buildState(stored));
      } else {
        const fallback = mapBrowserLang(navigator.language);
        setState(buildState(fallback));
      }
    });

    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !('pref:uiLocale' in changes)) return;
      const newVal = changes['pref:uiLocale'].newValue;
      if (newVal && TRANSLATIONS[newVal]) {
        setState(buildState(newVal));
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  return state;
}
