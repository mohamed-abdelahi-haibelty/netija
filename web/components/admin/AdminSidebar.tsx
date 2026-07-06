'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FileText, LogOut, ExternalLink, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

type Locale = 'ar' | 'fr';

interface AdminSidebarProps {
  lang: Locale;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

function SidebarNavItem({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
          : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
      )}
      aria-current={active ? 'page' : undefined}
    >
      <item.icon
        className={cn(
          'size-4 shrink-0',
          active ? 'text-sidebar-accent-foreground' : 'text-muted-foreground',
        )}
        aria-hidden
      />
      <span>{item.label}</span>
    </Link>
  );
}

export function AdminSidebar({ lang }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const navItems: NavItem[] = [
    {
      href: `/admin/${lang}/imports`,
      label: lang === 'ar' ? 'الاستيرادات' : 'Imports',
      icon: FileText,
    },
    {
      href: `/admin/${lang}/search-index`,
      label: lang === 'ar' ? 'فهرس البحث' : 'Search Index',
      icon: Search,
    },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  async function handleLogout() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    await fetch(`${apiUrl}/api/auth/sign-out`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => null); // best-effort; redirect regardless
    router.push(`/admin/${lang}/login`);
  }

  return (
    <aside
      className="hidden md:flex flex-col w-55 shrink-0 min-h-screen border-e bg-sidebar border-sidebar-border"
      aria-label={lang === 'ar' ? 'قائمة الإدارة' : 'Admin navigation'}
    >
      {/* ── Brand ── */}
      <div className="px-4 pt-5 pb-4 border-b border-sidebar-border">
        <Link href={`/admin/${lang}`} className="flex flex-col gap-0.5 group">
          <span className="text-sm font-semibold text-sidebar-foreground group-hover:text-sidebar-primary transition-colors duration-150">
            Netija
          </span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase">
            {lang === 'ar' ? 'الإدارة' : 'Administration'}
          </span>
        </Link>
      </div>

      {/* ── Nav ── */}
      <nav
        className="flex-1 px-2 py-3 space-y-0.5"
        aria-label={lang === 'ar' ? 'التنقل' : 'Navigation'}
      >
        {navItems.map((item) => (
          <SidebarNavItem
            key={item.href}
            item={item}
            active={isActive(item.href)}
          />
        ))}
      </nav>

      {/* ── Footer ── */}
      <div className="px-2 pb-4 pt-2 border-t border-sidebar-border space-y-0.5">
        <Link
          href={`/${lang}`}
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors duration-150"
        >
          <ExternalLink className="size-4 shrink-0" aria-hidden />
          <span>{lang === 'ar' ? 'العودة للموقع' : 'Back to site'}</span>
        </Link>
        <button
          type="button"
          onClick={() => {
            void handleLogout();
          }}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <LogOut className="size-4 shrink-0" aria-hidden />
          <span>{lang === 'ar' ? 'تسجيل الخروج' : 'Sign out'}</span>
        </button>
      </div>
    </aside>
  );
}
