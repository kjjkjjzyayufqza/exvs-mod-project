import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StageDataEntry } from "@/models/stageList";
import { cn } from "@/lib/utils";

interface StageCardProps {
  stage: StageDataEntry;
  index: number;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
}

export function StageCard({ stage, index, isSelected, onClick, onDelete }: StageCardProps) {
  return (
    <Card
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
        "cursor-pointer transition-colors p-3",
        isSelected ? "ring-2 ring-inset ring-primary bg-accent" : "hover:bg-accent/50"
      )}
    >
      <CardContent className="p-0 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium">ID: {stage.id ?? index}</div>
          <div className="text-muted-foreground text-xs truncate">Name: {stage.name?.Utf8String ?? "-"}</div>
          <div className="text-muted-foreground text-xs">Unk1: {stage.unk1 ?? 0}</div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label="Delete stage"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </CardContent>
    </Card>
  );
}
