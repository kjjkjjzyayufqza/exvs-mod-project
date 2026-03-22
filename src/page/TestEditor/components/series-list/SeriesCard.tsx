import { Copy, Trash2 } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { SeriesData } from "@/models/seriesList";
import { getPathSeparatorFromFileUrl } from "@/lib/fhm2d_fileUrlUtils";
import { formatSeriesPngFileNameFromBaseName, resolveMappedSeriesBaseName } from "./seriesImage";

interface SeriesCardProps {
  series: SeriesData;
  index: number;
  seriesImageConvertDirPath?: string;
  seriesImageSeriesBaseNameOrder?: Array<string | null>;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
  onCopy: () => void;
}

export function SeriesCard({
  series,
  index,
  seriesImageConvertDirPath,
  seriesImageSeriesBaseNameOrder,
  isSelected,
  onClick,
  onDelete,
  onCopy,
}: SeriesCardProps) {
  const baseName = resolveMappedSeriesBaseName(seriesImageSeriesBaseNameOrder, series.iconFileIndex);
  const fileName = baseName ? formatSeriesPngFileNameFromBaseName(baseName) : null;
  const imageFilePath = (() => {
    if (!seriesImageConvertDirPath || !fileName) return null;
    const sep = getPathSeparatorFromFileUrl(seriesImageConvertDirPath);
    if (seriesImageConvertDirPath.endsWith(sep)) return `${seriesImageConvertDirPath}${fileName}`;
    return `${seriesImageConvertDirPath}${sep}${fileName}`;
  })();
  const thumbnailSrc = imageFilePath ? convertFileSrc(imageFilePath) : "/tauri.svg";

  return (
    <div
      className={cn(
        "border rounded-md px-2 py-2 cursor-pointer hover:bg-accent/50 transition-colors h-full flex items-center justify-between gap-2",
        isSelected && "ring-2 ring-inset ring-primary bg-accent"
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="h-12 w-24 shrink-0 overflow-hidden rounded border bg-black">
          <img
            src={thumbnailSrc}
            alt={series.unkStr1?.Utf8String || ""}
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
                  {series.unkStr1?.Utf8String || ""}
                </div>
              </TooltipTrigger>
              {series.unkStr1?.Utf8String && (
                <TooltipContent>
                  <p>{series.unkStr1.Utf8String}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          <div className="text-xs text-muted-foreground space-y-0.5">
            <div>ID: {series.SeriesId}</div>
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

