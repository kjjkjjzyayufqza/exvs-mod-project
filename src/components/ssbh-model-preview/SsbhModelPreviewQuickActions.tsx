import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  ClipboardCopy,
  Eraser,
  FileDown,
  FileUp,
  FolderInput,
  HelpCircle,
  History,
  Layers,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Scan,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useSsbhModelPreview } from "./SsbhModelPreviewContext";
import { ModelAttachmentModal } from "./ModelAttachmentModal";

function shortPath(path: string, maxLen: number): string {
  const t = path.replace(/\\/g, "/");
  if (t.length <= maxLen) return t;
  return `…${t.slice(-(maxLen - 1))}`;
}

export function SsbhModelPreviewQuickActions({ className }: { className?: string }) {
  const { t } = useTranslation("ssbh-root-c");
  const p = useSsbhModelPreview();
  const toolbarRef = useRef<HTMLDivElement>(null);

  const onCopyPath = useCallback(async () => {
    if ((p.bundle?.sourceKind ?? "disk") !== "disk") {
      throw new Error("Copy path is only available for disk-backed preview models.");
    }
    const path = p.bundle?.modlPath?.trim();
    if (!path) {
      throw new Error("No model path to copy.");
    }
    await navigator.clipboard.writeText(path);
    toast.success(t("toast.pathCopied"));
  }, [p.bundle?.modlPath]);

  const onOpenModelFolder = useCallback(async () => {
    if ((p.bundle?.sourceKind ?? "disk") !== "disk") {
      throw new Error("Open folder is only available for disk-backed preview models.");
    }
    const folder = p.bundle?.rootFolder?.trim();
    if (!folder) {
      throw new Error("No model folder to open.");
    }
    await openPath(folder);
  }, [p.bundle?.rootFolder]);

  const onClearScene = useCallback(() => {
    try {
      p.clearScene();
      toast.success(t("toast.sceneCleared"), { description: t("toast.modelUnloaded") });
    } catch (e) {
      toast.error(String(e));
    }
  }, [p]);

  const onReload = useCallback(async () => {
    try {
      await p.reloadCurrentModel();
      toast.success(t("toast.modelReloaded"));
    } catch (e) {
      toast.error(String(e));
    }
  }, [p]);

  const onResetDisplay = useCallback(() => {
    p.resetDisplaySettingsToDefaults();
    toast.success(t("toast.displayReset"), { description: t("toast.displayResetDescription") });
  }, [p]);

  const onKeyDownToolbar = useCallback(
    (e: React.KeyboardEvent) => {
      if (!toolbarRef.current?.contains(e.target as Node)) return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        p.requestCameraFit();
      }
      if (e.key === "r" || e.key === "R") {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (!p.bundle?.modlPath || p.previewBusy) return;
        e.preventDefault();
        void onReload();
      }
    },
    [onReload, p.bundle?.modlPath, p.previewBusy, p],
  );

  const busy = p.previewBusy;
  const hasModel = Boolean(p.bundle?.modlPath);
  const hasOnlyDiskModels = p.previewInstances.every((inst) => inst.bundle.sourceKind === "disk");
  const activeBundleIsDisk = (p.bundle?.sourceKind ?? "disk") === "disk";

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      tabIndex={0}
      aria-label={t("quickActions.ariaLabel")}
      onKeyDown={onKeyDownToolbar}
      className={cn("flex flex-wrap items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm", className)}
    >
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy || !hasModel}
        title={t("quickActions.clearSceneHelp")}
        onClick={onClearScene}
      >
        <Eraser className="h-3.5 w-3.5 mr-1" />
        {t("quickActions.clearScene")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy || !hasModel || !hasOnlyDiskModels}
        title={t("quickActions.reloadHelp")}
        onClick={() => void onReload()}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
        {t("quickActions.reload")}
      </Button>
      <ModelAttachmentModal />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy || !hasOnlyDiskModels}
        onClick={() => void p.exportSceneConfig().catch((e) => toast.error(String(e)))}
      >
        <FileDown className="h-3.5 w-3.5 mr-1" />
        {t("quickActions.exportScene")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => void p.importSceneConfig().catch((e) => toast.error(String(e)))}
      >
        <FileUp className="h-3.5 w-3.5 mr-1" />
        {t("quickActions.importScene")}
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" size="sm" variant="secondary" className="gap-1">
            <MoreHorizontal className="h-3.5 w-3.5" />
            {t("quickActions.more")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(100vw-24px,22rem)] p-0" align="start">
          <ScrollArea className="max-h-[min(70vh,420px)]">
            <div className="p-3 space-y-3">
              <p className="text-[10px] text-muted-foreground leading-snug -mt-0.5 pb-2 border-b border-border/60">
                {t("quickActions.openFromToolbar")}
              </p>
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <History className="h-3 w-3" />
                    {t("quickActions.recent")}
                  </span>
                  {p.recentModelPaths.length > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-muted-foreground"
                      disabled={busy}
                      onClick={() => {
                        p.clearRecentModelPaths();
                        toast.message(t("toast.recentCleared"));
                      }}
                    >
                      {t("quickActions.clearList")}
                    </Button>
                  ) : null}
                </div>
                {p.recentModelPaths.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground py-1">{t("quickActions.noRecentModels")}</p>
                ) : (
                  <ul className="space-y-0.5 max-h-[140px] overflow-y-auto pr-1">
                    {p.recentModelPaths.map((path) => (
                      <li
                        key={path}
                        className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/20 px-1.5 py-1"
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left text-[10px] leading-tight truncate hover:underline"
                          title={path}
                          disabled={busy}
                          onClick={() => void p.loadModelAt(path)}
                        >
                          {shortPath(path, 42)}
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          title={t("quickActions.removeRecent")}
                          disabled={busy}
                          onClick={() => p.removeRecentModelPath(path)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Separator />

              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                  {t("quickActions.pathAndFiles")}
                </p>
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="justify-start h-8 text-[11px]"
                    disabled={!hasModel || !activeBundleIsDisk}
                    onClick={() => void onCopyPath().catch((e) => toast.error(String(e)))}
                  >
                    <ClipboardCopy className="h-3.5 w-3.5 mr-2 shrink-0" />
                    {t("quickActions.copyNumdlbPath")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="justify-start h-8 text-[11px]"
                    disabled={!hasModel || !activeBundleIsDisk}
                    onClick={() => void onOpenModelFolder().catch((e) => toast.error(String(e)))}
                  >
                    <FolderInput className="h-3.5 w-3.5 mr-2 shrink-0" />
                    {t("quickActions.openFolder")}
                  </Button>
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                  {t("quickActions.viewAndMeshes")}
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="justify-start h-8 text-[11px]"
                    disabled={!p.draws.length}
                    onClick={onResetDisplay}
                  >
                    <Scan className="h-3.5 w-3.5 mr-2 shrink-0" />
                    {t("quickActions.resetDisplay")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="justify-start h-8 text-[11px]"
                    disabled={!p.draws.length}
                    onClick={p.showAllMeshes}
                  >
                    <Layers className="h-3.5 w-3.5 mr-2 shrink-0" />
                    {t("quickActions.showAllMeshes")}
                  </Button>
                  <div className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-2 py-1.5">
                    <span className="text-[11px] text-muted-foreground">{t("quickActions.wireframe")}</span>
                    <Switch checked={p.wireframe} onCheckedChange={p.setWireframe} disabled={!p.draws.length} />
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                  <HelpCircle className="h-3 w-3" />
                  {t("quickActions.shortcuts")}
                </p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {t("quickActions.shortcutsHelp")}
                </p>
              </div>
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
