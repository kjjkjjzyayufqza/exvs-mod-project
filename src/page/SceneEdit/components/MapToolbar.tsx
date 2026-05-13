import {
  FolderOpen,
  FileArchive,
  Save,
  Grid3x3,
  Axis3D,
  Eye,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface MapToolbarProps {
  onOpenFolder: () => void;
  onImportFhm2d: () => void;
  onSave: () => void;
  canSave: boolean;
  stageName: string | null;
  isLoading: boolean;
  showGrid: boolean;
  showAxes: boolean;
  wireframe: boolean;
  onToggleGrid: () => void;
  onToggleAxes: () => void;
  onToggleWireframe: () => void;
  onResetCamera: () => void;
}

export function MapToolbar({
  onOpenFolder,
  onImportFhm2d,
  onSave,
  canSave,
  stageName,
  isLoading,
  showGrid,
  showAxes,
  wireframe,
  onToggleGrid,
  onToggleAxes,
  onToggleWireframe,
  onResetCamera,
}: MapToolbarProps) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b bg-muted/30">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={onImportFhm2d}
            disabled={isLoading}
          >
            <FileArchive className="h-4 w-4 mr-1.5" />
            Import FHM2D
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Extract a .fhm2d stage file, auto-rename, and load
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenFolder}
            disabled={isLoading}
          >
            <FolderOpen className="h-4 w-4 mr-1.5" />
            Open Stage
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open an already-renamed stage folder</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={onSave}
            disabled={!canSave || isLoading}
          >
            <Save className="h-4 w-4 mr-1.5" />
            Save
          </Button>
        </TooltipTrigger>
        <TooltipContent>Save modified CSV files</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-5 mx-1" />

      {stageName && (
        <Badge variant="secondary" className="text-xs font-mono max-w-[200px] truncate">
          {stageName}
        </Badge>
      )}

      {isLoading && (
        <Badge variant="outline" className="text-xs animate-pulse">
          Loading...
        </Badge>
      )}

      <div className="flex-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={showGrid ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={onToggleGrid}
          >
            <Grid3x3 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Toggle Grid</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={showAxes ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={onToggleAxes}
          >
            <Axis3D className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Toggle Axes</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={wireframe ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={onToggleWireframe}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Toggle Wireframe</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onResetCamera}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Reset Camera</TooltipContent>
      </Tooltip>
    </div>
  );
}
