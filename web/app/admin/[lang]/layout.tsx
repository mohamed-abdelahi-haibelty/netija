import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { locales, hasLocale, getDirection } from '@/lib/i18n/settings';
import { I18nProvider } from '@/components/I18nProvider';
import { geistSans, thmanyahSans } from '@/lib/fonts';
import '@/app/globals.css';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: lang === 'ar' ? 'نتيجة — الإدارة' : 'Netija Admin',
    robots: { index: false, follow: false },
  };
}

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export default async function AdminLocaleLayout({
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
      ].join(' ')}
    >
      <body className="min-h-screen antialiased bg-background text-foreground">
        <I18nProvider locale={lang}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
