import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { hasLocale } from '@/lib/i18n/settings';
import { getTranslations } from '@/lib/i18n/server';

interface TeamMember {
  name: string;
  role: string;
  linkedin: string;
  // Optional: only Mohamed has a public TikTok where he posts about this
  // project (among others he builds) — not every member needs one.
  tiktok?: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const i18n = await getTranslations(lang);
  return {
    title: `${i18n.t('team.title')} — Netija`,
    description: i18n.t('team.metaDescription'),
    robots: { index: true, follow: true },
    alternates: {
      canonical: `/${lang}/team`,
    },
  };
}

// Deliberately minimal per the task brief: name, role, LinkedIn link — no
// photos, no bios. Fully server-rendered i18n content, like /privacy.
export default async function TeamPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  const i18n = await getTranslations(lang);
  const t = (key: string) => i18n.t(key);
  const members = i18n.t('team.members', { returnObjects: true }) as TeamMember[];

  return (
    <div className="mx-auto max-w-140 px-6 pt-[max(9vh,2.5rem)] max-sm:pt-[max(5vh,1.5rem)] pb-[max(5rem,env(safe-area-inset-bottom))]">
      <h1 className="font-heading text-[clamp(1.875rem,7vw,2.5rem)] font-bold leading-tight tracking-[-0.01em] text-foreground text-balance">
        {t('team.title')}
      </h1>

      <hr className="border-border mt-8 mb-2" />

      <ul className="divide-y divide-border">
        {members.map((member) => (
          <li key={member.name} className="flex items-center justify-between gap-4 py-5">
            <div>
              <p className="text-base font-semibold text-foreground">{member.name}</p>
              <p className="text-sm text-muted-foreground">{member.role}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={member.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={i18n.t('team.linkedinAriaLabel', { name: member.name })}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 transition-colors duration-150"
              >
                {t('team.linkedinLabel')}
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
              {member.tiktok && (
                <a
                  href={member.tiktok}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={i18n.t('team.tiktokAriaLabel', { name: member.name })}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 transition-colors duration-150"
                >
                  {t('team.tiktokLabel')}
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
