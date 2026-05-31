import { useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Boxes, FileUp, Loader2, Replace, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { HktSimplifyConfig } from "../dae-import/daeImportTypes";
import { DaeImportHktSimplifyFields } from "../dae-import/DaeImportHktSimplifyFields";
import {
  buildImportConfigForHktPreview,
  DEFAULT_HKT_SIMPLIFY,
  formatTriangleCount,
} from "../../utils/hktSimplifyUtils";
import {
  scenePreviewHktCollisionMeshPath,
  sceneReplaceHktFromDaePath,
  type HktCollisionMeshGeometry,
  type ImportConfig,
} from "../../utils/sceneSessionService";
import { HktCollisionPreviewCanvas } from "./HktCollisionPreviewCanvas";

interface GenerateHktFromModelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string | null;
  /** Resolved replace target id (already mapped to `folder/map_hit.hkt` for sub-models). */
  targetImportId: string | null;
  targetName: string;
  /** Invoked after a successful generate + replace so the scene can refresh HKT data. */
  onReplaced: (targetImportId: string) => void | Promise<void>;
}

function fileNameFromPath(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

export function GenerateHktFromModelDialog({
  open: isOpen,
  onOpenChange,
  sessionId,
  targetImportId,
  targetName,
  onReplaced,
}: GenerateHktFromModelDialogProps) {
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [simplify, setSimplify] = useState<HktSimplifyConfig>({ ...DEFAULT_HKT_SIMPLIFY });
  const [meshPreview, setMeshPreview] = useState<HktCollisionMeshGeometry | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const sourceName = useMemo(() => (sourcePath ? fileNameFromPath(sourcePath) : null), [sourcePath]);

  const importConfig: ImportConfig = useMemo(
    () =>
      buildImportConfigForHktPreview({
        generateHkt: true,
        convertToSsbh: false,
        ssbhConfig: null,
        hktSimplify: simplify,
      }),
    [simplify],
  );

  // Reset transient state every time the window opens for a fresh target.
  useEffect(() => {
    if (!isOpen) return;
    setSourcePath(null);
    setSimplify({ ...DEFAULT_HKT_SIMPLIFY });
    setMeshPreview(null);
    setPreviewError(null);
    setPreviewLoading(false);
    setApplying(false);
  }, [isOpen]);

  const simplifyKey = JSON.stringify(simplify);

  // Debounced live collision-mesh preview (Havok-free: parse -> merge -> simplify).
  useEffect(() => {
    if (!isOpen || !sourcePath || !sourceName) {
      setMeshPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const result = await scenePreviewHktCollisionMeshPath(sourcePath, sourceName, importConfig);
        if (!cancelled) setMeshPreview(result);
      } catch (err) {
        if (!cancelled) {
          setMeshPreview(null);
          setPreviewError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, sourcePath, sourceName, simplifyKey, importConfig]);

  const pickFile = async () => {
    try {
      const selected = await open({
        title: "Select model file for HKT collision",
        filters: [{ name: "Model", extensions: ["dae", "fbx"] }],
        multiple: false,
      });
      const next = typeof selected === "string" ? selected : Array.isArray(selected) ? selected[0] : null;
      if (!next) return;
      setSourcePath(next);
      setMeshPreview(null);
      setPreviewError(null);
    } catch (err) {
      toast.error("Failed to open file picker", { description: String(err) });
    }
  };

  const canApply =
    Boolean(sessionId && targetImportId && sourcePath && sourceName && meshPreview) &&
    !previewLoading &&
    !applying;

  const handleApply = async () => {
    if (!sessionId || !targetImportId || !sourcePath || !sourceName) return;
    setApplying(true);
    try {
      toast.loading(`Generating HKT from ${sourceName}...`, { id: "hkt-from-model" });
      await sceneReplaceHktFromDaePath(sessionId, targetImportId, sourcePath, sourceName, importConfig);
      await onReplaced(targetImportId);
      toast.success(`HKT replaced for ${targetName}`, {
        id: "hkt-from-model",
        description: `Rebuilt collision from ${sourceName}`,
      });
      onOpenChange(false);
    } catch (err) {
      toast.error("Generate HKT failed", {
        id: "hkt-from-model",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(next) => (!applying ? onOpenChange(next) : undefined)}>
      <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-1 border-b border-border/60 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            Generate HKT from New Model
          </DialogTitle>
          <DialogDescription className="text-xs">
            Read a fresh DAE or FBX, rebuild a Havok collision shape, and replace the collision for{" "}
            <span className="font-medium text-foreground">{targetName}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          {/* Controls */}
          <ScrollArea className="max-h-[68vh] border-b border-border/60 lg:border-b-0 lg:border-r">
            <div className="space-y-4 p-4">
              <section className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Replace className="h-3.5 w-3.5" />
                  Replace target
                </div>
                <p className="mt-1.5 break-all text-sm font-medium">{targetName}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Its current collision is overwritten when you apply.
                </p>
              </section>

              <section className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Source model
                </div>
                <Button
                  type="button"
                  variant={sourcePath ? "secondary" : "default"}
                  className="w-full justify-start"
                  onClick={() => void pickFile()}
                  disabled={applying}
                >
                  <FileUp className="mr-2 h-4 w-4" />
                  {sourcePath ? "Choose a different model" : "Choose model file (.dae / .fbx)"}
                </Button>
                {sourcePath ? (
                  <p className="break-all rounded-md bg-muted/30 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                    {sourcePath}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Only the geometry is read. The model is converted straight to collision; nothing else is imported.
                  </p>
                )}
              </section>

              {sourcePath ? (
                <DaeImportHktSimplifyFields
                  value={simplify}
                  onChange={setSimplify}
                  importConfig={importConfig}
                  sourcePath={sourcePath}
                  sourceName={sourceName ?? undefined}
                  compact
                />
              ) : null}
            </div>
          </ScrollArea>

          {/* Live collision preview */}
          <div className="relative min-h-[360px] bg-[#0b0f14] lg:min-h-[520px]">
            {meshPreview ? (
              <HktCollisionPreviewCanvas geometry={meshPreview} />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                <Boxes className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {previewError
                    ? "Could not build a collision preview"
                    : sourcePath
                      ? "Computing collision mesh..."
                      : "Select a model to preview its collision"}
                </p>
                {previewError ? (
                  <p className="max-w-sm break-words text-[11px] text-destructive">{previewError}</p>
                ) : null}
              </div>
            )}

            {previewLoading ? (
              <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-md bg-background/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
                <Loader2 className="h-3 w-3 animate-spin" />
                Updating
              </div>
            ) : null}

            {meshPreview ? (
              <div className="pointer-events-none absolute left-3 top-3 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 rounded-md bg-background/75 px-2.5 py-2 font-mono text-[10px] text-muted-foreground backdrop-blur">
                <span>Render</span>
                <span className="text-right tabular-nums">{formatTriangleCount(meshPreview.renderTriangleCount)}</span>
                <span>Merged</span>
                <span className="text-right tabular-nums">{formatTriangleCount(meshPreview.mergedTriangleCount)}</span>
                <span className="text-foreground">Collision</span>
                <span className="text-right tabular-nums text-emerald-400">
                  {formatTriangleCount(meshPreview.triangleCount)}
                </span>
                <span>Vertices</span>
                <span className="text-right tabular-nums">{formatTriangleCount(meshPreview.vertexCount)}</span>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="items-center gap-2 border-t border-border/60 px-5 py-3 sm:justify-between">
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5" />
            Generating the final HKT needs Havok Content Tools installed.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleApply()}
              disabled={!canApply}
              className={cn("transition-transform active:translate-y-px")}
            >
              {applying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Replace className="mr-2 h-4 w-4" />
              )}
              {applying ? "Generating HKT..." : "Generate & Replace HKT"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
