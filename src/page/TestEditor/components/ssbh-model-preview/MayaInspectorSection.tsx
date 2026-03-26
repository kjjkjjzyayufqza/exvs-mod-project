import { ChevronDown, ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";

export interface MayaSectionProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function MayaSection({ title, icon, children, defaultOpen = true }: MayaSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="flex flex-col border-b border-muted last:border-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 bg-muted/20 px-2 py-1.5 transition-colors hover:bg-muted/40"
      >
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[10px] font-bold uppercase tracking-wider">{title}</span>
        </div>
      </button>
      {isOpen && <div className="p-3">{children}</div>}
    </div>
  );
}
