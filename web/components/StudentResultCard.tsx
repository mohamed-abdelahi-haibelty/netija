'use client';

import { useEffect, useMemo, useState, memo } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, ArrowRight, ChevronRight, ChevronLeft,
  Building2, MapPin,
} from 'lucide-react';
import type { StudentPageData, StudentAttempt } from 'shared';
import { PropertyRow } from '@/components/PropertyRow';

// ─── Decision helpers ─────────────────────────────────────────────

type DecisionKind = 'pass' | 'fail' | 'pending' | 'neutral';

function resolveKind(decision: string): DecisionKind {
  switch (decision.toLowerCase().trim()) {
    case 'admis':        return 'pass';
    case 'ajourné':
    case 'ajourne':      return 'fail';
    case 'sessionnaire': return 'pending';
    default:             return 'neutral';
  }
}

function localizeDecision(decision: string, t: (k: string) => string): string {
  switch (decision.toLowerCase().trim()) {
    case 'admis':        return t('student.decisionAdmis');
    case 'ajourné':
    case 'ajourne':      return t('student.decisionAjourne');
    case 'sessionnaire': return t('student.decisionSessionnaire');
    default:             return decision;
  }
}

// Small history badges — bordered, no bg tint
const KIND_BADGE_CLASSES: Record<DecisionKind, string> = {
  pass:    'border border-[var(--status-pass-fg)] text-[var(--status-pass-fg)]',
  fail:    'border border-[var(--status-fail-fg)] text-[var(--status-fail-fg)]',
  pending: 'border border-[var(--status-pending-fg)] text-[var(--status-pending-fg)]',
  neutral: 'border border-border text-muted-foreground',
};

// Hero decision — text only, no border, no bg
const KIND_HERO_CLASSES: Record<DecisionKind, string> = {
  pass:    'text-[var(--status-pass-fg)]',
  fail:    'text-[var(--status-fail-fg)]',
  pending: 'text-[var(--status-pending-fg)]',
  neutral: 'text-muted-foreground',
};

// ─── Count-up hook ────────────────────────────────────────────────

