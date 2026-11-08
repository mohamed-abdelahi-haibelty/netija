'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { isExamType, type ExamType } from 'shared';
import { SearchTabs } from '@/components/SearchTabs';
import { ExamTypeSwitcher } from '@/components/ExamTypeSwitcher';

interface PublishedYears {
  years: number[];
  error: boolean;
}

// The exam type is a URL query param (?type=bac|brevet) so a refreshed,
// bookmarked, or shared search link keeps the same type. Missing/invalid ->
// 'bac' (the default, and every pre-Brevet link's implied type).
function resolveExamType(raw: string | null): ExamType {
  return isExamType(raw) ? raw : 'bac';
}

interface Props {
  lang: string;
  yearsByType: Record<ExamType, PublishedYears>;
}

// Reads ?type= client-side (useSearchParams) instead of the server
// component reading the `searchParams` prop, so the page.tsx server render
// doesn't depend on a per-request query value — see page.tsx for why that
// matters (it's what makes the home page cacheable again). Both exam types'
// data is already fetched server-side and passed down; this component only
// picks which one to show, it doesn't fetch anything itself.
//
// examType is React state, read from ?type= only once as the initial value —
// it, not the URL, drives every render after that. On a hard refresh of a
// ?type=... link, Next's router can desync from searchParams on this
// statically-generated route, so a tab click that only changed the URL via
// router.replace() could silently fail to re-render. Driving off state makes
// a click always work; the URL update below is just for shareability and
// intentionally bypasses the router.
export function HomeSearchSection({ lang, yearsByType }: Props) {
  const searchParams = useSearchParams();
  const [examType, setExamType] = useState<ExamType>(() => resolveExamType(searchParams.get('type')));
  const { years, error: yearsError } = yearsByType[examType];

  function handleExamTypeChange(type: ExamType) {
    setExamType(type);
    window.history.replaceState(null, '', `/${lang}?type=${type}`);
  }

  return (
    <>
      <ExamTypeSwitcher examType={examType} onSelect={handleExamTypeChange} />

      {/* key on examType so switching resets the tabs' local input state to a
          clean slate for the newly-chosen exam. */}
      <SearchTabs key={examType} lang={lang} examType={examType} years={years} yearsError={yearsError} />
    </>
  );
}
