import {
  Activity,
  ArchiveRestore,
  Axis3D,
  Boxes,
  ClipboardCopy,
  Download,
  FolderOpen,
  Grid3x3,
  Loader2,
  MoreHorizontal,
  PackageCheck,
  PackageOpen,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import type { UnitModelWorkspaceBusy } from "../hooks/useUnitModelWorkspace";

type UnitModelToolbarProps = {
  folderName: string;
  statusLabel: string;
  hasErrors: boolean;
  validationValid: boolean;
  isValidating: boolean;
  busy: UnitModelWorkspaceBusy;
  canUseLoadedRoot: boolean;
  canOperateOnRoot: boolean;
  canExportModels: boolean;
  onOpenFolder: () => void;
  onExtractFhm2d: () => void;
  onOpenExvsCommon: () => void;
  onUseLoadedRoot: () => void;
  onValidate: () => void;
  onRepack: () => void;
  onCopyReviewPayload: () => void;
  onExportModels: () => void;
  showGrid: boolean;
  showAxes: boolean;
  wireframe: boolean;
  showStats: boolean;
  onToggleGrid: () => void;
  onToggleAxes: () => void;
  onToggleWireframe: () => void;
  onToggleStats: () => void;
  onResetCamera: () => void;
};

export function UnitModelToolbar({
  folderName,
  statusLabel,
  hasErrors,
  validationValid,
  isValidating,
  busy,
  canUseLoadedRoot,
  canOperateOnRoot,
  canExportModels,
  onOpenFolder,
  onExtractFhm2d,
  onOpenExvsCommon,
  onUseLoadedRoot,
  onValidate,
  onRepack,
  onCopyReviewPayload,
  onExportModels,
  showGrid,
  showAxes,
  wireframe,
  showStats,
  onToggleGrid,
  onToggleAxes,
  onToggleWireframe,
  onToggleStats,
  onResetCamera,
}: UnitModelToolbarProps) {
  const { t } = useTranslation("unit-toolbar");
  const isBusy = busy !== null;
  const translatedStatusLabel = statusLabel.startsWith("EXVS Common · ")
    ? String(t("status.exvsCommon")).replace("{{status}}", translateStatus(statusLabel.slice("EXVS Common · ".length)))
    : translateStatus(statusLabel);

  function translateStatus(status: string) {
    if (status === "Checking...") return t("status.checking");
    if (status === "Ready to repack") return t("status.ready");
    if (status === "Pending validation") return t("status.pending");
    if (status === "No folder") return t("status.noFolder");
    const issues = status.match(/^(\d+) issue\(s\)$/);
    return issues ? t("status.issues", { count: Number(issues[1]) }) : status;
  }

  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b bg-muted/20 px-1.5 py-0.5">
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[10px]" disabled={isBusy}>
                <FolderOpen className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("file.label")}</span>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("file.tooltip")}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="text-xs">
          <DropdownMenuItem onClick={onOpenFolder}>
            <FolderOpen className="mr-2 h-3.5 w-3.5" />
            {t("file.openFolder")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onExtractFhm2d}>
            <PackageOpen className="mr-2 h-3.5 w-3.5" />
            {t("file.extractFhm2d")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenExvsCommon}>
            <ArchiveRestore className="mr-2 h-3.5 w-3.5" />
            {t("file.openExvsCommon")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onUseLoadedRoot} disabled={!canUseLoadedRoot}>
            <Boxes className="mr-2 h-3.5 w-3.5" />
            {t("file.useLoadedRoot")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onValidate}
            disabled={!canOperateOnRoot || isBusy || isValidating}
            aria-label={t("validate.aria")}
          >
            {busy === "validate" || isValidating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("validate.tooltip")}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onRepack}
            disabled={!canOperateOnRoot || isBusy}
            aria-label={t("repack.aria")}
          >
            <PackageCheck className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("repack.tooltip")}</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="mx-0.5 h-4" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onExportModels}
            disabled={!canExportModels || isBusy}
            aria-label={t("export.aria")}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("export.tooltip")}</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="mx-0.5 h-4" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={showGrid ? "secondary" : "ghost"}
            size="icon"
            className="h-6 w-6"
            onClick={onToggleGrid}
            aria-label={t("display.grid")}
          >
            <Grid3x3 className="h-3.5 w-3.5" />
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
            aria-label={t("display.axes")}
          >
            <Axis3D className="h-3.5 w-3.5" />
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
            aria-label={t("display.wireframe")}
          >
            <Boxes className="h-3.5 w-3.5" />
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
            aria-label={t("display.stats")}
          >
            <Activity className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("display.stats")}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onResetCamera} aria-label={t("display.resetCamera")}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("display.resetCamera")}</TooltipContent>
      </Tooltip>

      <div className="ml-auto flex min-w-0 items-center gap-2 pl-2">
        {folderName ? (
          <span className="hidden max-w-[180px] truncate text-[10px] text-muted-foreground md:inline">{folderName}</span>
        ) : null}
        <Badge
          variant="outline"
          className={cn(
            "h-5 shrink-0 px-1.5 text-[9px] font-normal",
            isValidating && "border-primary/40 text-primary",
            validationValid && "border-emerald-500/40 text-emerald-600",
            hasErrors && "border-destructive/40 text-destructive",
          )}
        >
          {translatedStatusLabel}
        </Badge>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={isBusy} aria-label={t("more.actions")}>
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("more.actions")}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem onClick={onCopyReviewPayload} disabled={!canOperateOnRoot}>
              <ClipboardCopy className="mr-2 h-3.5 w-3.5" />
              {t("more.copyReviewPayload")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
