import { useMemo, useState } from "react";

import { open } from "@tauri-apps/plugin-dialog";
import { Boxes, FileBox, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { CopyInfoToAiButton } from "@/components/CopyInfoToAiButton";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { buildUnitModelStructureTree, type UnitModelTreeNode } from "../utils/unitModelStructureTree";
import { addUnitModelModel, removeUnitModelModel } from "../utils/unitModelModelService";

interface UnitModelModelManagerPanelProps {
  structureJson: unknown | null;
  structureJsonPath?: string | null;
  modelRoot?: string | null;
  selectedModelLabel?: string | null;
  onSelectModel?: (model: UnitModelTreeNode) => void;
  /** Called after a successful add/remove so the host can reload the structure JSON. */
  onMutated?: () => void;
  className?: string;
}

interface ModelSummary {
  node: UnitModelTreeNode;
  label: string;
  fileTypes: string[];
}

function directItemTypes(model: UnitModelTreeNode): string[] {
  const types: string[] = [];
  for (const child of model.children ?? []) {
    if (child.kind === "item" && child.fileType) types.push(child.fileType);
  }
  return types;
}

function collectModels(root: UnitModelTreeNode): UnitModelTreeNode[] {
  const models = (root.children ?? []).find((c) => c.role === "models");
  return (models?.children ?? []).filter((c) => c.role === "model-group");
}

/**
 * Structured list of the package's models (one folder per model), each with its file types and a
 * "Copy info to AI" affordance. Read surface for now; add / replace / remove model operations are
 * the documented Phase 5 continuation (DAE->SSBH import + structure-tree surgery + count sync).
 */
export function UnitModelModelManagerPanel({
  structureJson,
  structureJsonPath,
  modelRoot,
  selectedModelLabel,
  onSelectModel,
  onMutated,
  className,
}: UnitModelModelManagerPanelProps) {
  const [busy, setBusy] = useState<string | null>(null);

  const canMutate = Boolean(modelRoot && structureJsonPath);

  const handleAdd = async () => {
    if (!modelRoot || !structureJsonPath) {
      toast.error("Open or extract a unit-model folder first.");
      return;
    }
    setBusy("add");
    try {
      const source = await open({ directory: true, multiple: false });
      if (typeof source !== "string" || !source.trim()) return;
      const result = await addUnitModelModel(modelRoot, source, structureJsonPath);
      toast.success("Model added", { description: `${result.modelCount} models, ${result.totalFiles} files` });
      onMutated?.();
    } catch (error) {
      toast.error("Failed to add model", { description: String(error) });
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async (label: string) => {
    if (!modelRoot || !structureJsonPath) return;
    setBusy(`remove:${label}`);
    try {
      const result = await removeUnitModelModel(modelRoot, label, structureJsonPath);
      toast.success("Model removed", {
        description: `${result.modelCount} models, ${result.removedFiles.length} files deleted`,
      });
      onMutated?.();
    } catch (error) {
      toast.error("Failed to remove model", { description: String(error) });
    } finally {
      setBusy(null);
    }
  };

  const parsed = useMemo<{ models: ModelSummary[]; error: string | null }>(() => {
    if (structureJson == null) return { models: [], error: null };
    try {
      const tree = buildUnitModelStructureTree(structureJson);
      const models = collectModels(tree.root).map((node) => ({
        node,
        label: node.label,
        fileTypes: directItemTypes(node),
      }));
      return { models, error: null };
    } catch (error) {
      return { models: [], error: error instanceof Error ? error.message : String(error) };
    }
  }, [structureJson]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-card/40", className)}>
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Boxes className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-semibold tracking-tight">Models</h2>
          {parsed.models.length > 0 ? (
            <span className="font-mono text-[11px] text-muted-foreground">{parsed.models.length}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={!canMutate || busy !== null}
            onClick={() => void handleAdd()}
            title="Add a model from a prepared SSBH source folder (e.g. a DAE/FBX export)"
          >
            {busy === "add" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-3.5 w-3.5" aria-hidden />
            )}
            <span className="text-xs font-medium">Add</span>
          </Button>
          {parsed.models.length > 0 ? (
            <CopyInfoToAiButton
              label="Copy models to AI"
              buildPayload={() => ({
                kind: "unit-model-list",
                scope: "models",
                note: structureJsonPath ? `from ${structureJsonPath}` : undefined,
                data: parsed.models.map((m) => ({ label: m.label, fileTypes: m.fileTypes, node: m.node })),
              })}
            />
          ) : null}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {parsed.error ? (
          <div className="m-3 rounded-md border border-red-500/40 bg-red-500/5 p-3 text-xs text-red-600 dark:text-red-400">
            Failed to read models: {parsed.error}
          </div>
        ) : parsed.models.length > 0 ? (
          <ul className="divide-y">
            {parsed.models.map((model) => {
              const isSelected = selectedModelLabel != null && selectedModelLabel === model.label;
              return (
                <li
                  key={model.node.id}
                  className={cn(
                    "group flex items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/60",
                    isSelected && "bg-primary/10",
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => onSelectModel?.(model.node)}
                  >
                    <FileBox
                      className={cn("h-4 w-4 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium leading-5">{model.label}</p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">
                        {model.fileTypes.join(" ") || "no direct files"}
                      </p>
                    </div>
                  </button>
                  <CopyInfoToAiButton
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    label={`Copy ${model.label} info to AI`}
                    buildPayload={() => ({
                      kind: "unit-model",
                      scope: `model:${model.label}`,
                      note: structureJsonPath ? `from ${structureJsonPath}` : undefined,
                      data: model.node,
                    })}
                  />
                  {canMutate ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-muted-foreground opacity-0 transition-colors hover:text-red-600 group-hover:opacity-100 focus-visible:opacity-100 dark:hover:text-red-400"
                      disabled={busy !== null}
                      onClick={() => void handleRemove(model.label)}
                      title={`Remove ${model.label}`}
                      aria-label={`Remove ${model.label}`}
                    >
                      {busy === `remove:${model.label}` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <Boxes className="h-8 w-8 text-muted-foreground/50" aria-hidden />
            <p className="text-xs text-muted-foreground">
              Extract or open a unit-model folder to list its models.
            </p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
