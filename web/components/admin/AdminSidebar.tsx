'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Database, FileText, LogOut, ExternalLink, Menu, Search, X } from 'lucide-react';
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

function SidebarNav({
  lang,
  navItems,
  isActive,
  scrollable,
}: {
  lang: Locale;
  navItems: NavItem[];
  isActive: (href: string) => boolean;
  scrollable?: boolean;
}) {
  return (
    <nav
      className={cn('flex-1 px-2 py-3 space-y-0.5', scrollable && 'overflow-y-auto')}
      aria-label={lang === 'ar' ? 'التنقل' : 'Navigation'}
    >
      {navItems.map((item) => (
        <SidebarNavItem key={item.href} item={item} active={isActive(item.href)} />
      ))}
    </nav>
  );
}

function SidebarFooter({
  lang,
  onNavigate,
  onLogout,
}: {
  lang: Locale;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="px-2 pb-4 pt-2 border-t border-sidebar-border space-y-0.5">
      <Link
        href={`/${lang}`}
        onClick={onNavigate}
        className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors duration-150"
      >
        <ExternalLink className="size-4 shrink-0" aria-hidden />
        <span>{lang === 'ar' ? 'العودة للموقع' : 'Back to site'}</span>
      </Link>
      <button
        type="button"
        onClick={onLogout}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <LogOut className="size-4 shrink-0" aria-hidden />
        <span>{lang === 'ar' ? 'تسجيل الخروج' : 'Sign out'}</span>
      </button>
    </div>
  );
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
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

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
    {
      href: `/admin/${lang}/cache`,
      label: lang === 'ar' ? 'التخزين المؤقت' : 'Cache',
      icon: Database,
    },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  // Close drawer on navigation
  useEffect(() => {
    close();
  }, [pathname, close]);

  // Focus trap: return focus to close button when drawer opens
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleLogout = useCallback(async () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    await fetch(`${apiUrl}/api/auth/sign-out`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => null);
    router.push(`/admin/${lang}/login`);
  }, [router, lang]);

  return (
    <>
      {/* ── Mobile header bar ── */}
      <div className="md:hidden flex items-center justify-between px-4 h-12 border-b border-sidebar-border bg-sidebar shrink-0">
        <Link
          href={`/admin/${lang}`}
          className="text-sm font-semibold text-sidebar-foreground"
        >
          Netija
          <span className="ms-1.5 text-[11px] font-medium text-muted-foreground tracking-wide uppercase">
            {lang === 'ar' ? 'الإدارة' : 'Admin'}
          </span>
        </Link>
        <button
          type="button"
          onClick={() => { setOpen(true); }}
          aria-label={lang === 'ar' ? 'فتح القائمة' : 'Open menu'}
          aria-expanded={open}
          aria-controls={drawerId}
          className="flex items-center justify-center size-10 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </div>

      {/* ── Mobile drawer overlay ── */}
      {open && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          onClick={close}
          aria-hidden="true"
        >
          {/* Scrim */}
          <div className="absolute inset-0 bg-foreground/20 animate-in fade-in-0 duration-150" />
        </div>
      )}

      {/* ── Mobile drawer ── */}
      <aside
        id={drawerId}
        role="dialog"
        aria-modal="true"
        aria-label={lang === 'ar' ? 'قائمة الإدارة' : 'Admin navigation'}
        className={cn(
          'fixed inset-y-0 start-0 z-50 w-55 flex flex-col bg-sidebar border-e border-sidebar-border md:hidden',
          'transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full',
        )}
      >
        {/* ── Drawer header ── */}
        <div className="flex items-center justify-between px-4 pt-4 pb-4 border-b border-sidebar-border">
          <Link href={`/admin/${lang}`} className="flex flex-col gap-0.5 group">
            <span className="text-sm font-semibold text-sidebar-foreground group-hover:text-sidebar-primary transition-colors duration-150">
              Netija
            </span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase">
              {lang === 'ar' ? 'الإدارة' : 'Administration'}
            </span>
          </Link>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label={lang === 'ar' ? 'إغلاق القائمة' : 'Close menu'}
            className="flex items-center justify-center size-10 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <SidebarNav lang={lang} navItems={navItems} isActive={isActive} scrollable />
        <SidebarFooter lang={lang} onNavigate={close} onLogout={() => void handleLogout()} />
      </aside>

      {/* ── Desktop sidebar (unchanged) ── */}
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

        <SidebarNav lang={lang} navItems={navItems} isActive={isActive} />
        <SidebarFooter lang={lang} onLogout={() => void handleLogout()} />
      </aside>
    </>
  );
}
