"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import type { StudentResult } from "shared";
import { PropertyRow } from "@/components/PropertyRow";

// ─── Decision helpers ─────────────────────────────────────────────

type DecisionKind = "pass" | "fail" | "pending" | "neutral";

function resolveKind(decision: string): DecisionKind {
  switch (decision.toLowerCase().trim()) {
    case "admis":
      return "pass";
    case "ajourné":
    case "ajourne":
      return "fail";
    case "sessionnaire":
      return "pending";
    default:
      return "neutral";
  }
}

function localizeDecision(decision: string, t: (k: string) => string): string {
  switch (decision.toLowerCase().trim()) {
    case "admis":
      return t("student.decisionAdmis");
    case "ajourné":
    case "ajourne":
      return t("student.decisionAjourne");
    case "sessionnaire":
      return t("student.decisionSessionnaire");
    default:
      return decision;
  }
}

// A quiet closing note, not a hero moment — kept out of KIND_TAG_CLASSES/
// motion entirely so it never competes with the moyenne or the confetti.
function localizeMotivation(
  kind: DecisionKind,
  t: (k: string) => string,
): string | null {
  switch (kind) {
    case "pass":
      return t("student.motivationAdmis");
    case "fail":
      return t("student.motivationAjourne");
    case "pending":
      return t("student.motivationSessionnaire");
    default:
      return null;
  }
}

// Notion-style select tag, tinted by decision
const KIND_TAG_CLASSES: Record<DecisionKind, string> = {
  pass: "bg-[var(--status-pass-bg)] text-[var(--status-pass-fg)]",
  fail: "bg-[var(--status-fail-bg)] text-[var(--status-fail-fg)]",
  pending: "bg-[var(--status-pending-bg)] text-[var(--status-pending-fg)]",
  neutral: "bg-muted text-muted-foreground",
};

// ─── Count-up hook ────────────────────────────────────────────────

