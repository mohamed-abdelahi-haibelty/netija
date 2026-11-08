import { type ReactNode } from 'react';
import { I18nProvider } from '@/components/I18nProvider';
import ar from '@/dictionaries/ar.json';
import fr from '@/dictionaries/fr.json';

const DICTIONARIES = { ar, fr } as const;

interface Props {
  locale: 'ar' | 'fr';
  children: ReactNode;
}

// Test-only stand-in for I18nProvider: real app code (app/[lang]/layout.tsx,
// app/admin/[lang]/layout.tsx) resolves a single locale's dictionary
// server-side and passes it down, so lib/i18n/client.ts never statically
// imports both dictionaries.json files into the browser bundle. Tests don't
// have that server step, so this wrapper imports both here instead — dead
// weight only in the test build, never in the app's actual client bundle.
export function TestI18nProvider({ locale, children }: Props) {
  return (
    <I18nProvider locale={locale} resources={DICTIONARIES[locale]}>
      {children}
    </I18nProvider>
  );
}
