import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { locales, defaultLocale } from '@/lib/i18n/settings';

function getLocale(request: NextRequest): string {
  const acceptLanguage = request.headers.get('accept-language') ?? '';
  for (const segment of acceptLanguage.split(',')) {
    const lang = segment.split(';')[0]?.trim().slice(0, 2).toLowerCase();
    if (lang && (locales as readonly string[]).includes(lang)) return lang;
  }
  return defaultLocale;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Admin routes live at /admin/[lang]/ — skip locale injection entirely.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return;
  }

  // Next.js API route handlers (e.g. app/api/internal/*) are never
  // locale-prefixed — skip them the same way admin routes are skipped.
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return;
  }

  const pathnameHasLocale = (locales as readonly string[]).some(
    (locale) =>
      pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`,
  );

  if (pathnameHasLocale) return;

  const locale = getLocale(request);
  request.nextUrl.pathname = `/${locale}${pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts|.*\\..*).*)'],
};
