'use client';

import { useTranslation } from 'react-i18next';
import { EXAM_TYPES, type ExamType } from 'shared';

interface Props {
  examType: ExamType;
  // Optional (defaulted to a no-op below) so page.tsx's static Suspense
  // fallback — rendered from a Server Component, which cannot pass event
  // handler props to a Client Component — can render this without one; the
  // fallback is replaced by the real, interactive HomeSearchSection before
  // hydration completes.
  onSelect?: (type: ExamType) => void;
}

// Chooses Bac vs Brevet for the whole search experience. Purely controlled —
// the caller owns examType and decides what a selection means (state update,
// URL sync, etc.) via onSelect; this component has no navigation/router
// awareness of its own. Kept deliberately quiet (a text tab switcher, like the
// search tabs) rather than a loud segmented control.
export function ExamTypeSwitcher({ examType, onSelect = () => {} }: Props) {
  const { t } = useTranslation();

  return (
    <div className="mb-6">
      <div role="group" aria-label={t('home.examTypeLabel')} className="flex flex-wrap items-center gap-1">
        {EXAM_TYPES.map((type) => {
          const active = type === examType;
          return (
            <button
              key={type}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (active) return;
                onSelect(type);
              }}
              className={[
                'h-9 rounded-md px-3 text-sm transition-colors duration-short',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'active:scale-[0.96]',
                active
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground active:bg-muted/50',
              ].join(' ')}
            >
              {t(`home.examType_${type}`)}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground text-pretty">
        {t(`home.examTypeHelp_${examType}`)}
      </p>
    </div>
  );
}
