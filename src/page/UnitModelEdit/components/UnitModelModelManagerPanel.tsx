import { useCallback, useMemo, useState } from "react";

import { open } from "@tauri-apps/plugin-dialog";
import {
  Boxes,
  ChevronDown,
  FileBox,
  FileUp,
  FolderPlus,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { CopyInfoToAiButton } from "@/components/CopyInfoToAiButton";
import { useDaeSsbhSessionStore } from "@/components/ssbh-model-preview/store/daeSsbhSessionStore";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { DaeImportConfigModal } from "@/page/SceneEdit/components/dae-import/DaeImportConfigModal";
import {
  createDefaultDaeImportConfig,
  detectStaticMeshImportFormat,
  sanitizeBaseFilename,
  syncDaeImportConfigUpAxisFromAnalysis,
} from "@/page/SceneEdit/components/dae-import/daeImportDefaults";
import type {
  DaeImportConfig,
  DaeImportEntry,
} from "@/page/SceneEdit/components/dae-import/daeImportTypes";
import {
  StageImportProgressDialog,
  type ImportStep,
} from "@/page/SceneEdit/components/StageImportProgressDialog";
import {
  ssbhAnalyzeDae,
  ssbhAnalyzeFbx,
} from "@/components/ssbh-model-preview/ssbhDaeIoService";
import {
  assertSsbhSessionTextureReferencesResolvable,
  buildSsbhSessionImportConfig,
} from "@/page/SceneEdit/utils/sceneDaeSessionImport";
import type { StaticMeshImportProgress } from "@/page/SceneEdit/utils/sceneSessionService";

import { buildUnitModelStructureTree, type UnitModelTreeNode } from "../utils/unitModelStructureTree";
import {
  addUnitModelModel,
  importUnitModelStaticMesh,
  removeUnitModelModel,
  validateUnitModelSourceFolder,
} from "../utils/unitModelModelService";

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

interface UnitImportProgressState {
  open: boolean;
  progress: number;
  steps: ImportStep[];
}

function createUnitImportSteps(fileName: string): ImportStep[] {
  return [
    { step: "read", label: `Preparing ${fileName}...`, status: "active" },
    { step: "convert", label: "Converting FBX/DAE to SSBH...", status: "pending" },
    { step: "artifacts", label: "Building required Unit model files...", status: "pending" },
    { step: "write", label: "Registering model and shared textures...", status: "pending" },
    { step: "done", label: "Completing Unit model import...", status: "pending" },
  ];
}

function updateImportSteps(
  steps: ImportStep[],
  activeStep: string,
  label: string,
  detail?: string,
): ImportStep[] {
  const activeIndex = steps.findIndex((step) => step.step === activeStep);
  return steps.map((step, index) => ({
    ...step,
    status:
      activeIndex < 0
        ? step.status
        : index < activeIndex
          ? "done"
          : index === activeIndex
            ? "active"
            : "pending",
    ...(step.step === activeStep ? { label, detail } : {}),
  }));
}

function applyUnitImportProgress(
  state: UnitImportProgressState,
  chunk: StaticMeshImportProgress,
): UnitImportProgressState {
  switch (chunk.kind) {
    case "status":
      return {
        ...state,
        progress: 8,
        steps: updateImportSteps(state.steps, "read", chunk.label),
      };
    case "sourceFile":
      return {
        ...state,
        progress: 15,
        steps: updateImportSteps(
          state.steps,
          "read",
          `Checked ${chunk.format} source`,
          chunk.path,
        ),
      };
    case "convertStarted":
      return {
        ...state,
        progress: 30,
        steps: updateImportSteps(
          state.steps,
          "convert",
          `Converting ${chunk.sourceName} to SSBH...`,
          `Model name: ${chunk.baseFilename}`,
        ),
      };
    case "convertFinished":
      return {
        ...state,
        progress: 65,
        steps: updateImportSteps(
          state.steps,
          "artifacts",
          "SSBH conversion finished; generating JNTT and staging textures...",
          `${chunk.fileCount} generated artifact(s)`,
        ),
      };
    case "writeStarted":
      return {
        ...state,
        progress: 78,
        steps: updateImportSteps(
          state.steps,
          "write",
          "Registering model in the Unit package...",
          chunk.outputDir,
        ),
      };
    case "writeFinished":
      return {
        ...state,
        progress: 94,
        steps: updateImportSteps(
          state.steps,
          "done",
          "Unit model files and structure are committed",
          `${chunk.fileCount} file(s) added`,
        ),
      };
    case "complete":
      return {
        ...state,
        progress: 100,
        steps: state.steps.map((step) => ({ ...step, status: "done" })),
      };
    case "error":
      return {
        ...state,
        steps: state.steps.map((step) =>
          step.status === "active"
            ? { ...step, label: chunk.message, tone: "warning" }
            : step,
        ),
      };
    case "ipcWarning":
    case "hktStarted":
    case "hktFinished":
      return state;
  }
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
  const [importEntries, setImportEntries] = useState<DaeImportEntry[]>([]);
  const [showImportConfig, setShowImportConfig] = useState(false);
  const [importProgress, setImportProgress] = useState<UnitImportProgressState>({
    open: false,
    progress: 0,
    steps: [],
  });

  const canMutate = Boolean(modelRoot && structureJsonPath);

  const handleAddFolder = async () => {
    if (!modelRoot || !structureJsonPath) {
      toast.error("Open or extract a unit-model folder first.");
      return;
    }
    setBusy("add-folder");
    try {
      const source = await open({
        directory: true,
        multiple: false,
        title: "Select prepared Unit model SSBH folder",
      });
      if (typeof source !== "string" || !source.trim()) return;
      const validation = await validateUnitModelSourceFolder(source);
      const result = await addUnitModelModel(modelRoot, source, structureJsonPath);
      toast.success(`Model '${validation.modelName}' added`, {
        description: `${result.modelCount} models, ${result.totalFiles} files. Empty NUHLPB created automatically.`,
      });
      if (validation.ignoredSourceNuhlpb) {
        toast.info("The source NUHLPB was ignored; a new empty NUHLPB was created.");
      }
      onMutated?.();
    } catch (error) {
      toast.error("Prepared model folder is invalid", { description: String(error) });
    } finally {
      setBusy(null);
    }
  };

  const handleAddStaticMesh = async () => {
    if (!modelRoot || !structureJsonPath) {
      toast.error("Open or extract a unit-model folder first.");
      return;
    }
    setBusy("analyze");
    try {
      const selected = await open({
        multiple: false,
        title: "Select FBX or DAE for Unit model import",
        filters: [{ name: "Static Mesh", extensions: ["fbx", "dae"] }],
      });
      const filePath = Array.isArray(selected) ? selected[0] : selected;
      if (!filePath) return;
      const fileName = filePath.split(/[/\\]/).pop() ?? "model.dae";
      const baseFilename = sanitizeBaseFilename(fileName);
      const config = createDefaultDaeImportConfig(baseFilename);
      config.loadToScene = false;
      config.convertToSsbh = true;
      config.generateHkt = false;
      config.directToDisk = true;
      config.outputDirectory = modelRoot;
      config.ssbhConfig.writeNumdlb = true;
      config.ssbhConfig.writeNumshb = true;
      config.ssbhConfig.writeNusktb = true;
      config.ssbhConfig.writeNumatb = true;
      config.ssbhConfig.writeJnttbl = true;
      config.ssbhConfig.writeMayaProfile = true;

      const entry: DaeImportEntry = {
        importId: `unit_model_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        fileName,
        filePath,
        sourceFormat: detectStaticMeshImportFormat(fileName),
        analysis: null,
        config,
        analyzing: true,
        analyzeError: null,
      };

      const session = useDaeSsbhSessionStore.getState();
      session.resetSession();
      session.setOutputBaseName(baseFilename);
      session.setWriteNumdlb(true);
      session.setWriteNumshb(true);
      session.setWriteNusktb(true);
      session.setWriteNumatb(true);
      session.setWriteMayaProfile(true);

      setImportEntries([entry]);
      setShowImportConfig(true);
      try {
        const analysis =
          entry.sourceFormat === "fbx"
            ? await ssbhAnalyzeFbx(filePath)
            : await ssbhAnalyzeDae(filePath);
        setImportEntries((current) =>
          current.map((candidate) =>
            candidate.importId === entry.importId
              ? {
                  ...candidate,
                  analysis,
                  config: syncDaeImportConfigUpAxisFromAnalysis(
                    candidate.config,
                    analysis,
                  ),
                  analyzing: false,
                }
              : candidate,
          ),
        );
      } catch (error) {
        setImportEntries((current) =>
          current.map((candidate) =>
            candidate.importId === entry.importId
              ? {
                  ...candidate,
                  analyzing: false,
                  analyzeError:
                    error instanceof Error ? error.message : String(error),
                }
              : candidate,
          ),
        );
      }
    } finally {
      setBusy(null);
    }
  };

  const handleImportConfigChange = useCallback(
    (importId: string, config: DaeImportConfig) => {
      setImportEntries((current) =>
        current.map((entry) =>
          entry.importId === importId ? { ...entry, config } : entry,
        ),
      );
    },
    [],
  );

  const handleStaticMeshProgress = useCallback(
    (chunk: StaticMeshImportProgress) => {
      setImportProgress((current) => applyUnitImportProgress(current, chunk));
    },
    [],
  );

  const handleConfirmStaticMeshImport = async () => {
    const entry = importEntries[0];
    if (!entry || !entry.analysis || !modelRoot || !structureJsonPath) return;
    const session = useDaeSsbhSessionStore.getState();
    const baseFilename = sanitizeBaseFilename(session.outputBaseName);
    setBusy("import-static");
    setShowImportConfig(false);
    setImportProgress({
      open: true,
      progress: 0,
      steps: createUnitImportSteps(entry.fileName),
    });
    try {
      await assertSsbhSessionTextureReferencesResolvable({
        sessionState: session,
        sourcePath: entry.filePath,
        stageRoot: modelRoot,
      });
      const importConfig = buildSsbhSessionImportConfig(
        entry.config,
        session,
        baseFilename,
        { geometryNames: session.includeGeometryNames },
      );
      importConfig.loadToScene = false;
      importConfig.convertToSsbh = true;
      importConfig.generateHkt = false;
      if (!importConfig.ssbhConfig) {
        throw new Error("SSBH conversion settings are missing.");
      }
      importConfig.ssbhConfig = {
        ...importConfig.ssbhConfig,
        baseFilename,
        writeNumdlb: true,
        writeNumshb: true,
        writeNusktb: true,
        writeNumatb: true,
        writeJnttbl: true,
        writeMayaProfile: true,
      };

      const result = await importUnitModelStaticMesh(
        {
          modelRoot,
          structureJsonPath,
          sourcePath: entry.filePath,
          config: importConfig,
          includeGeometryNames: [...session.includeGeometryNames],
        },
        handleStaticMeshProgress,
      );
      toast.success(`Unit model '${baseFilename}' added`, {
        description: `${result.modelCount} models, ${result.totalFiles} files. Empty NUHLPB created automatically.`,
      });
      setImportEntries([]);
      onMutated?.();
    } catch (error) {
      toast.error("Failed to import FBX/DAE as Unit model", {
        description: error instanceof Error ? error.message : String(error),
      });
      setShowImportConfig(true);
    } finally {
      setBusy(null);
      setImportProgress((current) => ({ ...current, open: false }));
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={!canMutate || busy !== null}
                title="Add a model from FBX/DAE or a prepared SSBH folder"
              >
                {busy !== null ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                )}
                <span className="text-xs font-medium">Add</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => void handleAddStaticMesh()}
              >
                <FileUp className="h-4 w-4" aria-hidden />
                <span>
                  <span className="block text-xs font-medium">Import FBX / DAE</span>
                  <span className="block text-[10px] text-muted-foreground">
                    Analyze, configure, and convert to SSBH
                  </span>
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => void handleAddFolder()}
              >
                <FolderPlus className="h-4 w-4" aria-hidden />
                <span>
                  <span className="block text-xs font-medium">Add SSBH Folder</span>
                  <span className="block text-[10px] text-muted-foreground">
                    Validate a complete prepared model folder
                  </span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
      {showImportConfig && importEntries.length > 0 ? (
        <DaeImportConfigModal
          entries={importEntries}
          havokInfo={null}
          stageRoot={modelRoot ?? null}
          workflowMode="unitModel"
          onConfigChange={handleImportConfigChange}
          onImport={() => void handleConfirmStaticMeshImport()}
          onCancel={() => {
            setShowImportConfig(false);
            setImportEntries([]);
          }}
        />
      ) : null}
      <StageImportProgressDialog
        open={importProgress.open}
        progress={importProgress.progress}
        steps={importProgress.steps}
        title="Importing Unit Model"
        onClose={() =>
          setImportProgress((current) => ({ ...current, open: false }))
        }
      />
    </div>
  );
}
