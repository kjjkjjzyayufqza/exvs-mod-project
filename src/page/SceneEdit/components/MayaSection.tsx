import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface MayaSectionProps {
  title: string;
  defaultOpen?: boolean;
  badge?: string | number;
  actions?: ReactNode;
  children: ReactNode;
}

export function MayaSection({
  title,
  defaultOpen = true,
  badge,
  actions,
  children,
}: MayaSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border/40">
      <div
        className={cn(
          "flex w-full items-center gap-1.5 px-2 py-[5px] text-[11px] font-semibold uppercase tracking-wider select-none transition-colors",
          "text-muted-foreground hover:text-foreground hover:bg-accent/40",
          open && "bg-accent/20",
        )}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-left"
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronRight
            className={cn(
              "h-3 w-3 shrink-0 transition-transform duration-150",
              open && "rotate-90",
            )}
          />
          <span className="truncate">{title}</span>
          {badge !== undefined && (
            <span className="ml-auto shrink-0 text-[9px] font-mono opacity-60">
              {badge}
            </span>
          )}
        </button>
        {actions && (
          <span className="flex shrink-0 items-center gap-0.5">{actions}</span>
        )}
      </div>
      {open && (
        <div className="min-w-0 max-w-full overflow-hidden px-2 pb-2 pt-1">{children}</div>
      )}
    </div>
  );
}
