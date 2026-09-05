import { open } from "@tauri-apps/plugin-dialog";
import {
  Box,
  Clapperboard,
  FileInput,
  FileVideo,
  FolderOpen,
  Layers,
  ListTree,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Scissors,
  X,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { DialogLastPathKey, getDialogDefaultPath, rememberDialogSelection } from "@/utils/dialogLastPath";
import { MotionBatchExportPanel } from "./components/MotionBatchExportPanel";
import { MotionClipOpsPanel } from "./components/MotionClipOpsPanel";
import { MotionClipPathSearchSelect } from "./components/MotionClipPathSearchSelect";
import { MotionFbxExportPanel } from "./components/MotionFbxExportPanel";
import { MotionFbxImportPanel } from "./components/MotionFbxImportPanel";
import {
  inspectMotionFbx,
  type MotionFbxInspectReport,
} from "./motionFbxImportService";
import { MayaSection } from "./MayaInspectorSection";
import { useSsbhModelPreview } from "./SsbhModelPreviewContext";
import { shouldIsolateMotionTarget } from "./viewportSelectionPolicy";

const TAB_TRIGGER =
  "h-7 flex-1 rounded-sm px-2 text-[10px] font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm";

type MotionPanelTab = "source" | "convert" | "edit";

function basename(path: string): string {
  const n = path.replace(/\\/g, "/");
  const parts = n.split("/");
  return parts[parts.length - 1] ?? path;
}

type PendingFbxPreview = {
  fbxPath: string;
  inspect: MotionFbxInspectReport;
};

export function SsbhModelPreviewMotionPanel() {
  const { t } = useTranslation("ssbh-motion");
  const p = useSsbhModelPreview();
  const [tab, setTab] = useState<MotionPanelTab>("source");
  const [previewBusyLocal, setPreviewBusyLocal] = useState(false);
  const [pendingFbx, setPendingFbx] = useState<PendingFbxPreview | null>(null);
  const manifestGroups = p.motionManifest?.groupSummaries?.length ?? 0;
  const activeInstance =
    p.previewInstances.find((instance) => instance.id === p.activePreviewInstanceId) ?? null;
  const activeMotionState = activeInstance
    ? (p.motionStatesByInstanceId.get(activeInstance.id) ?? null)
    : null;
  const compatibility = p.motionClip?.compatibility ?? null;
  const busy = p.previewBusy || previewBusyLocal;
  const hasClip = Boolean(p.motionSelectedNuanmbPath);
  const skeletonPath = activeInstance?.bundle.skelPath ?? null;

  const runFbxPreviewWithStack = async (fbxPath: string, animationStackName: string | null) => {
    setPreviewBusyLocal(true);
    try {
      await p.pickMotionFbxPreview({ fbxPath, animationStackName });
      setPendingFbx(null);
    } catch (error) {
      if (!(error instanceof Error)) {
        toast.error(String(error));
      }
    } finally {
      setPreviewBusyLocal(false);
    }
  };

  const runFbxPreview = async () => {
    if (!activeInstance) {
      toast.error(t("motionPanel.selectTargetFirst"));
      return;
    }
    if (!skeletonPath) {
      toast.error(t("motionPanel.needsNusktbPreview"));
      return;
    }

    // Continue multi-stack choice.
    if (pendingFbx) {
      return;
    }

    setPreviewBusyLocal(true);
    try {
      const picked = await open({
        title: t("motionPanel.chooseFbxPreview"),
        multiple: false,
        filters: [{ name: "FBX", extensions: ["fbx"] }],
        defaultPath: getDialogDefaultPath(
          DialogLastPathKey.ssbhPreviewOpenMotionFbx,
          p.workspaceRoot,
        ),
      });
      if (typeof picked !== "string" || !picked.trim()) return;
      rememberDialogSelection(DialogLastPathKey.ssbhPreviewOpenMotionFbx, picked, "file");

      const inspect = await inspectMotionFbx(picked.trim());
      if (inspect.stacks.length > 1) {
        setPendingFbx({ fbxPath: picked.trim(), inspect });
        toast.message(t("motionPanel.multipleStacks"), {
          description: t("motionPanel.pickStack"),
        });
        return;
      }
      await p.pickMotionFbxPreview({
        fbxPath: picked.trim(),
        animationStackName: inspect.stacks[0]?.name ?? null,
      });
    } catch (error) {
      if (!(error instanceof Error)) {
        toast.error(String(error));
      }
    } finally {
      setPreviewBusyLocal(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-col gap-0">
      {/* Sticky context: always-visible target + clip status */}
      <div className="sticky top-0 z-10 space-y-2 border-b border-border/60 bg-background/95 px-0.5 pb-2.5 pt-0.5 backdrop-blur-sm">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[10px] font-medium tracking-wide text-muted-foreground">
              {t("motionPanel.targetModel")}
            </Label>
            {activeInstance && p.previewInstances.length > 1 ? (
              <span
                className={cn(
                  "rounded-sm px-1.5 py-0.5 font-mono text-[9px]",
                  p.previewViewMode === "single"
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {p.previewViewMode === "single" ? t("motionPanel.solo") : t("motionPanel.allVisible")}
              </span>
            ) : null}
          </div>
          <Select
            value={activeInstance?.id}
            disabled={busy || p.previewInstances.length === 0}
            onValueChange={(id) => {
              // Lock motion work onto this model: solo others away and never
              // carry Inspect's yellow selection glow into motion preview.
              p.setSelectionOutlineEnabled(false);
              p.setActivePreviewInstanceId(id);
              if (shouldIsolateMotionTarget(p.previewInstances.length)) {
                if (p.previewViewMode !== "single") {
                  p.setPreviewViewMode("single");
                }
                if (p.previewControlScope !== "single") {
                  p.setPreviewControlScope("single");
                }
              }
            }}
          >
            <SelectTrigger className="h-8 text-[11px]">
              <Box className="mr-1 h-3.5 w-3.5 shrink-0 opacity-80" />
              <SelectValue placeholder={t("motionPanel.selectModel")} />
            </SelectTrigger>
            <SelectContent>
              {p.previewInstances.map((instance) => (
                <SelectItem key={instance.id} value={instance.id} className="text-[11px]">
                  {instance.displayLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeInstance && p.previewInstances.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="flex-1 text-[9px] leading-snug text-muted-foreground">
                {p.previewViewMode === "single"
                  ? t("motionPanel.soloHint")
                  : t("motionPanel.isolateHint")}
              </p>
              {p.previewViewMode === "single" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 shrink-0 px-1.5 text-[10px]"
                  disabled={busy}
                  onClick={() => p.setPreviewViewMode("all")}
                  title={t("motionPanel.showAllTitle")}
                >
                  {t("motionPanel.showAll")}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-6 shrink-0 px-1.5 text-[10px]"
                  disabled={busy}
                  onClick={() => {
                    p.setPreviewViewMode("single");
                    p.setPreviewControlScope("single");
                  }}
                  title={t("motionPanel.soloTargetTitle")}
                >
                  {t("motionPanel.soloTarget")}
                </Button>
              )}
            </div>
          ) : null}
        </div>

        {p.motionNuanmbPaths.length > 0 ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] font-medium tracking-wide text-muted-foreground">
                {t("motionPanel.activeClip")}
              </Label>
              {p.motionPlaying ? (
                <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] font-medium text-primary">
                  {t("motionPanel.playing")}
                </span>
              ) : hasClip ? (
                <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                  {t("motionPanel.loaded")}
                </span>
              ) : null}
            </div>
            <MotionClipPathSearchSelect
              paths={p.motionNuanmbPaths}
              value={p.motionSelectedNuanmbPath}
              disabled={busy}
              onChange={(path) => {
                p.setMotionSelectedNuanmbPath(path);
                p.setMotionFrame(0);
                p.setMotionPlaying(false);
              }}
            />

          </div>
        ) : (
          <p className="rounded-md border border-dashed border-border/70 bg-muted/20 px-2.5 py-2 text-[10px] leading-relaxed text-muted-foreground">
            {t("motionPanel.emptyHint")}
          </p>
        )}

        {p.motionSampling ? (
          <p className="text-[10px] text-muted-foreground">{t("motionPanel.sampling")}</p>
        ) : compatibility ? (
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
            {t("motionPanel.compatible", {
              matched: compatibility.matchedBoneCount,
              nodes: compatibility.animationTransformNodeCount,
              bones: compatibility.skeletonBoneCount,
            })}
          </p>
        ) : null}
        {p.motionSampleError ? (
          <p className="text-[10px] text-destructive wrap-anywhere" data-i18n-ignore="">{p.motionSampleError}</p>
        ) : null}
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as MotionPanelTab)}
        className="mt-2 flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="grid h-8 w-full shrink-0 grid-cols-3 rounded-md bg-muted/40 p-0.5">
          <TabsTrigger value="source" className={TAB_TRIGGER}>
            {t("motionPanel.tabSource")}
          </TabsTrigger>
          <TabsTrigger value="convert" className={TAB_TRIGGER}>
            {t("motionPanel.tabConvert")}
          </TabsTrigger>
          <TabsTrigger value="edit" className={TAB_TRIGGER}>
            {t("motionPanel.tabEdit")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="source" className="mt-2 space-y-3 focus-visible:outline-none">
          <section className="rounded-md border border-border/60 bg-muted/10 p-2.5">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Clapperboard className="h-3.5 w-3.5 opacity-80" />
              {t("motionPanel.openForPreview")}
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="default"
                className="h-8 justify-start text-[11px]"
                disabled={busy || !activeInstance || Boolean(pendingFbx)}
                onClick={() => {
                  void runFbxPreview();
                }}
                title={t("motionPanel.previewFbxTitle")}
              >
                {previewBusyLocal ? (
                  <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileInput className="mr-1.5 h-3.5 w-3.5" />
                )}
                {t("motionPanel.previewAnimationFbx")}
              </Button>
              {pendingFbx ? (
                <div className="rounded-md border border-border/60 bg-muted/30 px-2 py-1.5">
                  <div className="mb-1 flex items-center gap-1 text-[10px] font-medium">
                    <Layers className="h-3.5 w-3.5 opacity-80" />
                    {t("motionPanel.pickStackHeading")}
                  </div>
                  <p
                    className="mb-1.5 truncate font-mono text-[9px] text-muted-foreground"
                    title={pendingFbx.fbxPath}
                  >
                    {basename(pendingFbx.fbxPath)}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {pendingFbx.inspect.stacks.map((stack) => (
                      <Button
                        key={stack.name}
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-6 text-[10px]"
                        disabled={busy}
                        onClick={() => {
                          void runFbxPreviewWithStack(pendingFbx.fbxPath, stack.name);
                        }}
                      >
                        {t("motionPanel.stackFrames", { name: stack.name, count: stack.frameCount })}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px]"
                      disabled={busy}
                      onClick={() => setPendingFbx(null)}
                    >
                      {t("motionPanel.cancel")}
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 justify-start text-[11px]"
                  disabled={busy}
                  onClick={() => void p.pickMotionNuanmbFile()}
                >
                  <FileVideo className="mr-1.5 h-3.5 w-3.5" />
                  {t("motionPanel.openNuanmb")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 justify-start text-[11px]"
                  disabled={busy}
                  onClick={() =>
                    void p.pickMotionFolder().catch((e) => {
                      toast.error(String(e));
                    })
                  }
                >
                  <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                  {t("motionPanel.openFolder")}
                </Button>
              </div>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
              {t("motionPanel.previewHelp")}
            </p>
          </section>

          <section className="rounded-md border border-border/50 p-2">
            <div className="mb-1.5 text-[10px] font-medium text-muted-foreground">{t("motionPanel.clipActions")}</div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[10px]"
                disabled={!hasClip}
                onClick={p.reloadMotionClip}
              >
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                {t("motionPanel.reload")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[10px]"
                disabled={!p.motionClip || !activeMotionState?.poseEnabled}
                onClick={p.resetMotionPose}
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                {t("motionPanel.tPose")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={cn(
                  "h-7 text-[10px]",
                  hasClip || p.motionNuanmbPaths.length > 0
                    ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
                    : "",
                )}
                disabled={!hasClip && p.motionNuanmbPaths.length === 0}
                onClick={p.clearMotion}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                {t("motionPanel.clear")}
              </Button>
            </div>
          </section>

          <MayaSection
            title={t("motionPanel.clipMetadata")}
            icon={<ListTree className="h-3.5 w-3.5 opacity-80" />}
            defaultOpen={false}
          >
            <div className="flex flex-col gap-2 text-[10px]">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("motionPanel.finalFrameIndex")}</span>
                <span className="font-mono tabular-nums">
                  {p.motionManifest?.finalFrameIndex?.toFixed(3) ?? "—"}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("motionPanel.groups")}</span>
                <span className="font-mono tabular-nums">{manifestGroups}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("motionPanel.skeletonMatch")}</span>
                <span className="font-mono tabular-nums">
                  {compatibility
                    ? `${compatibility.matchedBoneCount}/${compatibility.animationTransformNodeCount}`
                    : "—"}
                </span>
              </div>
              {p.motionManifest?.groupSummaries?.map((g) => (
                <div key={g.groupType + g.nodeCount} className="rounded border border-border/40 px-2 py-1">
                  <div className="font-medium" data-i18n-ignore="">{g.groupType}</div>
                  <div className="text-muted-foreground">{t("motionPanel.nodes", { count: g.nodeCount })}</div>
                </div>
              ))}
            </div>
          </MayaSection>
        </TabsContent>

        <TabsContent value="convert" className="mt-2 space-y-3 focus-visible:outline-none">
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            {t("motionPanel.convertHint")}
          </p>
          <MotionFbxImportPanel
            skeletonPath={skeletonPath}
            selectedNuanmbPath={p.motionSelectedNuanmbPath}
            workspaceRoot={p.workspaceRoot}
            disabled={busy}
            onImported={p.loadMotionNuanmbPath}
          />
          <MotionFbxExportPanel
            selectedNuanmbPath={p.motionSelectedNuanmbPath}
            skeletonPath={skeletonPath}
            numdlbPath={activeInstance?.bundle.modlPath ?? null}
            workspaceRoot={p.workspaceRoot}
            disabled={busy}
          />
          {p.motionNuanmbPaths.length > 1 ? (
            <MotionBatchExportPanel
              nuanmbPaths={p.motionNuanmbPaths}
              skeletonPath={skeletonPath}
              numdlbPath={activeInstance?.bundle.modlPath ?? null}
              workspaceRoot={p.workspaceRoot}
              disabled={busy}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="edit" className="mt-2 space-y-3 focus-visible:outline-none">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Scissors className="h-3.5 w-3.5 opacity-80" />
            {t("motionPanel.trimHint")}
          </div>
          <MotionClipOpsPanel
            key={p.motionSelectedNuanmbPath ?? "no-clip"}
            selectedNuanmbPath={p.motionSelectedNuanmbPath}
            skeletonPath={skeletonPath}
            finalFrameIndex={p.motionManifest?.finalFrameIndex ?? null}
            workspaceRoot={p.workspaceRoot}
            disabled={busy}
            onTransformed={p.loadMotionNuanmbPath}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
