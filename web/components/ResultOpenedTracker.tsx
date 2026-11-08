'use client';

import { useEffect } from 'react';
import { consumeSearchAttempts, trackResultOpened } from '@/lib/analytics';
import type { ExamType } from 'shared';

interface Props {
  examType: ExamType;
  // A safe categorical (e.g. 'SN', 'LM') for audience-mix visibility —
  // never anything identifying. Absent for Brevet (no track).
  serie?: string;
}

// Mounted on the result page (a Server Component, so this side effect can't
// live there directly). Fires once per page load with how many searches
// this session took before landing here — never the result itself.
export function ResultOpenedTracker({ examType, serie }: Props) {
  useEffect(() => {
    trackResultOpened(consumeSearchAttempts(), examType, serie);
  }, [examType, serie]);

  return null;
}
