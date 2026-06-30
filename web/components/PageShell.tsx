export function PageShell({
  children,
  className,
  innerClassName,
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  return (
    <div className={`min-h-[calc(100vh-var(--nav-height))] ${className ?? ''}`}>
      <div className={`mx-auto max-w-2xl ${innerClassName ?? ''}`}>
        {children}
      </div>
    </div>
  );
}
