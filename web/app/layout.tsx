import type { ReactNode } from 'react';
import { AnalyticsInit } from '@/components/AnalyticsInit';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AnalyticsInit />
      {children}
    </>
  );
}