function useCountUp(
  target: number | null,
  durationMs = 600,
  enabled = true,
): number {
  const [cur, setCur] = useState(0);

  useEffect(() => {
    if (!enabled || target === null) {
      setCur(target ?? 0);
      return;
    }
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setCur(target);
      return;
    }
    const targetValue = target;
    let raf: number;
    let start: number | null = null;
    function step(now: number) {
      if (start === null) start = now;
      const progress = Math.min((now - start) / durationMs, 1);
      setCur(Math.round(targetValue * progress * 100) / 100);
      if (progress < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [target, durationMs, enabled]);

  return cur;
}

// 8.4 → "08.40", 17.94 → "17.94"
function formatMoyenne(value: number): string {
  return value.toFixed(2).padStart(5, "0");
}

const BTN_CLASSES =
  "inline-flex items-center rounded-md border border-border px-3.5 py-1.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 transition-colors duration-150 cursor-pointer touch:min-h-[44px] touch:px-4 touch:py-2.5 touch:text-sm";

// ─── Main component ───────────────────────────────────────────────

export function StudentResultCard({
  student,
  lang,
}: {
  student: StudentResult;
  lang: string;
}) {
  const { t } = useTranslation();
  const isAr = lang === "ar";

  const kind = resolveKind(student.decision);
  const isPass = kind === "pass";
  const decisionLabel = localizeDecision(student.decision, t);
  const motivation = localizeMotivation(kind, t);

  const rawMoyenne =
    student.moyenne != null ? parseFloat(student.moyenne) : null;
  const countedMoyenne = useCountUp(rawMoyenne, 600, isPass);

  const moyenneNumber =
    rawMoyenne != null
      ? formatMoyenne(isPass ? countedMoyenne : rawMoyenne)
      : null;

  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  // Same "small and tasteful, never festive about a fail" rule as the
  // decision-tag spring/count-up above: one confetti burst, Admis only,
  // skipped entirely under prefers-reduced-motion. canvas-confetti is
  // dynamically imported so it's only ever downloaded for a passing result,
  // never added to the bundle a failing result's page has to fetch.
  const firedConfetti = useRef(false);
  useEffect(() => {
    if (!isPass || firedConfetti.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    firedConfetti.current = true;
    void import("canvas-confetti").then(({ default: confetti }) => {
      void confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.3 },
        colors: ["#000000", "#8fad88", "#ffa07a", "#1e5e2a"],
      });
    });
  }, [isPass]);

  function copyLink() {
    void navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => {
      setCopied(false);
    }, 1500);
  }

  // One name only: the current language's, falling back to the other
  const arName = {
    text: student.nameAr,
    lng: "ar",
    dir: "rtl" as const,
    font: "var(--font-thmanyah-serif-display)",
  };
  const frName = {
    text: student.nameFr,
    lng: "fr",
    dir: "ltr" as const,
    font: "var(--font-geist-sans)",
  };
  const name = isAr
    ? arName.text
      ? arName
      : frName
    : frName.text
    ? frName
    : arName;

  return (
    <div style={{ contain: "layout style" }}>
      {/* ── Name — current language, falling back to the other ── */}
      {name.text && (
        <header className="mb-10">
          <h1
            lang={name.lng}
            dir={name.dir}
            className="text-[clamp(1.875rem,7vw,2.5rem)] font-bold leading-tight tracking-[-0.01em] text-foreground text-balance break-words hyphens-auto max-w-full"
            style={{ fontFamily: name.font }}
          >
            {name.text}
          </h1>
        </header>
      )}

      {/* ── Properties — flat Notion rows ── */}
      <div>
        <PropertyRow label={t("student.examTypeLabel")}>
          <span className="inline-block whitespace-nowrap rounded bg-muted px-2 text-sm leading-6">
            {t(`home.examType_${student.examType}`)}
          </span>
        </PropertyRow>
        <PropertyRow label={t("student.examNoColumn")}>
          <span className="font-mono tabular-nums">{student.examNo}</span>
        </PropertyRow>
        <PropertyRow label={t("student.yearColumn")}>
          <span className="font-mono tabular-nums">{student.examYear}</span>
        </PropertyRow>
        {/* Serie is a Bac-only concept; Brevet has no track, so the row is
            omitted entirely rather than shown blank. */}
        {student.examType === "bac" && student.serie && (
          <PropertyRow label={t("student.serieLabel")}>
            <span className="inline-block rounded bg-muted px-2 font-mono text-sm leading-6">
              {student.serie}
            </span>
          </PropertyRow>
        )}
        <PropertyRow label={t("student.decisionLabel")}>
          <span
            className={`inline-block rounded px-2 text-sm leading-6 font-medium ${
              KIND_TAG_CLASSES[kind]
            } ${isPass ? "netija-tag-spring" : "netija-tag-fade"}`}
          >
            {decisionLabel}
          </span>
        </PropertyRow>
      </div>

      <hr className="my-8 border-border" />

      {/* ── Moyenne — plain text in the page body ── */}
      {moyenneNumber && (
        <div>
          <p className="mb-1.5 text-sm text-muted-foreground">
            {t("student.moyenneLabel")}
          </p>
          <p
            dir="ltr"
            className="text-[clamp(1.875rem,7vw,2.375rem)] font-bold leading-[1.2] tracking-[-0.02em] tabular-nums text-foreground"
          >
            {moyenneNumber}
            <span className="text-[0.5em] font-normal text-muted-foreground">
              {" "}
              {t("student.outOf20")}
            </span>
          </p>
        </div>
      )}

      {/* ── Motivational note — quiet text, never a banner ── */}
      {motivation && (
        <p className="mt-3 text-sm text-muted-foreground">{motivation}</p>
      )}

      {/* ── Quiet actions ── */}
      <div className="mt-11 flex gap-2">
        <button
          type="button"
          onClick={copyLink}
          className={BTN_CLASSES}
          aria-live="polite"
        >
          {copied ? t("student.linkCopied") : t("student.copyLink")}
        </button>
        <Link href={`/${lang}`} className={BTN_CLASSES}>
          {t("student.newSearch")}
        </Link>
      </div>
    </div>
  );
}
