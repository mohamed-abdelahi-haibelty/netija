import Link from 'next/link';
import { Plus, Download, ChevronRight, AlertCircle } from 'lucide-react';
import { hasLocale } from '@/lib/i18n/settings';
import { notFound } from 'next/navigation';
import { getTranslations } from '@/lib/i18n/server';
import { ImportStatusBadge, type ImportStatus } from '@/components/admin/ImportStatusBadge';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Import {
  id: string;
  fileName: string;
  examYear: number | null;
  status: ImportStatus;
  progress: number | null;
  insertedCount: number | null;
  rejectedCount: number | null;
  newPeopleCount: number | null;
  smokePassed: boolean | null;
  published: boolean;
  failureReason: string | null;
  createdAt: string;
}

// ─── Mock data (TODO task 024: replace with GET /api/admin/imports) ───────────

const MOCK_IMPORTS: Import[] = [
  {
    id: '3',
    fileName: 'bac_2024_preview.xlsx',
    examYear: 2024,
    status: 'mapped',
    progress: null,
    insertedCount: null,
    rejectedCount: null,
    newPeopleCount: null,
    smokePassed: null,
    published: false,
    failureReason: null,
    createdAt: '2025-12-01T09:00:00Z',
  },
  {
    id: '2',
    fileName: 'bac_2023_resultats_v2.xlsx',
    examYear: 2023,
    status: 'processing',
    progress: 67,
    insertedCount: null,
    rejectedCount: null,
    newPeopleCount: null,
    smokePassed: null,
    published: false,
    failureReason: null,
    createdAt: '2024-11-20T14:15:00Z',
  },
  {
    id: '1',
    fileName: 'bac_2022_resultats.xlsx',
    examYear: 2022,
    status: 'done',
    progress: 100,
    insertedCount: 45823,
    rejectedCount: 127,
    newPeopleCount: 12405,
    smokePassed: true,
    published: true,
    failureReason: null,
    createdAt: '2024-08-15T10:30:00Z',
  },
  {
    id: '4',
    fileName: 'bac_2021_bad_format.xlsx',
    examYear: 2021,
    status: 'failed',
    progress: null,
    insertedCount: null,
    rejectedCount: null,
    newPeopleCount: null,
    smokePassed: null,
    published: false,
    failureReason: 'MISSING_REQUIRED_COLUMNS',
    createdAt: '2023-09-10T16:45:00Z',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string, lang: string) {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-MR' : 'fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

function formatCount(n: number, lang: string) {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-MR' : 'fr-FR').format(n);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ImportRow({
  imp,
  striped,
  lang,
  statusLabel,
  t,
}: {
  imp: Import;
  striped: boolean;
  lang: string;
  statusLabel: Record<ImportStatus, string>;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <tr
      className={cn(
        'transition-colors duration-100',
        striped ? 'bg-muted/20' : '',
        'hover:bg-muted/40',
      )}
    >
      {/* File + date */}
      <td className="px-4 py-3 max-w-55">
        <p className="font-medium text-foreground truncate" title={imp.fileName}>
          {imp.fileName}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
          {formatDate(imp.createdAt, lang)}
        </p>
      </td>

      {/* Year */}
      <td className="px-4 py-3 text-foreground tabular-nums">
        {imp.examYear ?? '—'}
      </td>

      {/* Status + progress */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1.5">
          <ImportStatusBadge
            status={imp.status}
            label={statusLabel[imp.status]}
          />
          {imp.status === 'processing' && imp.progress != null && (
            <div className="flex items-center gap-2">
              <div
                className="relative h-1 w-24 rounded-full bg-border overflow-hidden"
                role="progressbar"
                aria-valuenow={imp.progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${imp.progress}%`}
              >
                <div
                  className="absolute inset-y-0 inset-s-0 bg-secondary rounded-full transition-all duration-500"
                  style={{ width: `${imp.progress}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {imp.progress}%
              </span>
            </div>
          )}
          {imp.status === 'failed' && imp.failureReason && (
            <span className="inline-flex items-center gap-1 text-xs text-status-fail-fg">
              <AlertCircle className="size-3 shrink-0" aria-hidden />
              {imp.failureReason}
            </span>
          )}
        </div>
      </td>

      {/* Summary */}
      <td className="px-4 py-3">
        {imp.insertedCount != null ? (
          <div className="flex flex-col gap-0.5 text-xs">
            <span className="text-foreground tabular-nums">
              {t('admin.imports.summaryInserted', { count: formatCount(imp.insertedCount, lang) })}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {t('admin.imports.summaryRejected', { count: formatCount(imp.rejectedCount ?? 0, lang) })}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {t('admin.imports.summaryNewPeople', { count: formatCount(imp.newPeopleCount ?? 0, lang) })}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* Smoke */}
      <td className="px-4 py-3">
        {imp.smokePassed === true && (
          <span className="text-xs font-medium text-status-pass-fg">
            {t('admin.imports.smokePassed')}
          </span>
        )}
        {imp.smokePassed === false && (
          <span className="text-xs font-medium text-status-fail-fg">
            {t('admin.imports.smokeFailed')}
          </span>
        )}
        {imp.smokePassed === null && (
          <span className="text-muted-foreground">
            {t('admin.imports.smokeNone')}
          </span>
        )}
      </td>

      {/* Published */}
      <td className="px-4 py-3">
        <span
          className={cn(
            'text-xs font-medium',
            imp.published
              ? 'text-status-pass-fg'
              : 'text-muted-foreground',
          )}
        >
          {imp.published
            ? t('admin.imports.publishedYes')
            : t('admin.imports.publishedNo')}
        </span>
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          {imp.status === 'done' && imp.rejectedCount != null && imp.rejectedCount > 0 && (
            <a
              href={`/api/admin/imports/${imp.id}/rejects`}
              className={cn(
                'inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium',
                'border border-border text-muted-foreground',
                'hover:bg-muted hover:text-foreground transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
              download
            >
              <Download className="size-3" aria-hidden />
              {t('admin.imports.downloadRejects')}
            </a>
          )}
          {(imp.status === 'mapped' || imp.status === 'pending') && (
            <Link
              href={`/admin/${lang}/imports/${imp.id}/mapping`}
              className={cn(
                'inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium',
                'border border-border text-muted-foreground',
                'hover:bg-muted hover:text-foreground transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              {t('admin.imports.openMapping')}
              <ChevronRight className="size-3" aria-hidden />
            </Link>
          )}
        </div>
      </td>
    </tr>
  );
}

function EmptyState({ lang, t }: { lang: string; t: (key: string) => string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/50 py-16 text-center">
      <p className="text-sm font-medium text-foreground mb-1">
        {t('admin.imports.empty')}
      </p>
      <p className="text-sm text-muted-foreground mb-5">
        {t('admin.imports.emptyBody')}
      </p>
      <Link
        href={`/admin/${lang}/imports/upload`}
        className={cn(
          'inline-flex items-center gap-1.5 h-8 px-4 rounded-full',
          'bg-primary text-primary-foreground text-sm font-medium',
          'hover:bg-primary/85 transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <Plus className="size-3.5" aria-hidden />
        {t('admin.imports.newUpload')}
      </Link>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ImportsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  const i18n = await getTranslations(lang);
  const t = (key: string, vars?: Record<string, string | number>) =>
    i18n.t(key, vars);

  const statusLabel: Record<ImportStatus, string> = {
    pending:    t('admin.imports.statusPending'),
    mapped:     t('admin.imports.statusMapped'),
    confirmed:  t('admin.imports.statusConfirmed'),
    processing: t('admin.imports.statusProcessing'),
    done:       t('admin.imports.statusDone'),
    failed:     t('admin.imports.statusFailed'),
  };

  const imports = MOCK_IMPORTS;

  return (
    <section aria-labelledby="imports-title">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <h1
          id="imports-title"
          className="text-lg font-semibold text-foreground tracking-tight"
        >
          {t('admin.imports.pageTitle')}
        </h1>
        <Link
          href={`/admin/${lang}/imports/upload`}
          className={cn(
            'inline-flex items-center gap-1.5 h-8 px-3 rounded-full',
            'bg-primary text-primary-foreground text-sm font-medium',
            'hover:bg-primary/85 active:bg-primary/70 transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <Plus className="size-3.5" aria-hidden />
          {t('admin.imports.newUpload')}
        </Link>
      </div>

      {/* ── Table ── */}
      {imports.length === 0 ? (
        <EmptyState lang={lang} t={t} />
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th scope="col" className="px-4 py-2.5 text-start font-medium text-muted-foreground whitespace-nowrap">
                    {t('admin.imports.colFile')}
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium text-muted-foreground whitespace-nowrap">
                    {t('admin.imports.colYear')}
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium text-muted-foreground whitespace-nowrap">
                    {t('admin.imports.colStatus')}
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium text-muted-foreground whitespace-nowrap">
                    {t('admin.imports.colSummary')}
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium text-muted-foreground whitespace-nowrap">
                    {t('admin.imports.colSmoke')}
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium text-muted-foreground whitespace-nowrap">
                    {t('admin.imports.colPublished')}
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-end font-medium text-muted-foreground whitespace-nowrap">
                    {t('admin.imports.colActions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {imports.map((imp, idx) => (
                  <ImportRow
                    key={imp.id}
                    imp={imp}
                    striped={idx % 2 === 1}
                    lang={lang}
                    statusLabel={statusLabel}
                    t={t}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