function useCountUp(target: number | null, durationMs = 600, enabled = true): number {
  const [cur, setCur] = useState(0);

  useEffect(() => {
    if (!enabled || target === null) {
      setCur(target ?? 0);
      return;
    }
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setCur(target);
      return;
    }
    let raf: number;
    let start: number | null = null;
    function step(now: number) {
      if (start === null) start = now;
      const progress = Math.min((now - start) / durationMs, 1);
      setCur(Math.round(target! * progress * 10) / 10);
      if (progress < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, enabled]);

  return cur;
}

const DecisionBadge = memo(function DecisionBadge({
  kind,
  label,
  animate = false,
  size = 'sm',
}: {
  kind: DecisionKind;
  label: string;
  animate?: boolean;
  size?: 'sm' | 'lg';
}) {
  const colorCls = size === 'lg' ? KIND_HERO_CLASSES[kind] : KIND_BADGE_CLASSES[kind];
  const animStyle =
    animate && kind === 'pass'
      ? { animation: 'netija-badge-spring 400ms var(--ease-spring) both' }
      : animate
      ? { animation: 'netija-badge-fade 200ms ease-out both' }
      : {};

  if (size === 'lg') {
    return (
      <span
        className={`text-4xl sm:text-5xl font-bold ${colorCls}`}
        style={animStyle}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorCls}`}
      style={animStyle}
    >
      {label}
    </span>
  );
});

// ─── History entry row ────────────────────────────────────────────

const HistoryEntry = memo(function HistoryEntry({
  attempt,
  isLatest,
  t,
}: {
  attempt: StudentAttempt;
  isLatest: boolean;
  t: (k: string) => string;
}) {
  const kind = resolveKind(attempt.decision);
  const label = localizeDecision(attempt.decision, t);

  return (
    <li
      className={[
        'flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 -mx-2 px-2 rounded-sm',
        isLatest
          ? 'bg-muted/30'
          : 'hover:bg-muted/30 transition-colors duration-100',
      ].join(' ')}
    >
      <span className="text-sm tabular-nums font-medium text-foreground w-11 shrink-0">
        {attempt.examYear}
      </span>
      <DecisionBadge kind={kind} label={label} />
      {attempt.moyenne != null && (
        <span className="text-sm tabular-nums text-muted-foreground">
          {attempt.moyenne} {t('student.outOf20')}
        </span>
      )}
      {attempt.serie && (
        <span className="text-sm text-muted-foreground ms-auto">{attempt.serie}</span>
      )}
      {attempt.school && (
        <span className="w-full ps-14 text-xs text-muted-foreground/70 break-words">
          {attempt.school}
        </span>
      )}
    </li>
  );
});

// ─── Main component ───────────────────────────────────────────────

const SEE_ALSO_LIMIT = 6;

export function StudentResultCard({
  student,
  lang,
}: {
  student: StudentPageData;
  lang: string;
}) {
  const { t } = useTranslation();
  const isAr = lang === 'ar';
  const [showAllSeeAlso, setShowAllSeeAlso] = useState(false);

  const attempts = useMemo(
    () => [...student.attempts].sort((a, b) => b.examYear - a.examYear),
    [student.attempts],
  );
  const latest = attempts[0] as StudentAttempt | undefined;

  const kind = latest ? resolveKind(latest.decision) : 'neutral';
  const isPass = kind === 'pass';
  const decisionLabel = latest ? localizeDecision(latest.decision, t) : '—';

  const rawMoyenne = latest?.moyenne != null ? parseFloat(latest.moyenne) : null;
  const countedMoyenne = useCountUp(rawMoyenne, 600, isPass);

  const moyenneNumber =
    rawMoyenne != null
      ? isPass
        ? countedMoyenne.toFixed(1)
        : parseFloat(latest!.moyenne!).toFixed(1)
      : null;

  const primary = isAr
    ? { text: student.nameAr, lng: 'ar', dir: 'rtl' as const, font: 'var(--font-thmanyah-serif-display)' }
    : { text: student.nameFr, lng: 'fr', dir: 'ltr' as const, font: 'var(--font-geist-sans)' };
  const secondary = isAr
    ? { text: student.nameFr, lng: 'fr', dir: 'ltr' as const, font: 'var(--font-geist-sans)' }
    : { text: student.nameAr, lng: 'ar', dir: 'rtl' as const, font: 'var(--font-thmanyah-serif-display)' };

  const BackIcon    = isAr ? ArrowRight : ArrowLeft;
  const ForwardIcon = isAr ? ChevronLeft : ChevronRight;

  const visibleSeeAlso = showAllSeeAlso
    ? student.seeAlso
    : student.seeAlso.slice(0, SEE_ALSO_LIMIT);
  const hiddenCount = student.seeAlso.length - SEE_ALSO_LIMIT;

  return (
    <div className="flex flex-col gap-5">

      {/* ── Breadcrumb — outside card ── */}
      <Link
        href={`/${lang}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 w-fit"
      >
        <BackIcon className="size-3.5" aria-hidden />
        {t('student.backHome')}
      </Link>

      {/* ── Result card ── */}
      <div className="bg-card rounded-xl shadow-level-1 p-8 sm:p-10" style={{ contain: 'layout style' }}>

        {/* ── Name ── */}
        <header className="mb-8">
          {primary.text && (
            <h1
              lang={primary.lng}
              dir={primary.dir}
              className="text-[2.5rem] sm:text-[3.5rem] font-bold leading-[1.05] tracking-[-0.03em] text-foreground text-balance break-words hyphens-auto"
              style={{ fontFamily: primary.font }}
            >
              {primary.text}
            </h1>
          )}
          {secondary.text && (
            <p
              lang={secondary.lng}
              dir={secondary.dir}
              className="mt-2 text-xl font-semibold leading-snug tracking-[-0.01em] text-muted-foreground text-balance break-words hyphens-auto"
              style={{ fontFamily: secondary.font }}
            >
              {secondary.text}
            </p>
          )}
        </header>

        {/* ── Decision + moyenne ── */}
        {latest ? (
          <div className="mb-8 flex flex-col items-center text-center gap-3">
            <DecisionBadge kind={kind} label={decisionLabel} animate size="lg" />
            {moyenneNumber && (
              <div className="flex flex-col items-center gap-0.5">
                <p className="tabular-nums leading-none">
                  <span className="text-3xl font-bold text-foreground">{moyenneNumber}</span>
                  <span className="ms-1.5 text-base font-normal text-muted-foreground">{t('student.outOf20')}</span>
                </p>
                <p className="text-sm text-muted-foreground">{t('student.moyenneLabel')}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="mb-8 text-sm text-muted-foreground">{t('student.noAttempts')}</p>
        )}

        {/* ── Properties ── */}
        {latest && (latest.serie || latest.school || latest.wilaya) && (
          <>
            <hr className="border-border mb-3" />
            <div className="flex flex-col mb-8">
              {latest.serie && (
                <PropertyRow label={t('student.serieLabel')}>
                  {latest.serie}
                </PropertyRow>
              )}
              {latest.school && (
                <PropertyRow icon={Building2} label={t('student.schoolLabel')}>
                  {latest.school}
                </PropertyRow>
              )}
              {latest.wilaya && (
                <PropertyRow icon={MapPin} label={t('student.wilayaLabel')}>
                  {latest.wilaya}
                </PropertyRow>
              )}
            </div>
          </>
        )}

        {/* ── History ── */}
        {attempts.length > 0 && (
          <>
            <hr className="border-border mb-3" />
            <section aria-labelledby="history-title" className="mb-8">
              <h2
                id="history-title"
                className="text-sm font-medium text-muted-foreground mb-2"
              >
                {t('student.historyTitle')}
              </h2>
              <ul className="flex flex-col divide-y divide-border">
                {attempts.map((a, idx) => (
                  <HistoryEntry
                    key={`${a.examYear}-${a.examNo}`}
                    attempt={a}
                    isLatest={idx === 0}
                    t={t}
                  />
                ))}
              </ul>
            </section>
          </>
        )}

        {/* ── See also ── */}
        {student.seeAlso.length > 0 && (
          <>
            <hr className="border-border mb-3" />
            <section aria-labelledby="see-also-title">
              <h2
                id="see-also-title"
                className="text-sm font-medium text-muted-foreground mb-1"
              >
                {t('student.seeAlsoTitle')}
              </h2>
              <p className="text-sm text-muted-foreground mb-3">
                {t('student.seeAlsoBody')}
              </p>
              <ul className="flex flex-col gap-1">
                {visibleSeeAlso.map((entry) => {
                  const name = isAr
                    ? (entry.nameAr ?? entry.nameFr)
                    : (entry.nameFr ?? entry.nameAr);
                  return (
                    <li key={entry.personId}>
                      <Link
                        href={`/${lang}/students/${entry.personId}`}
                        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
                      >
                        <span className="break-words min-w-0">{name ?? t('student.seeAlsoLink', { year: entry.examYear })}</span>
                        <span className="text-xs shrink-0">({entry.examYear})</span>
                        <ForwardIcon className="size-3.5" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {hiddenCount > 0 && !showAllSeeAlso && (
                <button
                  type="button"
                  onClick={() => setShowAllSeeAlso(true)}
                  className="mt-2 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
                >
                  {t('student.seeAlsoShowMore', { count: hiddenCount })}
                </button>
              )}
            </section>
          </>
        )}

      </div>
    </div>
  );
}
