'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X, Loader2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PersonRecord {
  nameFr: string | null;
  nameAr: string | null;
  year: number;
  serie: string | null;
  decision: string;
  birthDate: string | null;
  birthPlace: string | null;
  moyenne: string | null;
}

interface Suggestion {
  id: string;
  person1: PersonRecord;
  person2: PersonRecord;
  confidence: 'high' | 'medium' | 'low';
}

// ─── Mock data (TODO task 023: GET /api/admin/suggestions?status=pending) ─────

const MOCK_SUGGESTIONS: Suggestion[] = [
  {
    id: '1',
    confidence: 'high',
    person1: {
      nameFr: 'Mohamed Ould Ahmed',
      nameAr: 'محمد ولد أحمد',
      year: 2022,
      serie: 'TS',
      decision: 'Admis',
      birthDate: '01/01/2005',
      birthPlace: 'Nouakchott',
      moyenne: '15.25',
    },
    person2: {
      nameFr: 'Mohamed Ould Ahmed',
      nameAr: 'محمد ولد أحمد',
      year: 2023,
      serie: 'TS',
      decision: 'Ajourné',
      birthDate: '01/01/2005',
      birthPlace: 'Nouakchott',
      moyenne: '8.50',
    },
  },
  {
    id: '2',
    confidence: 'medium',
    person1: {
      nameFr: 'Fatima Mint Cheikh',
      nameAr: 'فاطمة منت الشيخ',
      year: 2021,
      serie: 'LM',
      decision: 'Sessionnaire',
      birthDate: '15/03/2003',
      birthPlace: 'Kiffa',
      moyenne: '9.75',
    },
    person2: {
      nameFr: 'Fatimata Mint Cheikh',
      nameAr: 'فاطمة منت الشيخ',
      year: 2022,
      serie: 'LM',
      decision: 'Admis',
      birthDate: '15/03/2003',
      birthPlace: 'Kiffa',
      moyenne: '12.00',
    },
  },
  {
    id: '3',
    confidence: 'low',
    person1: {
      nameFr: 'Abdellahi Ould Sidi',
      nameAr: 'عبد الله ولد سيدي',
      year: 2020,
      serie: 'SN',
      decision: 'Ajourné',
      birthDate: '08/08/2002',
      birthPlace: 'Nouadhibou',
      moyenne: '7.00',
    },
    person2: {
      nameFr: 'Abdellah Ould Sidi',
      nameAr: 'عبد الله ولد سيدي',
      year: 2021,
      serie: 'SN',
      decision: 'Admis',
      birthDate: '08/08/2002',
      birthPlace: 'Nouadhibou',
      moyenne: '11.50',
    },
  },
];

// ─── Decision badge (inline, no animation) ───────────────────────────────────

function DecisionChip({ decision }: { decision: string }) {
  const lower = decision.toLowerCase().trim();
  const cls =
    lower === 'admis'
      ? 'bg-status-pass-bg text-status-pass-fg'
      : lower === 'ajourné' || lower === 'ajourne'
      ? 'bg-status-fail-bg text-status-fail-fg'
      : lower === 'sessionnaire'
      ? 'bg-status-pending-bg text-status-pending-fg'
      : 'bg-status-neutral-bg text-status-neutral-fg';

  return (
    <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', cls)}>
      {decision}
    </span>
  );
}

// ─── Person card column ───────────────────────────────────────────────────────

