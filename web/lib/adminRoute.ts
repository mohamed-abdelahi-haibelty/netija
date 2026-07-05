// Turns a real admin pathname into a stable, low-cardinality pattern: strips
// the locale segment and replaces numeric ids with `[id]`. Used by the
// (shell) layout's unauthenticated redirect (server-side) and the login
// page's admin_access_attempt tracking (client-side) — kept in its own
// module, without 'use client', so both sides can import it directly.
export function normalizeAdminRoutePattern(pathname: string): string {
  const withoutLocale = pathname.replace(/^\/admin\/[a-z]{2}(?=\/|$)/, '/admin');
  return withoutLocale.replace(/\/\d+(?=\/|$)/g, '/[id]') || '/admin';
}
