import { Copy, Trash2 } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { StageDataEntry } from "@/models/stageList";
import { getPathSeparatorFromFileUrl } from "@/lib/fhm2d_fileUrlUtils";
import { formatSeriesPngFileNameFromBaseName, resolveMappedSeriesBaseName } from "../series-list/seriesImage";

interface StageCardProps {
  stage: StageDataEntry;
  index: number;
  isSelected: boolean;
  onClick: () => void;
  onCopy: () => void;
  onDelete: () => void;
  stageIconConvertDirPath?: string;
  stageIconBaseNameOrder?: Array<string | null>;
}

export function StageCard({ stage, index, isSelected, onClick, onCopy, onDelete, stageIconConvertDirPath, stageIconBaseNameOrder }: StageCardProps) {
  const stageName = stage.name?.Utf8String ?? "";
  const baseName = resolveMappedSeriesBaseName(stageIconBaseNameOrder, stage.iconIndex ?? 0);
  const fileName = baseName ? formatSeriesPngFileNameFromBaseName(baseName) : null;
  const imageFilePath = (() => {
    if (!stageIconConvertDirPath || !fileName) return null;
    const sep = getPathSeparatorFromFileUrl(stageIconConvertDirPath);
    if (stageIconConvertDirPath.endsWith(sep)) return `${stageIconConvertDirPath}${fileName}`;
    return `${stageIconConvertDirPath}${sep}${fileName}`;
  })();
  const thumbnailSrc = imageFilePath ? convertFileSrc(imageFilePath) : "/tauri.svg";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "border rounded-md px-2 py-2 cursor-pointer hover:bg-accent/50 transition-colors h-full flex items-center justify-between gap-2",
        isSelected && "ring-2 ring-inset ring-primary bg-accent"
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="h-12 w-24 shrink-0 overflow-hidden rounded border bg-black">
          <img
            src={thumbnailSrc}
            alt={stageName}
            className="h-full w-full object-contain"
            onError={(e) => {
              e.currentTarget.src = "/tauri.svg";
            }}
          />
        </div>

        <div className="min-w-0">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-sm font-medium line-clamp-2 wrap-break-word">
                  {stageName || `Stage ${stage.id ?? index}`}
                </div>
              </TooltipTrigger>
              {stageName && (
                <TooltipContent>
                  <p>{stageName}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          <div className="text-xs text-muted-foreground space-y-0.5">
            <div>ID: {stage.id ?? 0}</div>
            <div>Index: {index}</div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="text-primary hover:text-primary hover:bg-primary/10 p-0"
          onClick={(e) => {
            e.stopPropagation();
            onCopy();
          }}
          title="Copy as new"
        >
          <Copy className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10 p-0"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
