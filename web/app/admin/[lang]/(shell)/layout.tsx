import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import type { Locale } from '@/lib/i18n/settings';

export default async function AdminShellLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  // Validate session server-side: forward the incoming cookie to the Hono API
  // and redirect to login if no session is found.
  const reqHeaders = await headers();
  const apiUrl = process.env.API_URL ?? 'http://localhost:3001';

  try {
    const sessionRes = await fetch(`${apiUrl}/api/auth/get-session`, {
      headers: { cookie: reqHeaders.get('cookie') ?? '' },
      cache: 'no-store',
    });
    const sessionData = (await sessionRes.json().catch(() => null)) as { user?: unknown } | null;
    if (!sessionData?.user) {
      redirect(`/admin/${lang}/login`);
    }
  } catch {
    // API unreachable — fail closed and redirect to login
    redirect(`/admin/${lang}/login`);
  }

  return (
    <div className="flex min-h-screen relative">
      <AdminSidebar lang={lang as Locale} />

      {/* ── Content ── */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 px-6 py-6 max-w-5xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
