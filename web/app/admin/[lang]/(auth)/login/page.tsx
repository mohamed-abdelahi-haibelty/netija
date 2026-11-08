'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { trackAdminAccessAttempt } from '@/lib/analytics';

// Reports a redirect-from-(shell)-layout probe of the admin area (the
// `blocked` param carries only a route *pattern*, never a query string or
// anything personal — see (shell)/layout.tsx). Split out because
// useSearchParams needs a <Suspense> boundary.
function AccessAttemptReporter() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const blocked = searchParams.get('blocked');
    if (blocked) trackAdminAccessAttempt(blocked);
  }, [searchParams]);

  return null;
}

export default function AdminLoginPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const rawParams = useParams();
  const lang = rawParams.lang as string;

  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = emailRef.current?.value.trim() ?? '';
    const password = passwordRef.current?.value ?? '';

    if (!email || !password) return;

    if (!EMAIL_RE.test(email)) {
      setError(t('admin.login.errorEmailInvalid'));
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });

      if (res.ok) {
        router.push(`/admin/${lang}/imports`);
        return;
      }

      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (res.status === 401 || res.status === 400) {
        setError(t('admin.login.errorInvalid'));
      } else if (body?.error?.message) {
        setError(body.error.message);
      } else {
        setError(t('admin.login.errorGeneric'));
      }
    } catch {
      setError(t('admin.login.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <Suspense fallback={null}>
        <AccessAttemptReporter />
      </Suspense>
      <div className="w-full max-w-sm">
        {/* ── Card ── */}
        <div className="rounded-lg border border-border px-8 py-9">
          {/* ── Header ── */}
          <header className="mb-7">
            <p className="text-sm font-semibold text-foreground mb-0.5">
              Netija
            </p>
            <h1 className="text-sm text-muted-foreground">
              {t('admin.login.subtitle')}
            </h1>
          </header>

          {/* ── Error banner ── */}
          {error && (
            <div
              role="alert"
              className="mb-5 rounded-md bg-status-fail-bg text-status-fail-fg text-sm px-3.5 py-2.5"
            >
              {error}
            </div>
          )}

          {/* ── Form ── */}
          <form
            onSubmit={(e) => {
              void handleSubmit(e);
            }}
            noValidate
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-foreground"
              >
                {t('admin.login.emailLabel')}
              </label>
              <Input
                ref={emailRef}
                id="email"
                type="email"
                autoComplete="email"
                autoCapitalize="off"
                spellCheck={false}
                required
                placeholder={t('admin.login.emailPlaceholder')}
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-foreground"
              >
                {t('admin.login.passwordLabel')}
              </label>
              <div className="relative">
                <Input
                  ref={passwordRef}
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  placeholder={t('admin.login.passwordPlaceholder')}
                  className="h-10 pe-10"
                />
                  <button
                  type="button"
                  aria-label={showPassword ? t('admin.login.hidePassword') : t('admin.login.showPassword')}
                  onClick={() => {
                    setShowPassword((v) => !v);
                  }}
                  className="absolute inset-e-0 inset-y-0 px-3 text-muted-foreground hover:text-foreground transition-colors duration-150"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden />
                  ) : (
                    <Eye className="size-4" aria-hidden />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={cn(
                'w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium',
                'transition-colors duration-150',
                'hover:bg-primary/85 active:bg-primary/70',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:pointer-events-none disabled:opacity-60',
                'flex items-center justify-center gap-2 mt-2',
              )}
            >
              {submitting && (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              )}
              {submitting
                ? t('admin.login.submitting')
                : t('admin.login.submit')}
            </button>
          </form>
        </div>

        {/* ── Back link ── */}
        <p className="mt-5 text-center text-sm text-muted-foreground">
          <Link
            href={`/${lang}`}
            className="hover:text-foreground transition-colors duration-150"
          >
            {lang === 'ar' ? '← العودة للموقع' : '← Back to site'}
          </Link>
        </p>
      </div>
    </div>
  );
}
