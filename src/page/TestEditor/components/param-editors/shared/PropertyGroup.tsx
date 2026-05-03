import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface PropertyGroupProps {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function PropertyGroup({
  label,
  defaultOpen = true,
  children,
  className,
}: PropertyGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`rounded-md border bg-card shadow-sm ${className ?? ""}`}>
      <button
        type="button"
        className="flex w-full items-center gap-1.5 border-b px-3 py-2 text-xs font-semibold hover:bg-muted/30"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {label}
      </button>
      {open && <div className="space-y-1.5 p-3">{children}</div>}
    </div>
  );
}
