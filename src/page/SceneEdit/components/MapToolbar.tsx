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
  MoreHorizontal,
  Boxes,
  Files,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

import type { PlacementGizmoMode } from "./MapViewport";
import { MAX_SCENE_GIZMO_SIZE, MIN_SCENE_GIZMO_SIZE } from "../utils/sceneEditorSettings";
import { HavokViewModeToggle } from "./havok/HavokViewModeToggle";

const GIZMO_MODES = [
  { key: "W", mode: "translate" as const, icon: Move3D },
  { key: "E", mode: "rotate" as const, icon: RotateCw },
  { key: "R", mode: "scale" as const, icon: Maximize },
];

interface MapToolbarProps {
  onOpenFolder: () => void;
  onImportFhm2d: () => void;
  onExtractFhm2d: () => void;
  onSaveFolder: () => void;
  onSaveFhm2d: () => void;
  onImportDaeWithConfig: () => void;
  onBatchImportDaeWithConfig: () => void;
  onExportSelectedDae: () => void;
  onExportHktToObj: () => void;
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
  onImportDaeWithConfig,
  onBatchImportDaeWithConfig,
  onExportSelectedDae,
  onExportHktToObj,
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
  const { t } = useTranslation("scene-toolbar");
  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b bg-muted/20 px-1.5 py-0.5">
      {/* ─── File Operations Group ─── */}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-[10px]"
                disabled={isLoading}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("file.label")}</span>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("file.openImportStage")}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="text-xs">
          <DropdownMenuItem onClick={onOpenFolder}>
            <FolderOpen className="mr-2 h-3.5 w-3.5" />
            {t("file.openStageFolder")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onImportFhm2d}>
            <FileArchive className="mr-2 h-3.5 w-3.5" />
            {t("file.importFhm2d")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onExtractFhm2d}>
            <PackageOpen className="mr-2 h-3.5 w-3.5" />
            {t("file.extractFhm2d")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Save button — always visible with unsaved indicator */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 relative"
            onClick={onSaveFolder}
            disabled={!canSave || isLoading}
            aria-label={t("save.folderAria")}
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
        <TooltipContent side="bottom">{t("save.folderTooltip")}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onSaveFhm2d}
            disabled={!canSave || isLoading}
            aria-label={t("save.fhm2dAria")}
          >
            <HardDriveDownload className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("save.fhm2dTooltip")}</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-4 mx-0.5" />

      {/* ─── Import / Export Group ─── */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onImportDaeWithConfig}
            disabled={isLoading}
            aria-label={t("import.importMeshAria")}
          >
            <Upload className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("import.importDaeTooltip")}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onBatchImportDaeWithConfig}
            disabled={isLoading}
            aria-label={t("import.batchAria")}
          >
            <Files className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {t("import.batchTooltip")}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onExportSelectedDae}
            disabled={!canExportDae || isLoading}
            aria-label={t("export.selectedAria")}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("export.selectedTooltip")}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onExportHktToObj}
            disabled={isLoading}
            aria-label={t("export.hktAria")}
          >
            <Boxes className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("export.hktTooltip")}</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-4 mx-0.5" />

      {/* ─── Transform Gizmo Group ─── */}
      <div className="flex items-center rounded-sm overflow-hidden border border-border/60">
        {GIZMO_MODES.map(({ key, mode, icon: Icon }) => (
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
                aria-label={t("gizmo.setMode", { mode })}
              >
                <Icon className="h-3 w-3" />
                <span className="hidden sm:inline">{t(`gizmo.${mode}`)}</span>
                <kbd className="text-[8px] font-mono opacity-60 ml-0.5">
                  {key}
                </kbd>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t(`gizmo.${mode}`)} ({key})
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label={t("gizmo.size")}
              >
                <SlidersHorizontal className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("gizmo.size")}</TooltipContent>
        </Tooltip>
        <PopoverContent side="bottom" align="start" className="w-56 p-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{t("gizmo.size")}</span>
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

      {/* ─── Viewport Display Group ─── */}
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showGrid ? "secondary" : "ghost"}
              size="icon"
              className="h-6 w-6"
              onClick={onToggleGrid}
              aria-label={t(showGrid ? "display.hideGrid" : "display.showGrid")}
            >
              <Grid3x3 className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("display.grid")}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showAxes ? "secondary" : "ghost"}
              size="icon"
              className="h-6 w-6"
              onClick={onToggleAxes}
              aria-label={t(showAxes ? "display.hideAxes" : "display.showAxes")}
            >
              <Axis3D className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("display.axes")}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={wireframe ? "secondary" : "ghost"}
              size="icon"
              className="h-6 w-6"
              onClick={onToggleWireframe}
              aria-label={t(wireframe ? "display.disableWireframe" : "display.enableWireframe")}
            >
              <Box className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("display.wireframe")}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showStats ? "secondary" : "ghost"}
              size="icon"
              className="h-6 w-6"
              onClick={onToggleStats}
              aria-label={t(showStats ? "display.hideStats" : "display.showStats")}
            >
              <Activity className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("display.stats")}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={animeRenderEnabled ? "secondary" : "ghost"}
              size="icon"
              className={cn("h-6 w-6", animeRenderEnabled && "text-pink-400")}
              onClick={() => onToggleAnimeRender(!animeRenderEnabled)}
              aria-label={t(animeRenderEnabled ? "display.disableAnime" : "display.enableAnime")}
            >
              <Sparkles className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("display.animeRender")}</TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-4 mx-0.5" />

      {/* ─── View Mode / Collision Group ─── */}
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

      {/* ─── Overflow Menu (low-frequency actions) ─── */}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("more.actions")}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="text-xs">
          <DropdownMenuItem onClick={onResetCamera}>
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            {t("more.resetCamera")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onClearCache} disabled={clearCacheDisabled}>
            <Eraser className="mr-2 h-3.5 w-3.5" />
            {t("more.clearCache")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
