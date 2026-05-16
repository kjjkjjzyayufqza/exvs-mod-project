import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface MayaSectionProps {
  title: string;
  defaultOpen?: boolean;
  badge?: string | number;
  children: ReactNode;
}

export function MayaSection({
  title,
  defaultOpen = true,
  badge,
  children,
}: MayaSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border/40">
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-1.5 px-2 py-[5px] text-[11px] font-semibold uppercase tracking-wider select-none transition-colors",
          "text-muted-foreground hover:text-foreground hover:bg-accent/40",
          open && "bg-accent/20",
        )}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 transition-transform duration-150",
            open && "rotate-90",
          )}
        />
        <span>{title}</span>
        {badge !== undefined && (
          <span className="ml-auto text-[9px] font-mono opacity-60">
            {badge}
          </span>
        )}
      </button>
      {open && <div className="px-2 pb-2 pt-1">{children}</div>}
    </div>
  );
}
