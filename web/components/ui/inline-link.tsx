import { cn } from '@/lib/utils';

interface InlineLinkProps {
  onClick?: () => void;
  href?: string;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}

export function InlineLink({ onClick, href, children, className, ariaLabel }: InlineLinkProps) {
  const base = cn(
    'text-sm text-primary underline underline-offset-2 hover:no-underline',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm',
    className,
  );

  if (href) {
    return (
      <a href={href} className={base} aria-label={ariaLabel}>
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(base, 'active:opacity-70')}
    >
      {children}
    </button>
  );
}
