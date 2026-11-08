"use client";

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { useTranslation } from "react-i18next";
import { apiRequest, ApiClientError, DEFAULT_RATE_LIMIT_RETRY_SECONDS } from "@/lib/api";
import type { StudentResult } from "shared";
import { StudentResultCard } from "@/components/StudentResultCard";
import { ResultOpenedTracker } from "@/components/ResultOpenedTracker";

type Status =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "ok"; data: StudentResult }
  | { kind: "error"; error: Error };

interface Props {
  slug: string;
  lang: string;
}

// Fetches and renders the result card entirely client-side — unlike the home
// page, this route can never benefit from server-side output caching (every
// visitor's slug is genuinely unique, the "cold-cache stampede" load-tests/
// README.md describes for results day), so the fix here isn't caching, it's
// moving the actual render cost off the server. page.tsx keeps its own
// separate server-side fetchResult() call for generateMetadata only (social
// link previews need real HTML meta tags — crawlers don't run JS), but the
// visible card is fetched and rendered here, in the browser, using the same
// public-facing apiRequest client (and so the same real-visitor-IP rate
// limiting) that SearchTabs/NameAutocomplete already use.
export function ResultCardClient({ slug, lang }: Props) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: "loading" });

    apiRequest<StudentResult>(`/api/results/${encodeURIComponent(slug)}`)
      .then((data) => {
        if (!cancelled) setStatus({ kind: "ok", data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiClientError) {
          if (err.code === "STUDENT_NOT_FOUND" || err.code === "VALIDATION_ERROR") {
            setStatus({ kind: "not_found" });
            return;
          }
          if (err.code === "RATE_LIMITED") {
            setStatus({
              kind: "rate_limited",
              retryAfterSeconds: err.retryAfterSeconds ?? DEFAULT_RATE_LIMIT_RETRY_SECONDS,
            });
            return;
          }
        }
        // Anything else is unexpected (network failure, 5xx, an
        // ApiClientError code we don't recognize) — stash it and throw
        // during the next render so React's nearest error.tsx boundary
        // catches it, same as error-handling.md requires for the SSR path.
        setStatus({ kind: "error", error: err instanceof Error ? err : new Error(String(err)) });
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (status.kind === "error") throw status.error;
  if (status.kind === "not_found") notFound();

  if (status.kind === "loading") {
    return (
      <div role="status" aria-live="polite" className="animate-pulse">
        <span className="sr-only">{t("student.loading")}</span>
        <div className="mb-10 h-10 w-3/4 rounded bg-muted" aria-hidden="true" />
        <div className="space-y-3">
          <div className="h-6 w-full rounded bg-muted" aria-hidden="true" />
          <div className="h-6 w-full rounded bg-muted" aria-hidden="true" />
          <div className="h-6 w-full rounded bg-muted" aria-hidden="true" />
          <div className="h-6 w-full rounded bg-muted" aria-hidden="true" />
        </div>
        <hr className="my-8 border-border" />
        <div className="h-10 w-40 rounded bg-muted" aria-hidden="true" />
      </div>
    );
  }

  if (status.kind === "rate_limited") {
    const isAr = lang === "ar";
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 text-center"
      >
        <h2 className="font-heading text-[clamp(1.875rem,7vw,2.5rem)] font-bold leading-tight tracking-[-0.01em] text-foreground">
          {isAr ? "عدد الزيارات مرتفع حالياً" : "Beaucoup de monde en ce moment"}
        </h2>
        <p className="text-muted-foreground max-w-100">
          {isAr
            ? `الكثير من الأشخاص يتحققون من نتائجهم الآن. يرجى الانتظار حوالي ${String(status.retryAfterSeconds)} ثانية ثم إعادة تحميل الصفحة.`
            : `Beaucoup de personnes consultent leurs résultats en ce moment. Merci de patienter environ ${String(status.retryAfterSeconds)} secondes puis de recharger la page.`}
        </p>
      </div>
    );
  }

  return (
    <>
      <ResultOpenedTracker
        examType={status.data.examType}
        serie={status.data.serie ?? undefined}
      />
      <StudentResultCard student={status.data} lang={lang} />
    </>
  );
}
