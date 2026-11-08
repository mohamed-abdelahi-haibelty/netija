'use client';
import { type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { getI18nClient } from '@/lib/i18n/client';

interface Props {
  locale: string;
  resources: Record<string, unknown>;
  children: ReactNode;
}

export function I18nProvider({ locale, resources, children }: Props) {
  const i18n = getI18nClient(locale, resources);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
