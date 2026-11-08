import { ChevronLeft } from 'lucide-react';

interface BackLinkProps {
  href: string;
  label: string;
}

export function BackLink({ href, label }: BackLinkProps) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 mb-5"
    >
      <ChevronLeft className="size-4" aria-hidden />
      {label}
    </a>
  );
}
