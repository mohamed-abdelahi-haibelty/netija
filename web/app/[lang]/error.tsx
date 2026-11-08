'use client';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

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
    // (error-handling.md: "captured by Sentry via @sentry/nextjs"). Dynamic
    // import (same reasoning as instrumentation-client.ts): this component
    // is force-included in every route's eager bundle since React needs an
    // error boundary ready synchronously, but captureException only ever
    // runs on an actual crash — a rare path, worth the small async delay to
    // keep @sentry/nextjs out of every normal page load.
    void import('@sentry/nextjs').then(({ captureException }) => { captureException(error); });
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
