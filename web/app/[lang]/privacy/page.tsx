import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from '@/lib/i18n/settings';
import { getTranslations } from '@/lib/i18n/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const i18n = await getTranslations(lang);
  return {
    title: `${i18n.t('privacy.title')} — Netija`,
    description: i18n.t('privacy.metaDescription'),
    robots: { index: true, follow: true },
    alternates: {
      canonical: `/${lang}/privacy`,
    },
  };
}

// A public, fully server-rendered, indexable informational page — the
// opposite of the result pages (which are noindex). Static i18n content
// only, no interactivity, so it stays a Server Component like the rest of
// the public site's informational surface.
export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  const i18n = await getTranslations(lang);
  const t = (key: string) => i18n.t(key);
  const storedList = i18n.t('privacy.storedList', { returnObjects: true }) as string[];

  return (
    <div className="mx-auto max-w-140 px-6 pt-[max(9vh,2.5rem)] max-sm:pt-[max(5vh,1.5rem)] pb-[max(5rem,env(safe-area-inset-bottom))]">
      <h1 className="font-heading text-[clamp(1.875rem,7vw,2.5rem)] font-bold leading-tight tracking-[-0.01em] text-foreground text-balance">
        {t('privacy.title')}
      </h1>

      <hr className="border-border mt-8 mb-8" />

      <div className="space-y-8">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {t('privacy.whatIsTitle')}
          </h2>
          <p className="text-base text-foreground text-pretty leading-relaxed">
            {t('privacy.whatIsBody')}
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {t('privacy.publishedTitle')}
          </h2>
          <p className="text-base text-foreground text-pretty leading-relaxed">
            {t('privacy.publishedBody')}
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {t('privacy.storedTitle')}
          </h2>
          <p className="text-base text-foreground text-pretty leading-relaxed mb-2">
            {t('privacy.storedIntro')}
          </p>
          <ul className="list-disc ps-5 space-y-1 text-base text-foreground">
            {storedList.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {t('privacy.notStoredTitle')}
          </h2>
          <p className="text-base text-foreground text-pretty leading-relaxed">
            {t('privacy.notStoredBody')}
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {t('privacy.usageTitle')}
          </h2>
          <p className="text-base text-foreground text-pretty leading-relaxed mb-3">
            {t('privacy.usageBody1')}
          </p>
          <p className="text-base text-foreground text-pretty leading-relaxed">
            {t('privacy.usageBody2')}
          </p>
        </section>
      </div>
    </div>
  );
}
