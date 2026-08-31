import { useMemo } from "react";
import { Copy, Star, Trash2 } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CharacterListEntry } from "@/models/characterListEntry";
import { buildCardIconPreviewPath } from "../card-icon-list/cardIconUtils";

interface CharacterCardProps {
  character: CharacterListEntry;
  index: number;
  cardIconConvertDirPath?: string;
  cardIconNameOrder?: Array<string | null>;
  isSelected: boolean;
  isHighlighted?: boolean;
  onClick: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onToggleHighlight?: () => void;
}

export function CharacterCard({
  character,
  index,
  cardIconConvertDirPath,
  cardIconNameOrder,
  isSelected,
  isHighlighted = false,
  onClick,
  onDelete,
  onCopy,
  onToggleHighlight,
}: CharacterCardProps) {
  const characterName = character.characterName || "";
  const cardIconName = useMemo(() => {
    const iconIndex = character.msCardIconIndex;
    if (!cardIconNameOrder) return null;
    if (!Number.isFinite(iconIndex) || iconIndex < 0) return null;
    return cardIconNameOrder[iconIndex] ?? null;
  }, [cardIconNameOrder, character.msCardIconIndex]);

  const previewPath = useMemo(() => {
    if (!cardIconConvertDirPath || !cardIconName) return null;
    return buildCardIconPreviewPath(cardIconConvertDirPath, cardIconName);
  }, [cardIconConvertDirPath, cardIconName]);

  const thumbnailSrc = previewPath ? convertFileSrc(previewPath) : "/tauri.svg";

  return (
    <div
      className={cn(
        "border rounded-md px-2 py-2 cursor-pointer hover:bg-accent/50 transition-colors h-full flex items-center justify-between gap-2",
        isSelected && "ring-2 ring-inset ring-primary bg-accent",
        isHighlighted && !isSelected && "border-amber-400/80 bg-amber-500/8",
        isHighlighted && isSelected && "border-amber-400/80",
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="h-12 w-24 shrink-0 overflow-hidden rounded border bg-black">
          <img
            src={thumbnailSrc}
            alt={characterName}
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
                  {characterName || `Character ${character.entryId}`}
                </div>
              </TooltipTrigger>
              {characterName && (
                <TooltipContent>
                  <p>{characterName}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          <div className="text-xs text-muted-foreground space-y-0.5">
            <div>ID: {character.entryId}</div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "p-0 text-muted-foreground hover:bg-muted/60 hover:text-amber-600 dark:hover:text-amber-300",
            isHighlighted && "text-amber-600 dark:text-amber-300",
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggleHighlight?.();
          }}
          title={isHighlighted ? "Remove highlight" : "Highlight character"}
          aria-label={isHighlighted ? "Remove highlight" : "Highlight character"}
          aria-pressed={isHighlighted}
          disabled={!onToggleHighlight}
        >
          <Star className={cn("w-4 h-4", isHighlighted && "fill-current")} />
        </Button>
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
