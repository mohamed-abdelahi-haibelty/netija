'use client';
import i18next, { type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

const instances = new Map<string, i18n>();

// `dictionary` is this locale's already-resolved translation object (the
// caller, a Server Component, picks the single JSON file matching `locale` —
// see lib/i18n/server.ts#getDictionary). Loading only one locale's strings
// here, instead of statically importing both dictionaries.json files in this
// client module, is what keeps the other language's ~20 KiB out of every
// visitor's JS bundle.
export function getI18nClient(locale: string, dictionary: Record<string, unknown>) {
  let instance = instances.get(locale);
  if (!instance) {
    instance = i18next.createInstance();
    void instance.use(initReactI18next).init({
      lng: locale,
      fallbackLng: locale,
      resources: {
        [locale]: { translation: dictionary },
      },
      interpolation: { escapeValue: false },
    });
    instances.set(locale, instance);
  }
  return instance;
}
