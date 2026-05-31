import type { ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface MscFileActionDescriptor {
  key: string;
  label: string;
  onClick: () => void | Promise<void>;
  variant?: ButtonProps["variant"];
  disabled?: boolean;
  icon?: ReactNode;
}

interface MscFileRowProps {
  name: string;
  icon: ReactNode;
  meta?: string;
  actions: MscFileActionDescriptor[];
}

/** A single dense file row: icon + monospace name + optional meta badge + action buttons. */
export function MscFileRow({ name, icon, meta, actions }: MscFileRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-muted/40">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="truncate font-mono text-[13px]" title={name}>
          {name}
        </span>
        {meta ? (
          <Badge variant="outline" className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {meta}
          </Badge>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {actions.map((action) => (
          <Button
            key={action.key}
            size="sm"
            variant={action.variant ?? "secondary"}
            onClick={() => void action.onClick()}
            disabled={action.disabled}
          >
            {action.icon}
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
