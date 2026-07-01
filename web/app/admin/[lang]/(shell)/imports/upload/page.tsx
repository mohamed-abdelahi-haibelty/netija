'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Upload, FileSpreadsheet, X, Loader2, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACCEPTED_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 10 }, (_, i) => CURRENT_YEAR - i);

type DateFormat = 'DMY' | 'MDY' | 'ISO';

export default function UploadPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const rawParams = useParams();
  const lang = (rawParams?.lang as string) ?? 'fr';
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [year, setYear] = useState<string>('');
  const [dateFormat, setDateFormat] = useState<DateFormat>('DMY');
  const [isDragOver, setIsDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function validateFile(f: File): string | null {
    if (!ACCEPTED_TYPES.includes(f.type) && !f.name.match(/\.(xlsx|xls)$/i)) {
      return t('admin.upload.dropzoneInvalid');
    }
    if (f.size > MAX_BYTES) {
      return t('admin.upload.dropzoneInvalid');
    }
    return null;
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const f = files[0]!;
    const err = validateFile(f);
    if (err) {
      setFileError(err);
      setFile(null);
    } else {
      setFileError(null);
      setFile(f);
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !year) {
      setFormError(t('admin.upload.errorRequired'));
      return;
    }
    setFormError(null);
    setSubmitting(true);

    try {
      const body = new FormData();
      body.append('file', file);
      body.append('examYear', year);
      body.append('dateFormat', dateFormat);

      // TODO (task 014): POST /api/admin/imports/upload
      const res = await fetch('/api/admin/imports/upload', {
        method: 'POST',
        body,
        credentials: 'include',
      });

      if (res.ok) {
        const { data } = await res.json() as { data: { importId: string } };
        router.push(`/admin/${lang}/imports/${data.importId}/mapping`);
        return;
      }
      if (res.status === 415 || res.status === 413 || res.status === 400) {
        const body2 = await res.json().catch(() => null);
        setFormError(body2?.error?.message ?? t('admin.upload.dropzoneInvalid'));
      } else {
        setFormError(t('admin.upload.dropzoneInvalid'));
      }
    } catch {
      setFormError(t('admin.upload.dropzoneInvalid'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="upload-title" className="max-w-xl">

      {/* ── Back ── */}
      <a
        href={`/admin/${lang}/imports`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 mb-5"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {t('admin.imports.pageTitle')}
      </a>

      <h1
        id="upload-title"
        className="text-lg font-semibold text-foreground tracking-tight mb-6"
      >
        {t('admin.upload.pageTitle')}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── Dropzone ── */}
        <div>
          <div
            role="button"
            tabIndex={0}
            aria-label={t('admin.upload.dropzoneLabel')}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
            }}
            className={cn(
              'relative flex flex-col items-center justify-center gap-3',
              'h-40 rounded-lg border-2 border-dashed cursor-pointer',
              'transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isDragOver
                ? 'border-secondary bg-secondary/10'
                : file
                ? 'border-border bg-muted/30'
                : 'border-border bg-card hover:border-muted-foreground/40 hover:bg-muted/20',
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="sr-only"
              aria-hidden
              onChange={(e) => handleFiles(e.target.files)}
            />

            {file ? (
              <>
                <FileSpreadsheet className="size-8 text-secondary" aria-hidden />
                <div className="text-center px-4">
                  <p className="text-sm font-medium text-foreground truncate max-w-70">
                    {file.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(file.size / 1024 / 1024).toFixed(1)} Mo
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Retirer le fichier"
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="absolute top-2 inset-e-2 p-1 rounded text-muted-foreground hover:text-foreground transition-colors duration-150"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </>
            ) : (
              <>
                <Upload
                  className={cn(
                    'size-8 transition-colors duration-150',
                    isDragOver ? 'text-secondary' : 'text-muted-foreground',
                  )}
                  aria-hidden
                />
                <div className="text-center">
                  <p className="text-sm text-foreground">
                    {t('admin.upload.dropzoneLabel')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('admin.upload.dropzoneOr')}{' '}
                    <span className="text-secondary font-medium">
                      {t('admin.upload.dropzoneBrowse')}
                    </span>
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('admin.upload.dropzoneConstraints')}
                </p>
              </>
            )}
          </div>
          {fileError && (
            <p role="alert" className="mt-1.5 text-xs text-status-fail-fg">
              {fileError}
            </p>
          )}
        </div>

        {/* ── Year ── */}
        <div className="space-y-1.5">
          <label htmlFor="examYear" className="block text-sm font-medium text-foreground">
            {t('admin.upload.yearLabel')}
          </label>
          <select
            id="examYear"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className={cn(
              'w-full h-10 px-3 rounded-md border border-border bg-background',
              'text-sm text-foreground',
              'outline-none focus:ring-2 focus:ring-ring focus:border-ring',
              'transition-shadow duration-150',
              !year && 'text-muted-foreground',
            )}
          >
            <option value="" disabled>
              {t('admin.upload.yearPlaceholder')}
            </option>
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </div>

        {/* ── Date format ── */}
        <fieldset>
          <legend className="text-sm font-medium text-foreground mb-2">
            {t('admin.upload.dateFormatLabel')}
          </legend>
          <div className="flex flex-wrap gap-2">
            {(['DMY', 'MDY', 'ISO'] as DateFormat[]).map((fmt) => (
              <label
                key={fmt}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-md border text-sm cursor-pointer',
                  'transition-colors duration-150',
                  dateFormat === fmt
                    ? 'border-primary bg-primary/5 text-foreground font-medium'
                    : 'border-border text-muted-foreground hover:border-muted-foreground/50',
                )}
              >
                <input
                  type="radio"
                  name="dateFormat"
                  value={fmt}
                  checked={dateFormat === fmt}
                  onChange={() => setDateFormat(fmt)}
                  className="sr-only"
                />
                {t(`admin.upload.dateFormat${fmt}`)}
              </label>
            ))}
          </div>
        </fieldset>

        {/* ── Form error ── */}
        {formError && (
          <p role="alert" className="text-sm text-status-fail-fg">
            {formError}
          </p>
        )}

        {/* ── Actions ── */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={submitting}
            className={cn(
              'inline-flex items-center gap-2 h-9 px-5 rounded-full',
              'bg-primary text-primary-foreground text-sm font-medium',
              'hover:bg-primary/85 active:bg-primary/70 transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-60',
            )}
          >
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {submitting ? t('admin.upload.submitting') : t('admin.upload.submit')}
          </button>
          <a
            href={`/admin/${lang}/imports`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
          >
            {t('admin.upload.cancel')}
          </a>
        </div>
      </form>
    </section>
  );
}
