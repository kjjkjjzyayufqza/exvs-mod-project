import { Copy, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CharacterDataOB } from "@/models/characterListOB";

interface CharacterCardProps {
  character: CharacterDataOB;
  index: number;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
  onCopy: () => void;
}

export function CharacterCard({ character, index, isSelected, onClick, onDelete, onCopy }: CharacterCardProps) {
  return (
    <div
      className={cn(
        "border rounded-md px-2 py-2 cursor-pointer hover:bg-accent/50 transition-colors h-full flex items-center justify-between gap-2",
        isSelected && "ring-2 ring-inset ring-primary bg-accent"
      )}
      onClick={onClick}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">ID: {character.CharacterId}</div>
        <div className="text-xs text-muted-foreground truncate">
          Index: {index} · Series: {character.SeriesId}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="text-blue-600 hover:text-blue-600 hover:bg-blue-50"
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
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
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



