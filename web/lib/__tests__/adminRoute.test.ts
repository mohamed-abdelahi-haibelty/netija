import { normalizeAdminRoutePattern } from '../adminRoute';

describe('normalizeAdminRoutePattern', () => {
  it('strips the locale segment', () => {
    expect(normalizeAdminRoutePattern('/admin/fr/imports')).toBe('/admin/imports');
    expect(normalizeAdminRoutePattern('/admin/ar')).toBe('/admin');
  });

  it('replaces numeric ids with [id], never leaking the raw id', () => {
    expect(normalizeAdminRoutePattern('/admin/fr/imports/42/mapping')).toBe(
      '/admin/imports/[id]/mapping',
    );
    expect(normalizeAdminRoutePattern('/admin/fr/imports/42')).toBe('/admin/imports/[id]');
  });

  it('falls back to /admin for a bare admin root', () => {
    expect(normalizeAdminRoutePattern('/admin')).toBe('/admin');
  });
});
