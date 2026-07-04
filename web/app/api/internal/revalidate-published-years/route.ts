import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

// Tag must match the one in app/[lang]/page.tsx's published-years fetch. Kept
// as a literal rather than a shared constant module — see that file's
// comment for why.
const PUBLISHED_YEARS_TAG = 'published-years';

// Called by the admin publish/unpublish flow right after the api confirms the
// flag flip. The home page's published-years fetch is cached with `next: {
// revalidate: 3600 }` for ISR — that cache lives in this Next.js process and
// is invisible to the api's own Redis invalidation, so without this hook a
// freshly published year wouldn't appear until the next hourly revalidation.
// Session-gated the same way (shell)/layout.tsx checks admin routes, since
// this is a mutating (cache-invalidating) endpoint.
export async function POST(request: Request): Promise<NextResponse> {
  const apiUrl = process.env['API_URL'] ?? 'http://localhost:3001';

  try {
    const sessionRes = await fetch(`${apiUrl}/api/auth/get-session`, {
      headers: { cookie: request.headers.get('cookie') ?? '' },
      cache: 'no-store',
    });
    const sessionData = (await sessionRes.json().catch(() => null)) as { user?: unknown } | null;
    if (!sessionData?.user) {
      return NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  }

  // Immediate expiration (not stale-while-revalidate) since this is an
  // external system (the admin's browser) calling the route handler and
  // publishing must reflect right away — see revalidateTag's docs on the
  // `{ expire: 0 }` form for webhook-triggered invalidation.
  revalidateTag(PUBLISHED_YEARS_TAG, { expire: 0 });

  return NextResponse.json({ revalidated: true });
}
