'use client';
import { useEffect } from 'react';
import '@/app/globals.css';

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
    // Same reasoning as app/[lang]/error.tsx: a React error boundary
    // swallows this before it ever reaches window.onerror. Dynamic import
    // keeps @sentry/nextjs out of every route's eager bundle — it's a
    // rarely-hit path (an actual crash), see error.tsx for the full
    // rationale.
    void import('@sentry/nextjs').then(({ captureException }) => { captureException(error); });
  }, [error]);

  return (
    <html lang="ar" dir="rtl" className="antialiased">
      <body className="m-0 p-0 bg-background text-foreground font-sans">
        <div
          role="alert"
          className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center"
        >
          <h1 className="font-heading text-[clamp(1.875rem,7vw,2.5rem)] font-bold leading-tight tracking-[-0.01em] text-foreground">
            {error.digest ? (
              <>
                خطأ عام / Erreur Globale
                <span className="block mt-2 text-sm font-normal text-muted-foreground break-all max-w-full">
                  ID: {error.digest}
                </span>
              </>
            ) : (
              'خطأ عام / Erreur Globale'
            )}
          </h1>
          <button
            onClick={unstable_retry}
            className="rounded-md bg-primary text-primary-foreground h-12 px-6 text-base font-medium hover:bg-primary/85 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            إعادة المحاولة / Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
