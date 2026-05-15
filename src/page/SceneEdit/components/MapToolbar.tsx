import {
  FolderOpen,
  FileArchive,
  Save,
  Grid3x3,
  Axis3D,
  Box,
  RotateCcw,
  Activity,
  Eraser,
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
  hasUnsavedChanges?: boolean;
  stageName: string | null;
  isLoading: boolean;
  showGrid: boolean;
  showAxes: boolean;
  wireframe: boolean;
  showStats: boolean;
  onToggleGrid: () => void;
  onToggleAxes: () => void;
  onToggleWireframe: () => void;
  onToggleStats: () => void;
  onResetCamera: () => void;
  onClearCache: () => void;
  clearCacheDisabled?: boolean;
}

export function MapToolbar({
  onOpenFolder,
  onImportFhm2d,
  onSave,
  canSave,
  hasUnsavedChanges,
  stageName,
  isLoading,
  showGrid,
  showAxes,
  wireframe,
  showStats,
  onToggleGrid,
  onToggleAxes,
  onToggleWireframe,
  onToggleStats,
  onResetCamera,
  onClearCache,
  clearCacheDisabled,
}: MapToolbarProps) {
  return (
    <div className="flex shrink-0 items-center gap-1 px-2 py-1 border-b bg-background/80 backdrop-blur-sm">
      {/* File actions */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={onImportFhm2d}
            disabled={isLoading}
          >
            <FileArchive className="h-3.5 w-3.5" />
            Import
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Import .fhm2d stage file</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={onOpenFolder}
            disabled={isLoading}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Open
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Open a renamed stage folder</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5 relative"
            onClick={onSave}
            disabled={!canSave || isLoading}
          >
            <Save className="h-3.5 w-3.5" />
            Save
            {hasUnsavedChanges && (
              <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {hasUnsavedChanges ? "Save unsaved changes" : "Save modified CSV files"}
        </TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-4 mx-0.5" />

      {/* Viewport display toggles */}
      <div className="flex items-center gap-0.5">
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
          <TooltipContent side="bottom">Grid</TooltipContent>
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
          <TooltipContent side="bottom">Axes</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={wireframe ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={onToggleWireframe}
            >
              <Box className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Wireframe</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showStats ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={onToggleStats}
            >
              <Activity className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Performance Stats</TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-4 mx-0.5" />

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
        <TooltipContent side="bottom">Reset Camera</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClearCache}
            disabled={clearCacheDisabled}
          >
            <Eraser className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Clear scene memory and texture caches (unloads current stage)
        </TooltipContent>
      </Tooltip>

      {/* Stage name + loading state */}
      <div className="flex-1" />

      {stageName && (
        <Badge variant="outline" className="text-[10px] font-mono max-w-[180px] truncate h-5 px-1.5">
          {stageName}
        </Badge>
      )}

      {isLoading && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-2.5 h-2.5 border-[1.5px] border-muted-foreground/40 border-t-muted-foreground rounded-full animate-spin" />
          <span>Loading</span>
        </div>
      )}
    </div>
  );
}
