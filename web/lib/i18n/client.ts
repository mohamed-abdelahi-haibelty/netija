'use client';
import i18next, { type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { defaultLocale } from './settings';
import ar from '@/dictionaries/ar.json';
import fr from '@/dictionaries/fr.json';

const instances = new Map<string, i18n>();

export function getI18nClient(locale: string) {
  let instance = instances.get(locale);
  if (!instance) {
    instance = i18next.createInstance();
    void instance.use(initReactI18next).init({
      lng: locale,
      fallbackLng: defaultLocale,
      resources: {
        ar: { translation: ar },
        fr: { translation: fr },
      },
      interpolation: { escapeValue: false },
    });
    instances.set(locale, instance);
  }
  return instance;
}
