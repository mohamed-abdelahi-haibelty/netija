import Link from 'next/link';

// Root-level 404 — only reached by URLs outside any locale segment (e.g.
// /ar/admin when someone types the wrong path). Provides its own <html>/<body>
// so the page renders correctly without a locale layout in scope.
export default function RootNotFound() {
  return (
    <html lang="fr" dir="ltr">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: '0', padding: '0' }}>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: '#111' }}>
          <p style={{ fontSize: '14px', color: '#666' }}>404 — Page introuvable</p>
          <Link href="/admin" style={{ fontSize: '14px', color: '#1a6a3e', textDecoration: 'underline' }}>
            Retour à l'administration
          </Link>
        </div>
      </body>
    </html>
  );
}