function PersonColumn({
  person,
  label,
  t,
}: {
  person: PersonRecord;
  label: string;
  t: (k: string) => string;
}) {
  return (
    <div className="flex-1 min-w-0 space-y-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </p>

      {/* Names */}
      <div>
        {person.nameFr && (
          <p className="text-sm font-semibold text-foreground leading-snug">
            {person.nameFr}
          </p>
        )}
        {person.nameAr && (
          <p
            dir="rtl"
            lang="ar"
            className="text-sm text-muted-foreground leading-snug"
            style={{ fontFamily: 'var(--font-thmanyah-sans)' }}
          >
            {person.nameAr}
          </p>
        )}
      </div>

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="tabular-nums font-medium text-foreground">{person.year}</span>
        {person.serie && <span>·</span>}
        {person.serie && <span>{person.serie}</span>}
        <span>·</span>
        <DecisionChip decision={person.decision} />
        {person.moyenne && (
          <>
            <span>·</span>
            <span className="tabular-nums">{person.moyenne} / 20</span>
          </>
        )}
      </div>

      {/* Birth */}
      {(person.birthDate || person.birthPlace) && (
        <div className="text-xs text-muted-foreground">
          {[person.birthDate, person.birthPlace].filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  );
}

// ─── Confidence label ─────────────────────────────────────────────────────────

function ConfidencePip({ confidence }: { confidence: Suggestion['confidence'] }) {
  const colors = {
    high:   'bg-status-pass-fg',
    medium: 'bg-status-pending-fg',
    low:    'bg-status-neutral-fg',
  };
  const labels = { high: 'high', medium: 'medium', low: 'low' };

  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <span className={cn('size-1.5 rounded-full', colors[confidence])} aria-hidden />
      {labels[confidence]} match
    </span>
  );
}

// ─── Suggestion card ─────────────────────────────────────────────────────────

function SuggestionCard({
  suggestion,
  onAccept,
  onReject,
  t,
}: {
  suggestion: Suggestion;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  t: (k: string) => string;
}) {
  const [state, setState] = useState<'idle' | 'accepting' | 'rejecting'>('idle');

  async function handleAccept() {
    setState('accepting');
    // TODO (task 023): POST /api/admin/suggestions/:id/accept
    await new Promise((r) => setTimeout(r, 600));
    onAccept(suggestion.id);
  }

  async function handleReject() {
    setState('rejecting');
    // TODO (task 023): POST /api/admin/suggestions/:id/reject
    await new Promise((r) => setTimeout(r, 400));
    onReject(suggestion.id);
  }

  const busy = state !== 'idle';

  return (
    <article
      className="bg-card rounded-lg border border-border overflow-hidden transition-opacity duration-200"
      aria-label={`Merge suggestion: ${suggestion.person1.nameFr ?? ''} / ${suggestion.person2.nameFr ?? ''}`}
    >
      {/* ── Persons ── */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex gap-5">
          <PersonColumn
            person={suggestion.person1}
            label={t('admin.suggestions.person1')}
            t={t}
          />

          {/* Divider */}
          <div className="flex flex-col items-center gap-2 pt-6 shrink-0">
            <div className="w-px h-full bg-border" aria-hidden />
          </div>

          <PersonColumn
            person={suggestion.person2}
            label={t('admin.suggestions.person2')}
            t={t}
          />
        </div>

        <div className="mt-3">
          <ConfidencePip confidence={suggestion.confidence} />
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="px-5 py-3 bg-muted/30 border-t border-border flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleReject}
          disabled={busy}
          className={cn(
            'inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md text-sm font-medium',
            'border border-border text-muted-foreground',
            'hover:bg-muted hover:text-foreground transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          {state === 'rejecting' ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <X className="size-3.5" aria-hidden />
          )}
          {state === 'rejecting' ? t('admin.suggestions.rejecting') : t('admin.suggestions.reject')}
        </button>

        <button
          type="button"
          onClick={handleAccept}
          disabled={busy}
          className={cn(
            'inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md text-sm font-medium',
            'bg-primary text-primary-foreground',
            'hover:bg-primary/85 active:bg-primary/70 transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          {state === 'accepting' ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Check className="size-3.5" aria-hidden />
          )}
          {state === 'accepting' ? t('admin.suggestions.accepting') : t('admin.suggestions.accept')}
        </button>
      </div>
    </article>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuggestionsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Suggestion[]>(MOCK_SUGGESTIONS);

  function removeItem(id: string) {
    setItems((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <section aria-labelledby="suggestions-title">

      {/* ── Header ── */}
      <div className="mb-6">
        <h1
          id="suggestions-title"
          className="text-lg font-semibold text-foreground tracking-tight"
        >
          {t('admin.suggestions.pageTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('admin.suggestions.subtitle')}
        </p>
      </div>

      {/* ── Queue ── */}
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/50 py-16 text-center">
          <Users className="size-8 text-muted-foreground mx-auto mb-3" aria-hidden />
          <p className="text-sm font-medium text-foreground mb-1">
            {t('admin.suggestions.empty')}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('admin.suggestions.emptyBody')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              onAccept={removeItem}
              onReject={removeItem}
              t={t}
            />
          ))}
        </div>
      )}
    </section>
  );
}
