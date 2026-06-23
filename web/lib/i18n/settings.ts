export const defaultLocale = 'ar' as const;
export const locales = ['ar', 'fr'] as const;

export type Locale = (typeof locales)[number];

export function hasLocale(lang: string): lang is Locale {
  return (locales as readonly string[]).includes(lang);
}

export function getDirection(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}
