import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { locales, hasLocale, getDirection } from '@/lib/i18n/settings';
import { I18nProvider } from '@/components/I18nProvider';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { geistSans, thmanyahSans, thmanyahSerifDisplay, thmanyahSerifText } from '@/lib/fonts';
import '@/app/globals.css';

export const metadata: Metadata = {
  title: 'Netija',
  description: 'نتائج البكالوريا الموريتانية',
};

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  if (!hasLocale(lang)) notFound();

  const dir = getDirection(lang);

  return (
    <html
      lang={lang}
      dir={dir}
      className={[
        geistSans.variable,
        thmanyahSans.variable,
        thmanyahSerifDisplay.variable,
        thmanyahSerifText.variable,
      ].join(' ')}
    >
      <body className="min-h-screen flex flex-col antialiased">
        <I18nProvider locale={lang}>
          <header className="border-b px-4 py-3 flex justify-end">
            <LanguageSwitcher currentLocale={lang} />
          </header>
          <main className="flex-1">{children}</main>
        </I18nProvider>
      </body>
    </html>
  );
}
