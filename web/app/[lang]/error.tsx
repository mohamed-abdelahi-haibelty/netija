'use client';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as Sentry from '@sentry/nextjs';

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const { t } = useTranslation();
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
      <h2 className="font-heading text-[clamp(1.875rem,7vw,2.5rem)] font-bold leading-tight tracking-[-0.01em] text-foreground">
        {t('common.errorTitle')}
      </h2>
      {error.digest && (
        <p className="text-sm text-muted-foreground break-all max-w-full">ID: {error.digest}</p>
      )}
      <button
        onClick={unstable_retry}
        className="rounded-md bg-primary text-primary-foreground h-12 px-6 text-base font-medium hover:bg-primary/85 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t('common.retry')}
      </button>
    </div>
  );
}
