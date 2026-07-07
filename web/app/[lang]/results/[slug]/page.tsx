import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/i18n/settings";
import type { StudentPageResponse } from "shared";
import { StudentResultCard } from "@/components/StudentResultCard";
import { ResultOpenedTracker } from "@/components/ResultOpenedTracker";

async function fetchResult(slug: string) {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
  const res = await fetch(
    `${baseUrl}/api/results/${encodeURIComponent(slug)}`,
    {
      next: { revalidate: 3600 },
    },
  );
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`Result API returned ${String(res.status)}`);
  const body = (await res.json()) as StudentPageResponse;
  return body.data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!hasLocale(lang)) return {};
  const student = await fetchResult(slug);
  if (!student) return {};
  const name =
    lang === "ar"
      ? student.nameAr ?? student.nameFr
      : student.nameFr ?? student.nameAr;
  return { title: name ? `${name} — Netija` : "Netija" };
}

export default async function ResultPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  if (!hasLocale(lang)) notFound();

  const student = await fetchResult(slug);
  if (!student) notFound();

  return (
    <div className="min-h-[calc(100vh-var(--nav-height))] flex flex-col">
      <ResultOpenedTracker
        examType={student.examType}
        serie={student.serie ?? undefined}
      />
      <div className="flex-1 flex flex-col justify-center px-6 pt-0 pb-[9vh] sm:py-[9vh]">
        <div className="mx-auto w-full max-w-140">
          <StudentResultCard student={student} lang={lang} />
        </div>
      </div>
    </div>
  );
}
