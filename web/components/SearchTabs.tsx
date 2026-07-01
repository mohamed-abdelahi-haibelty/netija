'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ApiClientError, apiRequest } from '@/lib/api';
import { Loader2, X } from 'lucide-react';
import { NameAutocomplete } from '@/components/NameAutocomplete';
import type { ExamSearchResult } from 'shared';

type TabId = 'exam' | 'name';

interface Props {
  lang: string;
  years: number[];
}

export function SearchTabs({ lang, years }: Props) {
  const { t } = useTranslation();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabId>('exam');
  const [examNo, setExamNo] = useState('');
  const [year, setYear] = useState(years[0]?.toString() ?? '');
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState<number | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  function handleTabChange(value: string) {
    setActiveTab(value as TabId);
    setFieldError(null);
    setNotFound(null);
  }

  function handleCancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }

  async function handleExamSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (abortRef.current) return;

    setFieldError(null);
    setNotFound(null);

    const trimmed = examNo.trim();
    if (!trimmed) {
      setFieldError(t('home.errorRequired'));
      return;
    }
    if (!/^\d+$/.test(trimmed)) {
      setFieldError(t('home.errorDigitsOnly'));
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const result = await apiRequest<ExamSearchResult>(
        `/api/search/exam?no=${encodeURIComponent(trimmed)}&year=${year}`,
        { signal: controller.signal },
      );
      router.push(`/${lang}/students/${result.personId}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof ApiClientError && err.code === 'STUDENT_NOT_FOUND') {
        setNotFound(Number(year));
      } else if (err instanceof TypeError) {
        setFieldError(t('home.errorNetwork'));
      } else if (err instanceof ApiClientError) {
        setFieldError(err.message);
      } else {
        setFieldError(t('home.errorGeneric'));
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <TabsList
        variant="line"
        aria-label={t('home.tabsLabel')}
        className="w-full justify-start rounded-none border-b border-border bg-transparent p-0 gap-0 group-data-horizontal/tabs:h-auto"
      >
        <TabsTrigger
          value="exam"
          className="rounded-none px-4 py-2.5 data-active:text-primary after:bg-primary"
        >
          {t('home.tabExam')}
        </TabsTrigger>
        <TabsTrigger
          value="name"
          className="rounded-none px-4 py-2.5 data-active:text-primary after:bg-primary"
        >
          {t('home.tabName')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="exam" className="pt-6">
        <form onSubmit={handleExamSubmit} noValidate className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <Label htmlFor="exam-no">{t('home.examLabel')}</Label>
              <span className="text-xs text-muted-foreground">{t('home.examHelp')}</span>
            </div>
            <span className="text-xs text-muted-foreground/60" dir="ltr">
              {t('home.examExample')}
            </span>
            <div className="relative">
              <Input
                id="exam-no"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                maxLength={12}
                value={examNo}
                onChange={(e) => {
                  setExamNo(e.target.value);
                  setFieldError(null);
                }}
                placeholder={t('home.examPlaceholder')}
                aria-invalid={fieldError ? 'true' : undefined}
                aria-describedby={fieldError ? 'exam-error' : undefined}
                className="h-12 text-base bg-card font-mono tabular-nums pe-10"
              />
              <button
                type="button"
                aria-label={t('home.inputClear')}
                aria-hidden={examNo ? undefined : 'true'}
                tabIndex={examNo ? 0 : -1}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => { setExamNo(''); setFieldError(null); setNotFound(null); }}
                className={`absolute end-1 top-1/2 -translate-y-1/2 p-2 rounded-sm text-muted-foreground hover:text-foreground active:opacity-60 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${examNo ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            {fieldError && (
              <p id="exam-error" role="alert" className="text-sm text-destructive break-words">
                {fieldError}
              </p>
            )}
          </div>

          {years.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exam-year">{t('home.yearLabel')}</Label>
              <Select value={year} onValueChange={(v) => { if (v) setYear(v); }}>
                <SelectTrigger id="exam-year" className="w-full h-12! text-base bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('home.noYears')}</p>
          )}

          <Button
            type={loading ? 'button' : 'submit'}
            onClick={loading ? handleCancel : undefined}
            disabled={loading ? false : years.length === 0}
            className="w-full h-12 text-base rounded-full"
          >
            <span className="inline-flex items-center gap-2">
              {loading && <Loader2 className="animate-spin size-4" aria-hidden="true" />}
              {loading ? t('home.cancel') : t('home.submit')}
            </span>
          </Button>

          {notFound !== null && (
            <div
              role="status"
              className="text-sm text-muted-foreground text-center animate-in fade-in-0 duration-200"
            >
              <p>{t('home.notFound', { year: notFound })}</p>
              <p className="mt-0.5">{t('home.notFoundSuggestion')}</p>
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setNotFound(null)}
                className="mt-3 text-sm text-primary underline underline-offset-2 hover:no-underline active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                {t('common.retry')}
              </button>
            </div>
          )}
        </form>
      </TabsContent>

      <TabsContent value="name" className="pt-6">
        <NameAutocomplete lang={lang} onSwitchToExam={() => setActiveTab('exam')} />
      </TabsContent>
    </Tabs>
  );
}
