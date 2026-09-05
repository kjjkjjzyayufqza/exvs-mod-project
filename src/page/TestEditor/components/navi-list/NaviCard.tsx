import { Copy, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation("test-lists");
  const name = navi.displayName || t("navi.fallbackName", { id: navi.characterUniqueId });
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
          <div>{t("navi.uniqueId")} {navi.characterUniqueId}</div>
          <div>
            {t("navi.costume", { index: navi.costumeIndex })} · {t("navi.series", { id: navi.seriesListEntryId })} ·{" "}
            {navi.enabledCode === 1 ? t("navi.enabled") : t("navi.code", { code: navi.enabledCode })}
          </div>
          <div>{t("common.index")}: {index}</div>
        </div>
      </div>
      {editable ? (
        <div className="flex items-center gap-1 shrink-0" onClick={(event) => event.stopPropagation()}>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCopy} aria-label={t("navi.copyAria")}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDelete} aria-label={t("navi.deleteAria")}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
