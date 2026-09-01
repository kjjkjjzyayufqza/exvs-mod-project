import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function AboutModule({
  index,
  kicker,
  title,
  children,
  className,
}: {
  index: string;
  kicker: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-h-full flex-col rounded-2xl bg-muted/45 px-5 py-5",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          {kicker}
        </p>
        <p className="font-mono text-[10px] tabular-nums text-muted-foreground/80">
          {index}
        </p>
      </div>
      <h2 className="mt-3 text-lg font-medium tracking-tight text-pretty">{title}</h2>
      <div className="mt-4 min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
