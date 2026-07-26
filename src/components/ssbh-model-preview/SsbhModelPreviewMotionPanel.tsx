import { Box, FileVideo, FolderOpen, ListTree, RefreshCw, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MotionBatchExportPanel } from "./components/MotionBatchExportPanel";
import { MotionClipOpsPanel } from "./components/MotionClipOpsPanel";
import { MotionClipPathSearchSelect } from "./components/MotionClipPathSearchSelect";
import { MotionFbxExportPanel } from "./components/MotionFbxExportPanel";
import { MotionFbxImportPanel } from "./components/MotionFbxImportPanel";
import { MayaSection } from "./MayaInspectorSection";
import { useSsbhModelPreview } from "./SsbhModelPreviewContext";

export function SsbhModelPreviewMotionPanel() {
  const p = useSsbhModelPreview();
  const manifestGroups = p.motionManifest?.groupSummaries?.length ?? 0;
  const activeInstance =
    p.previewInstances.find((instance) => instance.id === p.activePreviewInstanceId) ?? null;
  const activeMotionState = activeInstance
    ? (p.motionStatesByInstanceId.get(activeInstance.id) ?? null)
    : null;
  const compatibility = p.motionClip?.compatibility ?? null;

  return (
    <div className="flex flex-col gap-3">
      <MayaSection title="Motion source" icon={<FileVideo className="h-3.5 w-3.5 opacity-80" />} defaultOpen>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-[10px] text-muted-foreground">Target model</Label>
            <Select
              value={activeInstance?.id}
              disabled={p.previewBusy || p.previewInstances.length === 0}
              onValueChange={p.setActivePreviewInstanceId}
            >
              <SelectTrigger className="h-8 text-[11px]">
                <Box className="mr-1 h-3.5 w-3.5 shrink-0" />
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {p.previewInstances.map((instance) => (
                  <SelectItem key={instance.id} value={instance.id} className="text-[11px]">
                    {instance.displayLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 text-[10px]"
              disabled={p.previewBusy}
              onClick={() => void p.pickMotionNuanmbFile()}
            >
              <FileVideo className="mr-1 h-3.5 w-3.5" />
              Open .nuanmb
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 text-[10px]"
              disabled={p.previewBusy}
              onClick={() =>
                void p.pickMotionFolder().catch((e) => {
                  toast.error(String(e));
                })
              }
            >
              <FolderOpen className="mr-1 h-3.5 w-3.5" />
              Open motion folder
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[10px]"
              disabled={!p.motionSelectedNuanmbPath}
              onClick={p.reloadMotionClip}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              Reload motion
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
              T-pose
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[10px]"
              disabled={!p.motionSelectedNuanmbPath && p.motionNuanmbPaths.length === 0}
              onClick={p.clearMotion}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Clear motion
            </Button>
          </div>
          {p.motionNuanmbPaths.length > 0 ? (
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">NUANMB clip</Label>
              <MotionClipPathSearchSelect
                paths={p.motionNuanmbPaths}
                value={p.motionSelectedNuanmbPath}
                disabled={p.previewBusy}
                onChange={(path) => {
                  p.setMotionSelectedNuanmbPath(path);
                  p.setMotionFrame(0);
                  p.setMotionPlaying(false);
                }}
              />
            </div>
          ) : null}
          {p.motionSampling ? (
            <p className="text-[10px] text-muted-foreground">Validating skeleton and sampling clip...</p>
          ) : compatibility ? (
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
              Compatible: {compatibility.matchedBoneCount}/{compatibility.animationTransformNodeCount} animated
              bones matched this model&apos;s {compatibility.skeletonBoneCount}-bone nusktb.
            </p>
          ) : null}
          {p.motionSampleError ? (
            <p className="text-[10px] text-destructive wrap-anywhere">{p.motionSampleError}</p>
          ) : null}
        </div>
      </MayaSection>

      <MayaSection title="Clip metadata" icon={<ListTree className="h-3.5 w-3.5 opacity-80" />} defaultOpen={false}>
        <div className="flex flex-col gap-2 text-[10px]">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Final frame index</span>
            <span className="font-mono">{p.motionManifest?.finalFrameIndex?.toFixed(3) ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Groups</span>
            <span className="font-mono">{manifestGroups}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Skeleton match</span>
            <span className="font-mono">
              {compatibility
                ? `${compatibility.matchedBoneCount}/${compatibility.animationTransformNodeCount}`
                : "—"}
            </span>
          </div>
          {p.motionManifest?.groupSummaries?.map((g) => (
            <div key={g.groupType + g.nodeCount} className="rounded border border-border/40 px-2 py-1">
              <div className="font-medium">{g.groupType}</div>
              <div className="text-muted-foreground">Nodes: {g.nodeCount}</div>
            </div>
          ))}
        </div>
      </MayaSection>

      <MotionFbxExportPanel
        selectedNuanmbPath={p.motionSelectedNuanmbPath}
        skeletonPath={activeInstance?.bundle.skelPath ?? null}
        numdlbPath={activeInstance?.bundle.modlPath ?? null}
        workspaceRoot={p.workspaceRoot}
        disabled={p.previewBusy}
      />

      <MotionFbxImportPanel
        skeletonPath={activeInstance?.bundle.skelPath ?? null}
        selectedNuanmbPath={p.motionSelectedNuanmbPath}
        workspaceRoot={p.workspaceRoot}
        disabled={p.previewBusy}
        onImported={p.loadMotionNuanmbPath}
      />

      {p.motionNuanmbPaths.length > 1 ? (
        <MotionBatchExportPanel
          nuanmbPaths={p.motionNuanmbPaths}
          skeletonPath={activeInstance?.bundle.skelPath ?? null}
          numdlbPath={activeInstance?.bundle.modlPath ?? null}
          workspaceRoot={p.workspaceRoot}
          disabled={p.previewBusy}
        />
      ) : null}

      <MotionClipOpsPanel
        key={p.motionSelectedNuanmbPath ?? "no-clip"}
        selectedNuanmbPath={p.motionSelectedNuanmbPath}
        skeletonPath={activeInstance?.bundle.skelPath ?? null}
        finalFrameIndex={p.motionManifest?.finalFrameIndex ?? null}
        workspaceRoot={p.workspaceRoot}
        disabled={p.previewBusy}
        onTransformed={p.loadMotionNuanmbPath}
      />
    </div>
  );
}
