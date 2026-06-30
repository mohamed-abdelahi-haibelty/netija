import { notFound } from 'next/navigation';
import { hasLocale } from '@/lib/i18n/settings';
import { getTranslations } from '@/lib/i18n/server';
import { SearchTabs } from '@/components/SearchTabs';
import { PageShell } from '@/components/PageShell';
import type { PublishedYearsResponse } from 'shared';

async function getPublishedYears(): Promise<number[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
    const res = await fetch(`${baseUrl}/api/search/years`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as PublishedYearsResponse;
    return body.data.years;
  } catch {
    return [];
  }
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  if (!hasLocale(lang)) notFound();

  const [i18n, years] = await Promise.all([getTranslations(lang), getPublishedYears()]);

  return (
    <PageShell className="flex flex-col items-center justify-start md:justify-center px-4 pt-10 pb-8 md:py-16" innerClassName="w-full flex flex-col gap-8 md:gap-12">

        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-[2.5rem] font-bold leading-[1.1] tracking-tight text-foreground text-balance">
            {i18n.t('home.title')}
            <span className="sr-only">{` — ${i18n.t('home.subtitle')}`}</span>
          </h1>
          <p aria-hidden="true" className="text-base text-muted-foreground text-pretty">
            {i18n.t('home.subtitle')}
          </p>
        </div>

        <SearchTabs lang={lang} years={years} />

    </PageShell>
  );
}
