"use client";

import { memo } from "react";

export const PropertyRow = memo(function PropertyRow({
  icon: Icon,
  label,
  children,
}: {
  icon?: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start w-full max-w-sm min-h-8 gap-0 -mx-2 px-2 py-0.5 rounded-sm group hover:bg-muted/50 transition-colors duration-100">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground shrink-0 w-36 sm:w-44 pt-0.5">
        {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
        {label}
      </span>
      <div className="text-sm text-foreground pt-0.5 min-w-0 break-words">
        {children}
      </div>
    </div>
  );
});
