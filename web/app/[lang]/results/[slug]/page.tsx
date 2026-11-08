import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/i18n/settings";
import { fetchResult } from "./fetchResult";
import { ResultCardClient } from "./ResultCardClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!hasLocale(lang)) return {};
  const outcome = await fetchResult(slug);
  if (outcome.kind !== "ok") return {};
  const student = outcome.data;
  const name =
    lang === "ar"
      ? student.nameAr ?? student.nameFr
      : student.nameFr ?? student.nameAr;
  const isAr = lang === "ar";
  const moyenneText = student.moyenne ?? "—";
  const examYear = String(student.examYear);
  const description = name
    ? isAr
      ? `${name} — القرار: ${student.decision} — المعدل: ${moyenneText}/20 — سنة ${examYear}`
      : `${name} — Décision : ${student.decision} — Moyenne : ${moyenneText}/20 — Année ${examYear}`
    : isAr
      ? "نتيجة الامتحان الوطني — البكالوريا أو مسابقة ختم دروس الإعدادية"
      : "Résultat de l'examen national — Bac ou Brevet (BEPC)";
  return {
    title: name ? `${name} — Netija` : "Netija",
    description,
    robots: { index: false, follow: false },
    alternates: {
      canonical: `/${lang}/results/${slug}`,
    },
  };
}

// Thin server shell: validates the locale and hands off to ResultCardClient,
// which fetches and renders the actual result card in the browser (see its
// own comment for why — this route can never be output-cached the way the
// home page can, since every slug is genuinely unique). generateMetadata
// above keeps its own separate fetchResult() call for the social-preview
// meta tags, which do need to stay server-rendered.
export default async function ResultPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  if (!hasLocale(lang)) notFound();

  return (
    <div className="min-h-[calc(100vh-var(--nav-height))]">
      <div
        className="mx-auto max-w-140"
        style={{
          paddingLeft: 'max(1.5rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(1.5rem, env(safe-area-inset-right, 0px))',
          paddingTop: 'max(9vh, env(safe-area-inset-top, 0px))',
          paddingBottom: 'max(5rem, env(safe-area-inset-bottom, 0px))',
        }}
      >
        <ResultCardClient slug={slug} lang={lang} />
      </div>
    </div>
  );
}
