import { useMemo } from "react";
import { Copy, Trash2 } from "lucide-react";
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
  onClick: () => void;
  onDelete: () => void;
  onCopy: () => void;
}

export function CharacterCard({
  character,
  index,
  cardIconConvertDirPath,
  cardIconNameOrder,
  isSelected,
  onClick,
  onDelete,
  onCopy,
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
        isSelected && "ring-2 ring-inset ring-primary bg-accent"
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
