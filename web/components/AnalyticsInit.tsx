'use client';

import { useEffect } from 'react';
import { initAnalytics } from '@/lib/analytics';

// Mounted once in the true root layout (app/layout.tsx) so it covers both
// the public site and admin — a useEffect on mount runs after hydration,
// keeping PostHog's load off the critical rendering path
// (code-standards.md: "no blocking third-party scripts").
export function AnalyticsInit() {
  useEffect(() => {
    initAnalytics();
  }, []);

  return null;
}
