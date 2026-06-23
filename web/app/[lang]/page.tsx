import { notFound } from 'next/navigation';
import { hasLocale } from '@/lib/i18n/settings';
import { getTranslations } from '@/lib/i18n/server';

export default async function HomePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  if (!hasLocale(lang)) notFound();

  const i18n = await getTranslations(lang);

  return (
    <section className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8">
      <h1 className="text-3xl font-bold">{i18n.t('common.greeting')}</h1>
    </section>
  );
}
