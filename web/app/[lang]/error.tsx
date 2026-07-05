'use client';
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
    // React error boundaries stop this from ever reaching window.onerror,
    // so Sentry never sees it unless reported explicitly here
    // (error-handling.md: "captured by Sentry via @sentry/nextjs").
    Sentry.captureException(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 text-center"
    >
      <h2 className="text-2xl font-bold">خطأ / Erreur</h2>
      {error.digest && (
        <p className="text-sm text-muted-foreground">ID: {error.digest}</p>
      )}
      <button
        onClick={unstable_retry}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
      >
        إعادة المحاولة / Réessayer
      </button>
    </div>
  );
}
