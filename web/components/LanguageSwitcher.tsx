'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { locales, type Locale } from '@/lib/i18n/settings';

interface Props {
  currentLocale: Locale;
}

export function LanguageSwitcher({ currentLocale }: Props) {
  const pathname = usePathname();
  const otherLocale = locales.find((l) => l !== currentLocale);
  if (!otherLocale) return null;

  const newPath = pathname.replace(
    new RegExp(`^/${currentLocale}(/|$)`),
    `/${otherLocale}$1`,
  );

  const label = otherLocale === 'ar' ? 'العربية' : 'Français';
  const switcherLabel = currentLocale === 'ar' ? 'تبديل اللغة' : 'Changer de langue';

  return (
    <nav aria-label={switcherLabel}>
      <Link
        href={newPath}
        hrefLang={otherLocale}
        lang={otherLocale}
        className="flex h-9 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors duration-short hover:text-foreground active:bg-muted/50 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
      </Link>
    </nav>
  );
}
