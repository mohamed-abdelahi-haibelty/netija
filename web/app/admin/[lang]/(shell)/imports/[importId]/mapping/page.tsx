'use client';

import { useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle, ChevronLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type CanonicalField =
  | 'nom_fr'
  | 'nom_ar'
  | 'no_examen'
  | 'moyenne'
  | 'decision'
  | 'serie'
  | 'wilaya'
  | 'etablissement'
  | 'date_naissance'
  | 'lieu_naissance'
  | 'nni'
  | '__ignore__';

interface DetectedColumn {
  header: string;
  samples: string[];
  suggestedTarget: CanonicalField | null;
  recognized: boolean;
  required: boolean;
}

// ─── Mock preview data (TODO task 018: GET /api/admin/imports/:id/preview) ───

const FIELD_LABELS: Record<CanonicalField, string> = {
  nom_fr:          'Nom complet (FR)',
  nom_ar:          'Nom complet (AR)',
  no_examen:       'N° d\'examen',
  moyenne:         'Moyenne',
  decision:        'Décision',
  serie:           'Série',
  wilaya:          'Wilaya',
  etablissement:   'Établissement',
  date_naissance:  'Date de naissance',
  lieu_naissance:  'Lieu de naissance',
  nni:             'NNI',
  __ignore__:      'Ignorer',
};

const REQUIRED_FIELDS: CanonicalField[] = ['no_examen', 'decision', 'serie'];

const MOCK_COLUMNS: DetectedColumn[] = [
  { header: 'NOM', samples: ['Ahmed Mohamed', 'Fatima Mint Hassan', 'Moussa Ould Diallo'], suggestedTarget: 'nom_fr', recognized: true, required: false },
  { header: 'NUMERO', samples: ['04938', '12045', '00234'], suggestedTarget: 'no_examen', recognized: true, required: true },
  { header: 'NOTE', samples: ['14.50', '8.25', '17.00'], suggestedTarget: 'moyenne', recognized: true, required: false },
  { header: 'RESULTAT', samples: ['ADMIS', 'AJOURNÉ', 'ADMIS'], suggestedTarget: 'decision', recognized: true, required: true },
  { header: 'SERIE', samples: ['SN', 'LM', 'TM'], suggestedTarget: 'serie', recognized: true, required: true },
  { header: 'DATE_NAISS', samples: ['01/01/2005', '15/03/2004', '22/07/2006'], suggestedTarget: 'date_naissance', recognized: true, required: false },
  { header: 'ETABLISSEMENT', samples: ['Lycée de Nouakchott', 'Lycée de Rosso', '—'], suggestedTarget: 'etablissement', recognized: true, required: false },
  { header: 'REGION_ADMIN', samples: ['NORD', 'SUD', 'EST'], suggestedTarget: null, recognized: false, required: false },
  { header: 'CODE_INTERNE', samples: ['A001', 'B203', 'C112'], suggestedTarget: null, recognized: false, required: false },
];

const CANONICAL_FIELDS: CanonicalField[] = [
  'nom_fr', 'nom_ar', 'no_examen', 'moyenne', 'decision', 'serie',
  'wilaya', 'etablissement', 'date_naissance', 'lieu_naissance', 'nni', '__ignore__',
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function MappingPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const rawParams = useParams();
  const lang = (rawParams?.lang as string) ?? 'fr';
  const importId = (rawParams?.importId as string) ?? '';
  const [submitting, setSubmitting] = useState(false);

  const [mapping, setMapping] = useState<Record<string, CanonicalField | null>>(() =>
    Object.fromEntries(MOCK_COLUMNS.map((c) => [c.header, c.suggestedTarget])),
  );

  const updateMapping = useCallback((header: string, value: CanonicalField | null) => {
    setMapping((prev) => ({ ...prev, [header]: value }));
  }, []);

  const assignedRequired = REQUIRED_FIELDS.filter((f) =>
    Object.values(mapping).includes(f),
  );
  const missingRequired = REQUIRED_FIELDS.filter((f) => !assignedRequired.includes(f));
  const hasFloorViolation = missingRequired.length > 0;

  async function handleConfirm() {
    if (hasFloorViolation) return;
    setSubmitting(true);

    try {
      // TODO (task 018): POST /api/admin/imports/:id/confirm-mapping
      const res = await fetch(`/api/admin/imports/${importId}/confirm-mapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mapping }),
      });

      if (res.ok) {
        router.push(`/admin/${lang}/imports`);
      }
    } catch {
      // stay on page
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="mapping-title">

      {/* ── Back ── */}
      <a
        href={`/admin/${lang}/imports`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 mb-5"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {t('admin.imports.pageTitle')}
      </a>

      {/* ── Header ── */}
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

      {/* ── Floor violation alert ── */}
      {hasFloorViolation && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-md bg-status-fail-bg text-status-fail-fg px-4 py-3 text-sm"
        >
          <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden />
          <span>
            {t('admin.mapping.floorAlert', {
              fields: missingRequired
                .map((f) => FIELD_LABELS[f])
                .join(', '),
            })}
          </span>
        </div>
      )}

      {!hasFloorViolation && (
        <div className="mb-5 flex items-center gap-2 text-sm text-status-pass-fg">
          <CheckCircle className="size-4 shrink-0" aria-hidden />
          <span>Tous les champs obligatoires sont mappés.</span>
        </div>
      )}

      {/* ── Mapping table ── */}
      <div className="rounded-lg border border-border bg-card overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th scope="col" className="px-4 py-2.5 text-start font-medium text-muted-foreground">
                  {t('admin.mapping.colHeader')}
                </th>
                <th scope="col" className="px-4 py-2.5 text-start font-medium text-muted-foreground">
                  {t('admin.mapping.colSamples')}
                </th>
                <th scope="col" className="px-4 py-2.5 text-start font-medium text-muted-foreground w-56">
                  {t('admin.mapping.colTarget')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {MOCK_COLUMNS.map((col, idx) => {
                const currentTarget = mapping[col.header];
                const isIgnored = currentTarget === '__ignore__';
                const isUnrecognized = !col.recognized && !currentTarget;

                return (
                  <tr
                    key={col.header}
                    className={cn(
                      'transition-colors duration-100',
                      idx % 2 === 1 ? 'bg-muted/20' : '',
                      isUnrecognized && 'bg-(--status-pending-bg)/30',
                      isIgnored && 'opacity-50',
                    )}
                  >
                    {/* Header */}
                    <td className="px-4 py-3">
                      <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-foreground">
                        {col.header}
                      </code>
                      {col.required && (
                        <span className="ms-1.5 text-[10px] font-semibold text-status-fail-fg uppercase tracking-wide">
                          requis
                        </span>
                      )}
                      {isUnrecognized && (
                        <span className="ms-1.5 text-[10px] font-semibold text-status-pending-fg uppercase tracking-wide">
                          {t('admin.mapping.unrecognized')}
                        </span>
                      )}
                    </td>

                    {/* Samples */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {col.samples.slice(0, 3).map((s, si) => (
                          <span
                            key={si}
                            className="inline-block bg-muted text-muted-foreground text-xs px-1.5 py-0.5 rounded font-mono"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Target selector */}
                    <td className="px-4 py-3">
                      <select
                        aria-label={`Cible pour ${col.header}`}
                        value={currentTarget ?? ''}
                        onChange={(e) =>
                          updateMapping(
                            col.header,
                            (e.target.value as CanonicalField) || null,
                          )
                        }
                        className={cn(
                          'w-full h-8 px-2 rounded-md border text-sm',
                          'outline-none focus:ring-2 focus:ring-ring focus:border-ring',
                          'transition-shadow duration-150 bg-background',
                          currentTarget && currentTarget !== '__ignore__'
                            ? 'border-border text-foreground'
                            : 'border-border text-muted-foreground',
                        )}
                      >
                        <option value="">— {t('admin.mapping.unrecognized')} —</option>
                        {CANONICAL_FIELDS.map((f) => (
                          <option key={f} value={f}>
                            {FIELD_LABELS[f]}
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
      </div>

      {/* ── Confirm ── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={hasFloorViolation || submitting}
          aria-describedby={hasFloorViolation ? 'floor-violation-note' : undefined}
          className={cn(
            'inline-flex items-center gap-2 h-9 px-5 rounded-full',
            'bg-primary text-primary-foreground text-sm font-medium',
            'hover:bg-primary/85 active:bg-primary/70 transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {submitting ? '…' : t('admin.mapping.confirm')}
        </button>
        {hasFloorViolation && (
          <p id="floor-violation-note" className="text-sm text-muted-foreground">
            {t('admin.mapping.confirmBlocked')}
          </p>
        )}
      </div>
    </section>
  );
}
