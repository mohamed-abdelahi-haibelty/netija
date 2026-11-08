import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from '@/lib/i18n/settings';
import { getTranslations } from '@/lib/i18n/server';
import { SearchTabs } from '@/components/SearchTabs';
import { ExamTypeSwitcher } from '@/components/ExamTypeSwitcher';
import { HomeSearchSection } from '@/components/HomeSearchSection';
import type { ExamType, PublishedYearsResponse } from 'shared';

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

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const isAr = lang === 'ar';
  return {
    alternates: {
      canonical: `/${lang}`,
    },
    title: isAr ? 'نتيجة — أرشيف نتائج الامتحانات الوطنية' : 'Netija — Archive des résultats des examens nationaux',
    description: isAr
      ? 'أرشيف نتائج الامتحانات الوطنية الموريتانية — من 2015 إلى 2025.'
      : 'Archive des résultats des examens nationaux mauritaniens — de 2015 à 2025.',
    openGraph: {
      title: 'Netija',
      description: isAr
        ? 'أرشيف نتائج الامتحانات الوطنية الموريتانية — من 2015 إلى 2025'
        : 'Archive des résultats des examens nationaux mauritaniens — de 2015 à 2025',
      url: `/${lang}`,
      siteName: 'Netija',
      locale: isAr ? 'ar_MR' : 'fr_FR',
      type: 'website',
    },
  };
}

async function getPublishedYears(examType: ExamType): Promise<PublishedYears> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
    const res = await fetch(`${baseUrl}/api/search/years?type=${examType}`, {
      // Both type variants share one revalidate tag: publishing either type
      // invalidates both cached fetches, which is correct and cheap.
      next: { revalidate: 3600, tags: [PUBLISHED_YEARS_TAG] },
    });
    if (!res.ok) return { years: [], error: true };
    const body = (await res.json()) as PublishedYearsResponse;
    return { years: body.data.years, error: false };
  } catch {
    return { years: [], error: true };
  }
}

// The server render no longer reads the ?type= query param (that forced the
// whole page dynamic on every request — see HomeSearchSection.tsx). Instead
// it fetches BOTH exam types' published years up front (both already cached
// for an hour via getPublishedYears' revalidate, so fetching both instead of
// one costs nothing extra) and lets the client component pick which to show
// based on the actual URL.
export default async function HomePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  if (!hasLocale(lang)) notFound();

  const [i18n, bacYears, brevetYears] = await Promise.all([
    getTranslations(lang),
    getPublishedYears('bac'),
    getPublishedYears('brevet'),
  ]);
  const yearsByType: Record<ExamType, PublishedYears> = { bac: bacYears, brevet: brevetYears };

  return (
    <div className="mx-auto max-w-140 min-h-[calc(100vh-var(--nav-height))] px-6 pt-[max(9vh,2.5rem)] max-sm:pt-[max(5vh,1.5rem)] pb-[max(5rem,env(safe-area-inset-bottom))]">
      <h1 className="font-heading text-[clamp(1.875rem,7vw,2.5rem)] font-bold leading-tight tracking-[-0.01em] text-foreground text-balance">
        {i18n.t('home.title')}
      </h1>
      <p className="mt-2 mb-8 text-base text-muted-foreground text-pretty max-w-prose">
        {i18n.t('home.subtitle')}
      </p>

      {/* Fallback renders the 'bac' default so the initial HTML looks
          complete for the common case; a ?type=brevet link swaps in once
          the client resolves the real query param (useSearchParams docs:
          "the Client Component tree up to the closest Suspense boundary"
          is client-rendered when the route is prerendered). onSelect is
          omitted (defaults to a no-op) since a Server Component fallback
          can't pass event handler props to a Client Component anyway; the
          fallback is replaced by HomeSearchSection (which owns real
          selection handling) before hydration completes. */}
      <Suspense
        fallback={
          <>
            <ExamTypeSwitcher examType="bac" />
            <SearchTabs
              key="bac"
              lang={lang}
              examType="bac"
              years={yearsByType.bac.years}
              yearsError={yearsByType.bac.error}
            />
          </>
        }
      >
        <HomeSearchSection lang={lang} yearsByType={yearsByType} />
      </Suspense>

      <hr className="border-border mt-14 mb-6" />

      <p className="text-xs text-muted-foreground text-pretty">
        {i18n.t('home.footerDisclaimer')}
      </p>
    </div>
  );
}
