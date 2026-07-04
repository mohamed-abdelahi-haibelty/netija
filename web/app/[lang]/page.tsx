import { notFound } from 'next/navigation';
import { hasLocale } from '@/lib/i18n/settings';
import { getTranslations } from '@/lib/i18n/server';
import { SearchTabs } from '@/components/SearchTabs';
import type { PublishedYearsResponse } from 'shared';

interface PublishedYears {
  years: number[];
  error: boolean;
}

// Tag must match the one passed to revalidateTag in
// app/api/internal/revalidate-published-years/route.ts. Kept as a literal in
// both places rather than a shared constant module — importing a small
// standalone lib file into this route broke Turbopack's dev SSR bundling
// with a "require is not defined" error; a literal string sidesteps it.
const PUBLISHED_YEARS_TAG = 'published-years';

async function getPublishedYears(): Promise<PublishedYears> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
    const res = await fetch(`${baseUrl}/api/search/years`, {
      next: { revalidate: 3600, tags: [PUBLISHED_YEARS_TAG] },
    });
    if (!res.ok) return { years: [], error: true };
    const body = (await res.json()) as PublishedYearsResponse;
    return { years: body.data.years, error: false };
  } catch {
    return { years: [], error: true };
  }
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  if (!hasLocale(lang)) notFound();

  const [i18n, { years, error: yearsError }] = await Promise.all([
    getTranslations(lang),
    getPublishedYears(),
  ]);

  return (
    <div className="min-h-[calc(100vh-var(--nav-height))]">
      <div className="mx-auto max-w-140 px-6 pt-[9vh] pb-20">

        <header className="mb-8">
          <h1 className="font-heading text-[clamp(1.875rem,7vw,2.5rem)] font-bold leading-tight tracking-[-0.01em] text-foreground text-balance">
            {i18n.t('home.title')}
            <span className="sr-only">{` — ${i18n.t('home.subtitle')}`}</span>
          </h1>
          <p aria-hidden="true" className="mt-1.5 text-base text-muted-foreground text-pretty">
            {i18n.t('home.subtitle')}
          </p>
        </header>

        <SearchTabs lang={lang} years={years} yearsError={yearsError} />

        <hr className="border-border mt-14 mb-5" />

        <p className="text-xs text-muted-foreground text-pretty">
          {i18n.t('home.footerDisclaimer')}
        </p>

      </div>
    </div>
  );
}
