import {
  FolderOpen,
  FileArchive,
  PackageOpen,
  Save,
  HardDriveDownload,
  Grid3x3,
  Axis3D,
  Box,
  RotateCcw,
  Activity,
  Eraser,
  Upload,
  Download,
  Move3D,
  RotateCw,
  Maximize,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Settings2, ChevronDown } from "lucide-react";
import type { PlacementGizmoMode } from "./MapViewport";
import { MAX_SCENE_GIZMO_SIZE, MIN_SCENE_GIZMO_SIZE } from "../utils/sceneEditorSettings";
import { HavokViewModeToggle } from "./havok/HavokViewModeToggle";

const GIZMO_MODES = [
  { key: "W", mode: "translate" as const, label: "Move", icon: Move3D },
  { key: "E", mode: "rotate" as const, label: "Rotate", icon: RotateCw },
  { key: "R", mode: "scale" as const, label: "Scale", icon: Maximize },
];

interface MapToolbarProps {
  onOpenFolder: () => void;
  onImportFhm2d: () => void;
  onExtractFhm2d: () => void;
  onSaveFolder: () => void;
  onSaveFhm2d: () => void;
  onImportDae: () => void;
  onImportDaeWithConfig: () => void;
  onExportSelectedDae: () => void;
  canSave: boolean;
  canExportDae: boolean;
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
  gizmoSize: number;
  onGizmoSizeChange: (size: number) => void;
  animeRenderEnabled: boolean;
  onToggleAnimeRender: (enabled: boolean) => void;
  viewMode: "normal" | "collision" | "both";
  onViewModeChange: (mode: "normal" | "collision" | "both") => void;
  hasCollisionData: boolean;
  showAabb: boolean;
  onToggleAabb: (v: boolean) => void;
  showCollisionMesh: boolean;
  onToggleCollisionMesh: (v: boolean) => void;
}

export function MapToolbar({
  onOpenFolder,
  onImportFhm2d,
  onExtractFhm2d,
  onSaveFolder,
  onSaveFhm2d,
  onImportDae,
  onImportDaeWithConfig,
  onExportSelectedDae,
  canSave,
  canExportDae,
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
  gizmoSize,
  onGizmoSizeChange,
  animeRenderEnabled,
  onToggleAnimeRender,
  viewMode,
  onViewModeChange,
  hasCollisionData,
  showAabb,
  onToggleAabb,
  showCollisionMesh,
  onToggleCollisionMesh,
}: MapToolbarProps) {
  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b bg-muted/20 px-1.5 py-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onImportFhm2d}
            disabled={isLoading}
            aria-label="Import FHM2D"
          >
            <FileArchive className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Import .fhm2d (load into editor)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onExtractFhm2d}
            disabled={isLoading}
            aria-label="Extract FHM2D to folder"
          >
            <PackageOpen className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Extract .fhm2d to editable folder</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onOpenFolder}
            disabled={isLoading}
            aria-label="Open stage folder"
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Open extracted stage folder</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 relative"
            onClick={onSaveFolder}
            disabled={!canSave || isLoading}
            aria-label="Save as Folder"
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
        <TooltipContent side="bottom">Save changes to folder</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onSaveFhm2d}
            disabled={!canSave || isLoading}
            aria-label="Save as FHM2D"
          >
            <HardDriveDownload className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Repack and save as .fhm2d</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-4 mx-0.5" />

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={isLoading}
                aria-label="Import DAE objects"
              >
                <Upload className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Import DAE object(s)</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="min-w-[200px]">
          <DropdownMenuItem onClick={onImportDae}>
            <Upload className="mr-2 h-4 w-4" />
            Quick Import
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onImportDaeWithConfig}>
            <Settings2 className="mr-2 h-4 w-4" />
            Import with Config...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onExportSelectedDae}
            disabled={!canExportDae || isLoading}
            aria-label="Export selected objects as DAE"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Export selected DAE object(s)</TooltipContent>
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
                aria-label={`Set transform mode to ${mode}`}
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

      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label="Gizmo size"
              >
                <SlidersHorizontal className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Gizmo size</TooltipContent>
        </Tooltip>
        <PopoverContent side="bottom" align="start" className="w-56 p-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Gizmo Size</span>
              <span className="font-mono text-foreground">{gizmoSize.toFixed(2)}</span>
            </div>
            <Slider
              min={MIN_SCENE_GIZMO_SIZE}
              max={MAX_SCENE_GIZMO_SIZE}
              step={0.05}
              value={[gizmoSize]}
              onValueChange={(value) => {
                const next = value[0];
                if (typeof next === "number") onGizmoSizeChange(next);
              }}
            />
          </div>
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="h-4 mx-0.5" />

      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showGrid ? "secondary" : "ghost"}
              size="icon"
              className="h-6 w-6"
              onClick={onToggleGrid}
              aria-label={showGrid ? "Hide grid" : "Show grid"}
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
              aria-label={showAxes ? "Hide axes" : "Show axes"}
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
              aria-label={wireframe ? "Disable wireframe" : "Enable wireframe"}
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
              aria-label={showStats ? "Hide stats" : "Show stats"}
            >
              <Activity className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Stats</TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-4 mx-0.5" />

      <HavokViewModeToggle
        value={viewMode}
        onChange={onViewModeChange}
        disabled={!hasCollisionData}
        showWireframe={wireframe}
        onToggleWireframe={onToggleWireframe}
        showAabb={showAabb}
        onToggleAabb={onToggleAabb}
        showMesh={showCollisionMesh}
        onToggleMesh={onToggleCollisionMesh}
      />

      <Separator orientation="vertical" className="h-4 mx-0.5" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={animeRenderEnabled ? "secondary" : "ghost"}
            size="icon"
            className={cn("h-6 w-6", animeRenderEnabled && "text-pink-400")}
            onClick={() => onToggleAnimeRender(!animeRenderEnabled)}
            aria-label={animeRenderEnabled ? "Disable anime render" : "Enable anime render"}
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
            aria-label="Reset camera"
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
            aria-label="Clear scene memory and caches"
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
          title={stageName}
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
