'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { capturePageview } from '@/lib/analytics';

// App Router client-side navigations never trigger a native page load, so
// PostHog's own pageview autocapture (which listens for that) misses them —
// this fires a manual $pageview on every route change instead, which is
// also the only way to attach `locale` to it. Wrapped in <Suspense> at the
// call site because useSearchParams requires one.
export function PostHogPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    capturePageview(pathname, searchParams.toString());
  }, [pathname, searchParams]);

  return null;
}
