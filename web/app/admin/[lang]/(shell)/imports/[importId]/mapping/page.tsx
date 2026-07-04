'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  EyeOff,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiClientError, apiRequest } from '@/lib/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  CanonicalField,
  ImportPreviewColumn,
  ImportPreviewResult,
} from 'shared';

const CANONICAL_FIELDS: CanonicalField[] = [
  'exam_no',
  'name_fr',
  'name_ar',
  'serie',
  'moyenne',
  'decision',
];

const CURRENT_YEAR = new Date().getFullYear();
// Historical result files go back to 2015 (see worker/tests/fixtures/README.md).
const EARLIEST_YEAR = 2015;
const YEAR_OPTIONS = Array.from(
  { length: CURRENT_YEAR - EARLIEST_YEAR + 1 },
  (_, i) => CURRENT_YEAR - i,
);

type LoadStatus = 'loading' | 'loaded' | 'notFound' | 'unsupportedFileType' | 'error';

export default function MappingPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const rawParams = useParams();
  const lang = rawParams.lang as string;
  const importId = rawParams.importId as string;

  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [columns, setColumns] = useState<ImportPreviewColumn[]>([]);
  const [mapping, setMapping] = useState<Record<string, CanonicalField | null>>(
    {},
  );
  const [year, setYear] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const fieldLabel = useCallback(
    (field: CanonicalField): string => {
      switch (field) {
        case 'exam_no':
          return t('admin.mapping.fieldExamNo');
        case 'name_fr':
          return t('admin.mapping.fieldNameFr');
        case 'name_ar':
          return t('admin.mapping.fieldNameAr');
        case 'serie':
          return t('admin.mapping.fieldSerie');
        case 'moyenne':
          return t('admin.mapping.fieldMoyenne');
        case 'decision':
          return t('admin.mapping.fieldDecision');
      }
    },
    [t],
  );

  const load = useCallback(async () => {
    setLoadStatus('loading');
    try {
      const data = await apiRequest<ImportPreviewResult>(
        `/api/imports/${importId}/preview`,
        {
          credentials: 'include',
        },
      );
      setColumns(data.columns);
      setMapping(
        Object.fromEntries(
          data.columns.map((c) => [c.header, c.canonicalField]),
        ),
      );
      setLoadStatus('loaded');
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'IMPORT_NOT_FOUND') {
        setLoadStatus('notFound');
      } else if (err instanceof ApiClientError && err.code === 'UNSUPPORTED_FILE_TYPE') {
        setLoadStatus('unsupportedFileType');
      } else {
        setLoadStatus('error');
      }
    }
  }, [importId]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateMapping = useCallback((header: string, value: string) => {
    setMapping((prev) => ({
      ...prev,
      [header]: (value || null) as CanonicalField | null,
    }));
  }, []);

  // Mirrors worker/mapping.py's guaranteed-floor check (exam_no + at least
  // one name field) so the UI reacts instantly to a remap — the confirm
  // endpoint (task 019) is still the enforced source of truth server-side.
  const missingRequired = useMemo(() => {
    const mappedFields = new Set(
      Object.values(mapping).filter((v): v is CanonicalField => v !== null),
    );
    const missing: string[] = [];
    if (!mappedFields.has('exam_no'))
      missing.push(t('admin.mapping.missingExamNo'));
    if (!mappedFields.has('name_fr') && !mappedFields.has('name_ar')) {
      missing.push(t('admin.mapping.missingName'));
    }
    return missing;
  }, [mapping, t]);

  const hasFloorViolation = missingRequired.length > 0;
  const confirmDisabled = hasFloorViolation || !year || submitting;

  async function handleConfirm() {
    if (confirmDisabled) return;
    setSubmitting(true);
    setConfirmError(null);

    const payload = {
      mapping: Object.fromEntries(
        Object.entries(mapping).filter(
          (entry): entry is [string, CanonicalField] => entry[1] !== null,
        ),
      ),
      examYear: Number(year),
    };

    try {
      // Confirm's server route lands in task 019; the client already sends
      // the exact contract testing.md defines for it.
      await apiRequest(`/api/imports/${importId}/confirm`, {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      router.push(`/admin/${lang}/imports`);
    } catch {
      setConfirmError(t('admin.mapping.confirmError'));
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="mapping-title">
      <a
        href={`/admin/${lang}/imports`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 mb-5"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {t('admin.imports.pageTitle')}
      </a>

      <div className="mb-6">
        <h1
          id="mapping-title"
          className="text-lg font-semibold text-foreground tracking-tight"
        >
          {t('admin.mapping.pageTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('admin.mapping.subtitle')}
        </p>
      </div>

      {loadStatus === 'loading' && (
        <p
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('admin.mapping.loading')}
        </p>
      )}

      {loadStatus === 'notFound' && (
        <p role="alert" className="text-sm text-status-fail-fg">
          {t('admin.mapping.notFound')}
        </p>
      )}

      {loadStatus === 'unsupportedFileType' && (
        <p role="alert" className="text-sm text-status-fail-fg">
          {t('admin.mapping.unsupportedFileType')}
        </p>
      )}

      {loadStatus === 'error' && (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 text-sm text-status-fail-fg"
        >
          <p>{t('admin.mapping.loadError')}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="text-sm text-primary underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {loadStatus === 'loaded' && (
        <>
          {hasFloorViolation ? (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 rounded-md bg-status-fail-bg text-status-fail-fg px-4 py-3 text-sm"
            >
              <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden />
              <span>
                {t('admin.mapping.floorAlert', {
                  fields: missingRequired.join(', '),
                })}
              </span>
            </div>
          ) : (
            <div className="mb-5 flex items-center gap-2 text-sm text-status-pass-fg">
              <CheckCircle className="size-4 shrink-0" aria-hidden />
              <span>{t('admin.mapping.floorOk')}</span>
            </div>
          )}

          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-start font-medium text-muted-foreground"
                  >
                    {t('admin.mapping.colHeader')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-start font-medium text-muted-foreground"
                  >
                    {t('admin.mapping.colSamples')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-start font-medium text-muted-foreground w-56"
                  >
                    {t('admin.mapping.colTarget')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {columns.map((col) => {
                  const currentTarget = mapping[col.header] ?? '';
                  const isIgnoredByDetection = col.status === 'ignored';
                  const isUnrecognized = col.status === 'unrecognized';

                  return (
                    <tr
                      key={col.header}
                      className={cn(
                        'transition-colors duration-100 hover:bg-muted/50',
                        isUnrecognized && 'bg-(--status-pending-bg)/30',
                      )}
                    >
                      <td className="px-4 py-3">
                        <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-foreground">
                          {col.header}
                        </code>
                        {isUnrecognized && (
                          <span className="ms-1.5 text-[10px] font-semibold text-status-pending-fg uppercase tracking-wide">
                            {t('admin.mapping.unrecognized')}
                          </span>
                        )}
                        {isIgnoredByDetection && (
                          <span className="ms-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                            <EyeOff className="size-3" aria-hidden />
                            {t('admin.mapping.ignoredNotStored')}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {col.samples.map((s, si) => (
                            <span
                              key={si}
                              className="inline-block bg-muted text-muted-foreground text-xs px-1.5 py-0.5 rounded font-mono"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <select
                          aria-label={t('admin.mapping.targetAriaLabel', {
                            header: col.header,
                          })}
                          value={currentTarget}
                          onChange={(e) => {
                            updateMapping(col.header, e.target.value);
                          }}
                          className={cn(
                            'w-full h-8 px-2 rounded-md border text-sm',
                            'outline-none focus:ring-2 focus:ring-ring focus:border-ring',
                            'transition-shadow duration-150 bg-background',
                            currentTarget
                              ? 'border-border text-foreground'
                              : 'border-border text-muted-foreground',
                          )}
                        >
                          <option value="">
                            {t('admin.mapping.ignoreOption')}
                          </option>
                          {CANONICAL_FIELDS.map((f) => (
                            <option key={f} value={f}>
                              {fieldLabel(f)}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mb-6 max-w-xs space-y-1.5">
            <label
              htmlFor="examYear"
              className="block text-sm font-medium text-foreground"
            >
              {t('admin.mapping.yearLabel')}
            </label>
            <Select
              value={year}
              onValueChange={(v) => {
                if (v) setYear(v);
              }}
            >
              <SelectTrigger id="examYear" className="w-full h-10">
                <SelectValue placeholder={t('admin.mapping.yearPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {YEAR_OPTIONS.map((y) => (
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

          {confirmError && (
            <p role="alert" className="mb-3 text-sm text-status-fail-fg">
              {confirmError}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={confirmDisabled}
              aria-describedby={
                confirmDisabled ? 'confirm-blocked-note' : undefined
              }
              className={cn(
                'inline-flex items-center gap-2 h-10 px-5 rounded-md',
                'bg-primary text-primary-foreground text-sm font-medium',
                'hover:bg-primary/85 active:bg-primary/70 transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:pointer-events-none disabled:opacity-50',
              )}
            >
              {submitting && (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              )}
              {submitting ? '…' : t('admin.mapping.confirm')}
            </button>
            {confirmDisabled && !submitting && (
              <p
                id="confirm-blocked-note"
                className="text-sm text-muted-foreground"
              >
                {t('admin.mapping.confirmBlocked')}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
