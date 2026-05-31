import { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { AlertTriangle, CheckCircle2, ClipboardCopy, FolderOpen, Info, PackageCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useSsbhModelPreview } from "@/components/ssbh-model-preview/SsbhModelPreviewPanel";
import {
  formatUnitModelReviewPayload,
  inferUnitModelStructurePath,
  repackValidatedUnitModelFolder,
  validateUnitModelForRepack,
  type UnitModelRepackResult,
  type UnitModelValidationResult,
} from "../utils/unitModelRepackService";

type Props = {
  unitRoot: string | null;
  onUnitRootChange: (path: string | null) => void;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function inferLoadedRoot(preview: ReturnType<typeof useSsbhModelPreview>): string | null {
  const active = preview.previewInstances.find((inst) => inst.id === preview.activePreviewInstanceId);
  const bundle = active?.bundle ?? preview.previewInstances[0]?.bundle ?? preview.bundle;
  if (!bundle || bundle.sourceKind !== "disk") return null;
  return bundle.rootFolder || null;
}

export function UnitModelToolsPanel({ unitRoot, onUnitRootChange }: Props) {
  const preview = useSsbhModelPreview();
  const loadedRoot = inferLoadedRoot(preview);
  const activeRoot = unitRoot ?? loadedRoot;
  const structurePath = useMemo(() => {
    if (!activeRoot) return null;
    try {
      return inferUnitModelStructurePath(activeRoot);
    } catch {
      return null;
    }
  }, [activeRoot]);
  const [validation, setValidation] = useState<UnitModelValidationResult | null>(null);
  const [lastRepack, setLastRepack] = useState<UnitModelRepackResult | null>(null);
  const [busy, setBusy] = useState<"pick" | "validate" | "repack" | null>(null);

  const hasErrors = Boolean(validation && validation.errors.length > 0);
  const statusLabel = validation ? (validation.valid ? "Ready to repack" : "Blocked") : "Not validated";

  const pickUnitFolder = async () => {
    setBusy("pick");
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: activeRoot ?? preview.workspaceRoot ?? undefined,
      });
      if (typeof selected !== "string" || !selected.trim()) return;
      onUnitRootChange(selected);
      await preview.loadModelAt(selected);
      setValidation(null);
      setLastRepack(null);
    } catch (error) {
      toast.error("Failed to open unit model folder", { description: String(error) });
    } finally {
      setBusy(null);
    }
  };

  const useLoadedRoot = () => {
    if (!loadedRoot) return;
    onUnitRootChange(loadedRoot);
    toast.success("Using loaded model root");
  };

  const runValidation = async () => {
    if (!activeRoot || !structurePath) {
      toast.error("No unit model folder selected");
      return null;
    }
    setBusy("validate");
    try {
      const result = await validateUnitModelForRepack(activeRoot, structurePath);
      setValidation(result);
      if (result.valid) {
        toast.success("Unit model validation passed");
      } else {
        toast.error("Unit model validation failed", {
          description: `${result.errors.length} issue(s) must be fixed before repack`,
        });
      }
      return result;
    } catch (error) {
      toast.error("Validation command failed", { description: String(error) });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const runRepack = async () => {
    if (!activeRoot || !structurePath) {
      toast.error("No unit model folder selected");
      return;
    }
    setBusy("repack");
    try {
      const result = await validateUnitModelForRepack(activeRoot, structurePath);
      setValidation(result);
      if (!result.valid) {
        toast.error("Repack blocked by validation", {
          description: `${result.errors.length} issue(s) must be fixed first`,
        });
        return;
      }
      const repack = await repackValidatedUnitModelFolder(activeRoot, structurePath);
      setLastRepack(repack);
      toast.success("Unit model repacked", { description: repack.outputPath });
    } catch (error) {
      toast.error("Unit model repack failed", { description: String(error) });
    } finally {
      setBusy(null);
    }
  };

  const copyReviewPayload = async () => {
    try {
      await writeText(
        formatUnitModelReviewPayload(validation, {
          outputPath: lastRepack?.outputPath ?? null,
          activeModelRoot: activeRoot ?? null,
        }),
      );
      toast.success("Copied unit model review payload");
    } catch (error) {
      toast.error("Failed to copy review payload", { description: String(error) });
    }
  };

  const openOutputInExplorer = async () => {
    if (!lastRepack?.outputPath) return;
    await revealItemInDir(lastRepack.outputPath);
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-r bg-background">
      <div className="shrink-0 border-b px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">Unit Model Editor</h2>
            <p className="text-[11px] text-muted-foreground">{statusLabel}</p>
          </div>
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
              validation?.valid
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                : hasErrors
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-muted-foreground/20 text-muted-foreground",
            )}
          >
            {validation?.valid ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          </div>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          <section className="space-y-2 border-b pb-3">
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" size="sm" onClick={() => void pickUnitFolder()} disabled={busy !== null}>
                <FolderOpen className="mr-2 h-4 w-4" />
                Open
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={useLoadedRoot}
                disabled={!loadedRoot || busy !== null}
              >
                <Info className="mr-2 h-4 w-4" />
                Use loaded
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void runValidation()}
                disabled={!activeRoot || busy !== null}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Validate
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void runRepack()}
                disabled={!activeRoot || busy !== null}
              >
                <PackageCheck className="mr-2 h-4 w-4" />
                Repack
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => void copyReviewPayload()}
              disabled={!activeRoot}
            >
              <ClipboardCopy className="mr-2 h-4 w-4" />
              Copy AI review payload
            </Button>
          </section>

          <section className="space-y-1.5 border-b pb-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Paths</h3>
            <div className="space-y-1.5 text-[11px]">
              <div>
                <div className="text-muted-foreground">Model root</div>
                <div className="wrap-break-word font-mono">{activeRoot ?? "None"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Structure JSON</div>
                <div className="wrap-break-word font-mono">{structurePath ?? "None"}</div>
              </div>
            </div>
          </section>

          <section className="space-y-2 border-b pb-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Validation Summary</h3>
            {validation ? (
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <Metric label="Models" value={validation.summary.modelCount} />
                <Metric label="NUMATB" value={validation.summary.numatbCount} />
                <Metric label="NUHLPB" value={validation.summary.nuhlpbCount} />
                <Metric label="SHL files" value={validation.summary.shlCount} />
                <Metric label="SHL models" value={validation.summary.shlDeclaredModelCount ?? "-"} />
                <Metric label="Texture refs" value={validation.summary.textureReferenceCount} />
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">Run Validate to inspect required files, structure flags, and texture references.</p>
            )}
          </section>

          {lastRepack && (
            <section className="space-y-2 border-b pb-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Last Repack</h3>
              <div className="space-y-1 text-[11px]">
                <div className="wrap-break-word font-mono">{lastRepack.outputPath}</div>
                <div className="text-muted-foreground">
                  {lastRepack.totalFiles} files, {formatBytes(lastRepack.outputSize)}
                </div>
              </div>
              <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => void openOutputInExplorer()}>
                Reveal output
              </Button>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Issues</h3>
            {validation?.errors.length ? (
              <div className="space-y-2">
                {validation.errors.map((error, index) => (
                  <div key={`${error.phase}-${index}`} className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-destructive">{error.phase}</span>
                      {error.model && <span className="truncate font-mono text-muted-foreground">{error.model}</span>}
                    </div>
                    <p className="mt-1">{error.message}</p>
                    {error.path && <p className="mt-1 wrap-break-word font-mono text-muted-foreground">{error.path}</p>}
                  </div>
                ))}
              </div>
            ) : validation ? (
              <p className="text-[11px] text-emerald-600">No blocking validation issues.</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">No validation result yet.</p>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-muted/20 px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-mono text-sm font-semibold">{value}</div>
    </div>
  );
}
