import Link from 'next/link';
import '@/app/globals.css';

// Root-level 404 — only reached by URLs outside any locale segment (e.g.
// /ar/admin when someone types the wrong path). Provides its own <html>/<body>
// so the page renders correctly without a locale layout in scope.
export default function RootNotFound() {
  return (
    <html lang="fr" dir="ltr" className="antialiased">
      <body className="m-0 p-0 bg-background text-foreground font-sans">
        <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6">
          <p className="text-sm text-muted-foreground">
            404 — Page introuvable
          </p>
          <Link
            href="/admin"
            className="text-sm text-primary underline underline-offset-2 hover:no-underline transition-colors duration-150"
          >
            Retour à l'administration
          </Link>
        </div>
      </body>
    </html>
  );
}
