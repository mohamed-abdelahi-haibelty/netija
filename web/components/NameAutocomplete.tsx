'use client';

import { useState, useRef, useEffect, useId, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ApiClientError, apiRequest } from '@/lib/api';
import type { NameSearchSuggestion } from 'shared';

interface Props {
  lang: string;
  onSwitchToExam?: () => void;
}

export function NameAutocomplete({ lang, onSwitchToExam }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const listboxId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<NameSearchSuggestion[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [liveMessage, setLiveMessage] = useState('');

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [close]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  async function fetchSuggestions(q: string) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const id = ++requestIdRef.current;

    try {
      const data = await apiRequest<{ suggestions: NameSearchSuggestion[] }>(
        `/api/search/name?q=${encodeURIComponent(q)}`,
        { signal: ctrl.signal },
      );
      if (id !== requestIdRef.current) return;

      const hits = (data.suggestions ?? []).slice(0, 10);
      setSuggestions(hits);
      setActiveIndex(-1);
      setStatus('done');
      setOpen(true);
      setLiveMessage(
        hits.length === 0
          ? t('home.nameSearchNoResults')
          : t('home.nameSearchAnnounceResults', { count: hits.length }),
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (id !== requestIdRef.current) return;
      setStatus('error');
      setSuggestions([]);
      if (err instanceof ApiClientError) {
        setLiveMessage(err.message);
      } else if (err instanceof TypeError) {
        setLiveMessage(t('home.nameSearchErrorNetwork'));
      } else {
        setLiveMessage(t('home.errorGeneric'));
      }
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (val.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      setStatus('idle');
      abortRef.current?.abort();
      return;
    }

    setStatus('loading');
    setOpen(true);
    debounceRef.current = setTimeout(() => fetchSuggestions(val.trim()), 300);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (suggestions.length === 0) break;
        if (!open) {
          setOpen(true);
          setActiveIndex(0);
        } else {
          setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          select(suggestions[activeIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
    }
  }

  const handleClear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery('');
    setSuggestions([]);
    setOpen(false);
    setStatus('idle');
    setLiveMessage('');
    abortRef.current?.abort();
  }, []);

  const select = useCallback((s: NameSearchSuggestion) => {
    close();
    router.push(`/${lang}/students/${s.personId}`);
  }, [close, lang, router]);

  const displayName = (s: NameSearchSuggestion) =>
    lang === 'ar' ? (s.nameAr ?? s.nameFr ?? '—') : (s.nameFr ?? s.nameAr ?? '—');

  function highlightText(text: string, q: string): React.ReactNode {
    if (!q.trim() || !text) return text;
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    if (parts.length === 1) return text;
    return parts.map((part, i) =>
      i % 2 === 1
        ? <mark key={i} className="bg-transparent font-semibold text-accent p-0">{part}</mark>
        : part,
    );
  }

  const activeOptionId = activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined;

  return (
    <div ref={wrapperRef} className="flex flex-col gap-1.5">
      <Label htmlFor="name-search">{t('home.nameSearchInputLabel')}</Label>

      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {liveMessage}
      </div>

      <div className="relative">
        <Input
          id="name-search"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listboxId : undefined}
          aria-owns={open ? listboxId : undefined}
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          autoComplete="name"
          spellCheck={false}
          maxLength={100}
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={t('home.nameSearchPlaceholder')}
          className="h-12 text-base bg-card pe-10"
        />

        <button
          type="button"
          aria-label={t('home.inputClear')}
          aria-hidden={query ? undefined : 'true'}
          tabIndex={query ? 0 : -1}
          onPointerDown={(e) => e.preventDefault()}
          onClick={handleClear}
          className={`absolute end-1 top-1/2 -translate-y-1/2 p-2 rounded-sm text-muted-foreground hover:text-foreground active:opacity-60 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${query ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        >
          <X className="size-4" aria-hidden="true" />
        </button>

        {open && (
          <div className="absolute inset-x-0 top-full mt-1 z-50 rounded-lg border border-border shadow-md bg-card overflow-hidden animate-in fade-in-0 slide-in-from-top-1 duration-150">
            <div
              id={listboxId}
              role="listbox"
              aria-label={t('home.nameSearchInputLabel')}
              className="max-h-56 md:max-h-72 overflow-y-auto"
            >
              {status === 'loading' ? (
                <SkeletonRows />
              ) : status === 'error' ? (
                <div className="px-4 py-4 flex flex-col gap-3 items-center text-center">
                  <p className="text-sm text-muted-foreground">
                    {t('home.nameSearchErrorNetwork')}
                  </p>
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => { setStatus('loading'); fetchSuggestions(query.trim()); }}
                    className="text-sm text-primary underline underline-offset-2 hover:no-underline active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                  >
                    {t('common.retry')}
                  </button>
                </div>
              ) : suggestions.length === 0 ? (
                <div className="px-4 py-4 flex flex-col gap-2 text-center">
                  <p className="text-sm text-muted-foreground">
                    {t('home.nameSearchNoResults')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('home.nameSearchNoResultsGuidance')}
                  </p>
                  {onSwitchToExam && (
                    <button
                      type="button"
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={onSwitchToExam}
                      className="text-sm text-primary underline underline-offset-2 hover:no-underline active:opacity-70 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                    >
                      {t('home.nameSearchSwitchToExam')}
                    </button>
                  )}
                </div>
              ) : (
                suggestions.map((s, i) => (
                  <div
                    key={s.personId}
                    id={`${listboxId}-opt-${i}`}
                    role="option"
                    aria-selected={i === activeIndex}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      select(s);
                    }}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={[
                      'flex flex-col gap-0.5 px-4 py-3 cursor-pointer select-none',
                      'border-b border-border last:border-b-0',
                      'transition-colors active:bg-muted',
                      i === activeIndex ? 'bg-muted' : 'hover:bg-muted/60',
                    ].join(' ')}
                  >
                    <span
                      dir="auto"
                      className="text-sm font-medium text-foreground leading-snug break-words"
                    >
                      {highlightText(displayName(s), query)}
                    </span>
                    <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground" dir="ltr">
                      {(s.birthPlace ?? '') && (
                        <span className="break-words">
                          <span className="font-medium">{t('home.nameSearchMetaWilaya')}</span>
                          {': '}
                          {s.birthPlace}
                        </span>
                      )}
                      {(s.serie ?? '') && (
                        <span>
                          <span className="font-medium shrink-0">{t('home.nameSearchMetaSerie')}</span>
                          {': '}
                          <span className="break-words">{s.serie}</span>
                        </span>
                      )}
                      {s.latestYear != null && (
                        <span>
                          <span className="font-medium">{t('home.nameSearchMetaYear')}</span>
                          {': '}
                          {s.latestYear}
                        </span>
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <>
      {[72, 56, 64].map((w, i) => (
        <div key={i} className="px-4 py-3 border-b border-border last:border-b-0">
          <div
            className="h-3.5 rounded-sm bg-muted animate-pulse mb-1.5"
            style={{ width: `${w}%` }}
          />
          <div className="h-3 rounded-sm bg-muted/60 animate-pulse" style={{ width: '40%' }} />
        </div>
      ))}
    </>
  );
}
