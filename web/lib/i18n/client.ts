'use client';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { defaultLocale } from './settings';
import ar from '@/dictionaries/ar.json';
import fr from '@/dictionaries/fr.json';

const i18nClient = i18next.createInstance();

let initialized = false;

export function getI18nClient(locale: string) {
  if (!initialized) {
    void i18nClient.use(initReactI18next).init({
      lng: locale,
      fallbackLng: defaultLocale,
      resources: {
        ar: { translation: ar },
        fr: { translation: fr },
      },
      interpolation: { escapeValue: false },
    });
    initialized = true;
  }
  return i18nClient;
}
