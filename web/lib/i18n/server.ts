import 'server-only';
import i18next from 'i18next';
import type { Locale } from './settings';

// Resolves only the requested locale's dictionary, so the layout can pass a
// single-locale object down to the client I18nProvider (lib/i18n/client.ts)
// instead of that client module statically importing both languages.
export async function getDictionary(locale: Locale) {
  const dict = locale === 'ar' ? await import('@/dictionaries/ar.json') : await import('@/dictionaries/fr.json');
  return dict.default;
}

export async function getTranslations(locale: Locale) {
  const instance = i18next.createInstance();
  await instance.init({
    lng: locale,
    fallbackLng: 'ar',
    resources: {
      ar: { translation: (await import('@/dictionaries/ar.json')).default },
      fr: { translation: (await import('@/dictionaries/fr.json')).default },
    },
    interpolation: { escapeValue: false },
  });
  return instance;
}
