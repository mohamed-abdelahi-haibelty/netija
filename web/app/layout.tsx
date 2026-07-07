import type { Viewport } from 'next';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { AnalyticsInit } from '@/components/AnalyticsInit';
import { PostHogPageview } from '@/components/PostHogPageview';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AnalyticsInit />
      <Suspense fallback={null}>
        <PostHogPageview />
      </Suspense>
      {children}
    </>
  );
}
