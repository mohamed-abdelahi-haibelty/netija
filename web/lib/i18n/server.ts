import 'server-only';
import i18next from 'i18next';
import type { Locale } from './settings';

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
