import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { locales, hasLocale, getDirection } from '@/lib/i18n/settings';
import { I18nProvider } from '@/components/I18nProvider';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { geistSans, thmanyahSans, thmanyahSerifDisplay, thmanyahSerifText } from '@/lib/fonts';
import '@/app/globals.css';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: 'Netija',
    description: lang === 'ar' ? 'نتائج البكالوريا الموريتانية' : 'Résultats du Baccalauréat mauritanien',
  };
}

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
          <header className="border-b px-4 h-[var(--nav-height)] flex items-center justify-between">
            <Link
              href={`/${lang}`}
              className="text-sm font-semibold text-foreground hover:text-muted-foreground transition-colors duration-150"
            >
              Netija
            </Link>
            <LanguageSwitcher currentLocale={lang} />
          </header>
          <main className="flex-1">{children}</main>
        </I18nProvider>
      </body>
    </html>
  );
}
