import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionPanelProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Flat bordered panel whose direct children are separated by hairlines.
 * Used instead of stacked cards so the page keeps a single elevation level.
 */
export function SectionPanel({ children, className }: SectionPanelProps) {
  return (
    <div className={cn("divide-y rounded-md border bg-card", className)}>{children}</div>
  );
}

type SectionBlockProps = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function SectionBlock({
  title,
  description,
  action,
  children,
  className,
}: SectionBlockProps) {
  return (
    <section className={cn("space-y-3 p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
