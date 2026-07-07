'use client';

import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { EXAM_TYPES, type ExamType } from 'shared';

interface Props {
  lang: string;
  examType: ExamType;
}

// Chooses Bac vs Brevet for the whole search experience. The type is the URL's
// source of truth (?type=), so selecting one navigates rather than holding
// local state — a refreshed or shared link reproduces the exact type. Kept
// deliberately quiet (a text tab switcher, like the search tabs) rather than a
// loud segmented control.
export function ExamTypeSwitcher({ lang, examType }: Props) {
  const { t } = useTranslation();
  const router = useRouter();

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
              onPointerDown={(e) => { e.preventDefault(); }}
              onClick={() => {
                if (active) return;
                router.replace(`/${lang}?type=${type}`, { scroll: false });
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
