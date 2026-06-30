import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from '@/lib/i18n/settings';
import type { StudentPageResponse } from 'shared';
import { StudentResultCard } from '@/components/StudentResultCard';
import { PageShell } from '@/components/PageShell';

async function fetchStudent(personId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
  const res = await fetch(`${baseUrl}/api/students/${encodeURIComponent(personId)}`, {
    next: { revalidate: 3600 },
  });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`Student API returned ${res.status}`);
  const body = (await res.json()) as StudentPageResponse;
  return body.data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; personId: string }>;
}): Promise<Metadata> {
  const { lang, personId } = await params;
  if (!hasLocale(lang)) return {};
  const student = await fetchStudent(personId);
  if (!student) return {};
  const name =
    lang === 'ar'
      ? (student.nameAr ?? student.nameFr)
      : (student.nameFr ?? student.nameAr);
  return { title: name ? `${name} — Netija` : 'Netija' };
}

export default async function StudentPage({
  params,
}: {
  params: Promise<{ lang: string; personId: string }>;
}) {
  const { lang, personId } = await params;
  if (!hasLocale(lang)) notFound();

  const student = await fetchStudent(personId);
  if (!student) notFound();

  return (
    <PageShell className="px-6 sm:px-10 py-10 sm:py-14">
      <StudentResultCard student={student} lang={lang} />
    </PageShell>
  );
}
