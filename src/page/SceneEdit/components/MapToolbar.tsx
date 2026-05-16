import {
  FolderOpen,
  FileArchive,
  PackageOpen,
  Save,
  Grid3x3,
  Axis3D,
  Box,
  RotateCcw,
  Activity,
  Eraser,
  Move3D,
  RotateCw,
  Maximize,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { PlacementGizmoMode } from "./MapViewport";

const GIZMO_MODES = [
  { key: "W", mode: "translate" as const, label: "Move", icon: Move3D },
  { key: "E", mode: "rotate" as const, label: "Rotate", icon: RotateCw },
  { key: "R", mode: "scale" as const, label: "Scale", icon: Maximize },
];

interface MapToolbarProps {
  onOpenFolder: () => void;
  onImportFhm2d: () => void;
  onExtractFhm2d: () => void;
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
  placementGizmoMode: PlacementGizmoMode;
  onGizmoModeChange: (mode: PlacementGizmoMode) => void;
  animeRenderEnabled: boolean;
  onToggleAnimeRender: (enabled: boolean) => void;
}

export function MapToolbar({
  onOpenFolder,
  onImportFhm2d,
  onExtractFhm2d,
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
  placementGizmoMode,
  onGizmoModeChange,
  animeRenderEnabled,
  onToggleAnimeRender,
}: MapToolbarProps) {
  return (
    <div className="flex shrink-0 items-center gap-1 px-1.5 py-0.5 border-b bg-muted/20">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onImportFhm2d}
            disabled={isLoading}
          >
            <FileArchive className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Import .fhm2d</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onExtractFhm2d}
            disabled={isLoading}
          >
            <PackageOpen className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Extract .fhm2d to folder</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onOpenFolder}
            disabled={isLoading}
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Open stage folder</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 relative"
            onClick={onSave}
            disabled={!canSave || isLoading}
          >
            <Save className="h-3.5 w-3.5" />
            {hasUnsavedChanges && (
              <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-yellow-500" />
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {hasUnsavedChanges ? "Save changes" : "Save CSV"}
        </TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-4 mx-0.5" />

      <div className="flex items-center rounded-sm overflow-hidden border border-border/60">
        {GIZMO_MODES.map(({ key, mode, label, icon: Icon }) => (
          <Tooltip key={mode}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1 h-6 px-2 text-[10px] font-medium transition-colors",
                  placementGizmoMode === mode
                    ? "bg-primary/90 text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
                onClick={() => onGizmoModeChange(mode)}
              >
                <Icon className="h-3 w-3" />
                <span className="hidden sm:inline">{label}</span>
                <kbd className="text-[8px] font-mono opacity-60 ml-0.5">
                  {key}
                </kbd>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {label} ({key})
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      <Separator orientation="vertical" className="h-4 mx-0.5" />

      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showGrid ? "secondary" : "ghost"}
              size="icon"
              className="h-6 w-6"
              onClick={onToggleGrid}
            >
              <Grid3x3 className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Grid</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showAxes ? "secondary" : "ghost"}
              size="icon"
              className="h-6 w-6"
              onClick={onToggleAxes}
            >
              <Axis3D className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Axes</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={wireframe ? "secondary" : "ghost"}
              size="icon"
              className="h-6 w-6"
              onClick={onToggleWireframe}
            >
              <Box className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Wireframe</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showStats ? "secondary" : "ghost"}
              size="icon"
              className="h-6 w-6"
              onClick={onToggleStats}
            >
              <Activity className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Stats</TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-4 mx-0.5" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={animeRenderEnabled ? "secondary" : "ghost"}
            size="icon"
            className={cn("h-6 w-6", animeRenderEnabled && "text-pink-400")}
            onClick={() => onToggleAnimeRender(!animeRenderEnabled)}
          >
            <Sparkles className="h-3 w-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Anime render</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-4 mx-0.5" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onResetCamera}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Reset Camera</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClearCache}
            disabled={clearCacheDisabled}
          >
            <Eraser className="h-3 w-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Clear cache</TooltipContent>
      </Tooltip>

      <div className="flex-1" />

      {stageName && (
        <Badge
          variant="outline"
          className="text-[9px] font-mono max-w-[160px] truncate h-4 px-1"
        >
          {stageName}
        </Badge>
      )}

      {isLoading && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <div className="w-2 h-2 border-[1.5px] border-muted-foreground/40 border-t-muted-foreground rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
