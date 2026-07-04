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
import { ApiClientError, apiRequest, DEFAULT_RATE_LIMIT_RETRY_SECONDS } from '@/lib/api';
import { Loader2 } from 'lucide-react';
import { NameAutocomplete } from '@/components/NameAutocomplete';
import { ClearButton } from '@/components/ClearButton';
import type { ExamSearchResult } from 'shared';

type TabId = 'exam' | 'name';

interface Props {
  lang: string;
  years: number[];
  yearsError?: boolean;
}

export function SearchTabs({ lang, years, yearsError }: Props) {
  const { t } = useTranslation();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabId>('exam');
  const [examNo, setExamNo] = useState('');
  const [year, setYear] = useState(years[0]?.toString() ?? '');
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState<number | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [rateLimitedFor, setRateLimitedFor] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Ticks the rate-limit countdown down to zero, one second at a time.
  useEffect(() => {
    if (rateLimitedFor === null) return;
    if (rateLimitedFor <= 0) {
      setRateLimitedFor(null);
      return;
    }
    const timer = setTimeout(() => {
      setRateLimitedFor((seconds) => (seconds === null ? null : seconds - 1));
    }, 1000);
    return () => { clearTimeout(timer); };
  }, [rateLimitedFor]);

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
      router.push(`/${lang}/results/${result.slug}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof ApiClientError && err.code === 'STUDENT_NOT_FOUND') {
        setNotFound(Number(year));
      } else if (err instanceof ApiClientError && err.code === 'RATE_LIMITED') {
        setRateLimitedFor(err.retryAfterSeconds ?? DEFAULT_RATE_LIMIT_RETRY_SECONDS);
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
        className="w-fit justify-start bg-transparent p-0 gap-1 group-data-horizontal/tabs:h-auto"
      >
        <TabsTrigger
          value="exam"
          className="h-11 rounded-md px-3 after:hidden data-active:bg-muted data-active:text-foreground"
        >
          {t('home.tabExam')}
        </TabsTrigger>
        <TabsTrigger
          value="name"
          className="h-11 rounded-md px-3 after:hidden data-active:bg-muted data-active:text-foreground"
        >
          {t('home.tabName')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="exam" className="pt-6">
        <form onSubmit={(e) => { void handleExamSubmit(e); }} noValidate className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <Label htmlFor="exam-no" className="text-sm font-normal text-muted-foreground">
                {t('home.examLabel')}
              </Label>
              <span className="text-xs text-muted-foreground">{t('home.examHelp')}</span>
            </div>
            <span className="text-xs text-muted-foreground" dir="ltr">
              {t('home.examExample')}
            </span>
            <div className="relative">
              <Input
                id="exam-no"
                type="text"
                dir="ltr"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                maxLength={12}
                aria-required="true"
                value={examNo}
                onChange={(e) => {
                  setExamNo(e.target.value);
                  setFieldError(null);
                }}
                placeholder={t('home.examPlaceholder')}
                aria-invalid={fieldError ? 'true' : undefined}
                aria-describedby={fieldError ? 'exam-error' : undefined}
                className="h-12 rounded-md bg-transparent text-base font-mono tabular-nums text-left rtl:text-right pe-12"
              />
              <ClearButton
                label={t('home.inputClear')}
                visible={!!examNo}
                onClick={() => { setExamNo(''); setFieldError(null); setNotFound(null); }}
              />
            </div>
            {fieldError && (
              <p id="exam-error" role="alert" className="text-sm text-destructive break-words">
                {fieldError}
              </p>
            )}
          </div>

          {years.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exam-year" className="text-sm font-normal text-muted-foreground">
                {t('home.yearLabel')}
              </Label>
              <Select value={year} onValueChange={(v) => { if (v) setYear(v); }}>
                <SelectTrigger id="exam-year" className="w-full h-12! rounded-md bg-transparent text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {years.map((y) => (
                    <SelectItem
                      key={y}
                      value={String(y)}
                      className="focus:bg-muted! focus:text-foreground!"
                    >
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : yearsError ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm text-muted-foreground">{t('home.yearsError')}</p>
              <button
                type="button"
                onPointerDown={(e) => { e.preventDefault(); }}
                onClick={() => { router.refresh(); }}
                className="self-start text-sm text-primary underline underline-offset-2 hover:no-underline active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                {t('common.retry')}
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('home.noYears')}</p>
          )}

          <Button
            type={loading ? 'button' : 'submit'}
            onClick={loading ? handleCancel : undefined}
            disabled={
              loading ? false : years.length === 0 || (rateLimitedFor !== null && rateLimitedFor > 0)
            }
            className="w-full h-12 text-base rounded-md"
          >
            <span className="inline-flex items-center gap-2">
              {loading && <Loader2 className="animate-spin size-4" aria-hidden="true" />}
              {loading ? t('home.cancel') : t('home.submit')}
            </span>
          </Button>

          {rateLimitedFor !== null && (
            <p role="alert" className="text-sm text-destructive break-words">
              {t('home.rateLimited')}
              {rateLimitedFor > 0 && ` — ${t('home.rateLimitedRetry', { seconds: rateLimitedFor })}`}
            </p>
          )}

          <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); }}
            onClick={() => { setActiveTab('name'); }}
            className="self-start text-sm text-primary underline underline-offset-2 hover:no-underline active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            {t('home.examSwitchToName')}
          </button>

          {notFound !== null && (
            <div
              role="status"
              className="text-sm text-muted-foreground animate-in fade-in-0 duration-200"
            >
              <p>{t('home.notFound', { year: notFound })}</p>
              <p className="mt-0.5">{t('home.notFoundSuggestion')}</p>
              <button
                type="button"
                onPointerDown={(e) => { e.preventDefault(); }}
                onClick={() => { setNotFound(null); }}
                className="mt-3 text-sm text-primary underline underline-offset-2 hover:no-underline active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                {t('common.retry')}
              </button>
            </div>
          )}
        </form>
      </TabsContent>

      <TabsContent value="name" className="pt-6">
        <NameAutocomplete lang={lang} onSwitchToExam={() => { setActiveTab('exam'); }} />
      </TabsContent>
    </Tabs>
  );
}
