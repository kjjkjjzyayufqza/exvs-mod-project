import { FC } from "react";
import { CharacterDataOB } from "../../../models/characterListOB";
import { Card, CardContent } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Trash2 } from "lucide-react";
import { cn } from "../../../lib/utils";

interface CharacterCardProps {
  character: CharacterDataOB;
  index: number;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
}

export const CharacterCard: FC<CharacterCardProps> = ({
  character,
  index,
  isSelected,
  onClick,
  onDelete,
}) => {
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  return (
    <Card 
      className={cn(
        "cursor-pointer transition-colors hover:bg-accent/50",
        isSelected && "ring-2 ring-primary bg-accent"
      )}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="text-xs">
                #{index}
              </Badge>
              <span className="font-medium">ID: {character.CharacterId}</span>
            </div>
            
            <div className="text-sm text-muted-foreground space-y-1">
              <div>Series: {character.SeriesId}</div>
              <div>Name: {character.CharacterNameOffset?.StringBufferData?.toString('utf8').replace(/\0/g, '') || 'N/A'}</div>
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDeleteClick}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
