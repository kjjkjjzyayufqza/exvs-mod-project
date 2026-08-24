import { Copy, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { NaviListEntry } from "@/models/naviListEntry";

interface NaviCardProps {
  navi: NaviListEntry;
  index: number;
  editable?: boolean;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
  onCopy: () => void;
}

export function NaviCard({
  navi,
  index,
  editable = true,
  isSelected,
  onClick,
  onDelete,
  onCopy,
}: NaviCardProps) {
  const name = navi.displayName || `Navi ${navi.characterUniqueId}`;
  return (
    <div
      className={cn(
        "border rounded-md px-2 py-2 cursor-pointer hover:bg-accent/50 transition-colors h-full flex items-center justify-between gap-2",
        isSelected && "ring-2 ring-inset ring-primary bg-accent",
      )}
      onClick={onClick}
    >
      <div className="min-w-0 flex-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-sm font-medium line-clamp-2 wrap-break-word">{name}</div>
            </TooltipTrigger>
            {navi.displayName ? (
              <TooltipContent>
                <p>{navi.displayName}</p>
              </TooltipContent>
            ) : null}
          </Tooltip>
        </TooltipProvider>
        <div className="text-xs text-muted-foreground space-y-0.5">
          <div>Unique ID: {navi.characterUniqueId}</div>
          <div>
            Costume {navi.costumeIndex} · series {navi.seriesListEntryId} ·{" "}
            {navi.enabledCode === 1 ? "enabled" : `code ${navi.enabledCode}`}
          </div>
          <div>Index: {index}</div>
        </div>
      </div>
      {editable ? (
        <div className="flex items-center gap-1 shrink-0" onClick={(event) => event.stopPropagation()}>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCopy} aria-label="Copy navi">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDelete} aria-label="Delete navi">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
