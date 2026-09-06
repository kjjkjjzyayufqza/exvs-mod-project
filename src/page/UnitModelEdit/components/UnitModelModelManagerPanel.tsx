import { useCallback, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { join, tempDir } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { mkdir, remove } from "@tauri-apps/plugin-fs";
import {
  Boxes,
  ChevronDown,
  Download,
  FileBox,
  FileUp,
  FolderPlus,
  LayoutTemplate,
  Loader2,
  Plus,
  Replace,
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
import {
  getStoredDialogDefaultPath,
  rememberStoredDialogSelection,
} from "@/utils/dialogDefaultPathStore";
import { DaeImportConfigModal, type DaeImportWorkflowMode } from "@/page/SceneEdit/components/dae-import/DaeImportConfigModal";
import {
  applyUnitModelFbxImportDefaults,
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
  ssbhConvertDaeToSsbh,
  ssbhConvertFbxToSsbh,
} from "@/components/ssbh-model-preview/ssbhDaeIoService";
import {
  assertSsbhSessionTextureReferencesResolvable,
  buildSsbhSessionImportConfig,
} from "@/page/SceneEdit/utils/sceneDaeSessionImport";
import type { StaticMeshImportProgress } from "@/page/SceneEdit/utils/sceneSessionService";
import { useCallbackModalViewportSuspendInteraction } from "@/page/SceneEdit/hooks/useSceneModalViewportSuspendInteraction";

import { buildUnitModelStructureTree, type UnitModelTreeNode } from "../utils/unitModelStructureTree";
import {
  addUnitModelModel,
  importUnitModelStaticMesh,
  previewUnitModelModelReplacement,
  previewUnitModelNumshbReplacement,
  removeUnitModelModel,
  replaceUnitModelModel,
  replaceUnitModelNumshb,
  stageUnitModelStaticMesh,
  validateUnitModelSourceFolder,
  type UnitModelNumshbReplacePreview,
  type UnitModelReplacePreview,
  type UnitModelSourceValidation,
} from "../utils/unitModelModelService";
import { createNumatbTemplateFromUnitModel } from "../utils/unitModelNumatbTemplateService";
import { listUnitModelTextures } from "../utils/unitModelTextureService";
import { ExvsCommonModelIdDialog } from "./ExvsCommonModelIdDialog";
import { UnitModelAddFolderModal } from "./UnitModelAddFolderModal";
import { UnitModelRemoveModelModal } from "./UnitModelRemoveModelModal";
import {
  UnitModelReplaceFolderModal,
  type UnitModelReplaceScope,
} from "./UnitModelReplaceFolderModal";
import type { UnitModelSourceTexturePlan } from "./UnitModelSourceValidationPreview";
import {
  UNIT_MODEL_ADD_SSBH_FOLDER_DIALOG_PATH_KEY,
  UNIT_MODEL_IMPORT_STATIC_MESH_DIALOG_PATH_KEY,
  UNIT_MODEL_REPLACE_NUMSHB_DIALOG_PATH_KEY,
  UNIT_MODEL_REPLACE_NUMSHB_SOURCE_DIALOG_PATH_KEY,
  UNIT_MODEL_REPLACE_FULL_SOURCE_DIALOG_PATH_KEY,
  UNIT_MODEL_REPLACE_SSBH_FOLDER_DIALOG_PATH_KEY,
} from "../utils/unitModelEditorSettings";
import {
  EXVS_COMMON_NEW_SHL_MODEL_TYPE,
  parseExvsCommonRuntimeModelId,
} from "../utils/exvsCommonService";

interface UnitModelModelManagerPanelProps {
  structureJson: unknown | null;
  structureJsonPath?: string | null;
  modelRoot?: string | null;
  selectedModelLabel?: string | null;
  onSelectModel?: (model: UnitModelTreeNode) => void;
  /** Called after a successful add/remove so the host can reload the structure JSON. */
  onMutated?: () => void;
  /**
   * Notifies the host while the FBX/DAE import modal (or its progress dialog) is open so it
   * can pause the background 3D viewport, matching the standalone DAE/FBX to SSBH modal.
   */
  onViewportSuspendChange?: (suspended: boolean) => void;
  onExportModel?: (modelLabel: string) => void;
  className?: string;
  profile?: "unit" | "exvsCommon";
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

function createUnitImportSteps(fileName: string, t: TFunction): ImportStep[] {
  return [
    { step: "read", label: t("manager.progress.preparing", { fileName }), status: "active" },
    { step: "convert", label: t("manager.progress.converting"), status: "pending" },
    { step: "artifacts", label: t("manager.progress.building"), status: "pending" },
    { step: "write", label: t("manager.progress.registering"), status: "pending" },
    { step: "done", label: t("manager.progress.completing"), status: "pending" },
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

function buildSourceTexturePlan(
  validation: UnitModelSourceValidation,
  poolTextureNames: ReadonlySet<string>,
): UnitModelSourceTexturePlan {
  // Matched byte for byte, the way the game does: a texture whose name differs only in case
  // does not resolve, so reporting it as found here would green-light a package that crashes.
  const sourceNames = new Set(validation.sourceTexturesFound);
  const copiedFromSource: string[] = [];
  const reusedFromPool: string[] = [];
  const missing: string[] = [];
  for (const reference of validation.textureReferences) {
    if (poolTextureNames.has(reference)) {
      reusedFromPool.push(reference);
    } else if (sourceNames.has(reference)) {
      copiedFromSource.push(reference);
    } else {
      missing.push(reference);
    }
  }
  return {
    referenced: validation.textureReferences,
    copiedFromSource,
    reusedFromPool,
    missing,
  };
}

function emitUnitModelTexturesChanged(): void {
  window.dispatchEvent(new Event("unit-model-textures-changed"));
}

function showMutationSyncWarning(syncWarning: string | undefined, warningText: string): void {
  if (!syncWarning) return;
  toast.warning(warningText, {
    description: syncWarning,
  });
}

/**
 * Structured list of the package's models (one folder per model), with add, replace, remove, and
 * "Copy info to AI" affordances backed by the Unit model structure mutation commands.
 */
export function UnitModelModelManagerPanel({
  structureJson,
  structureJsonPath,
  modelRoot,
  selectedModelLabel,
  onSelectModel,
  onMutated,
  onViewportSuspendChange,
  onExportModel,
  className,
  profile = "unit",
}: UnitModelModelManagerPanelProps) {
  const { t } = useTranslation("unit-inspector-manager");
  const isExvsCommon = profile === "exvsCommon";
  const [busy, setBusy] = useState<string | null>(null);
  const [addFolderPreview, setAddFolderPreview] = useState<{
    source: string;
    validation: UnitModelSourceValidation;
    texturePlan: UnitModelSourceTexturePlan;
  } | null>(null);
  const [commonModelIdText, setCommonModelIdText] = useState("");
  const [commonStaticMeshModelId, setCommonStaticMeshModelId] = useState<number | null>(null);
  const [commonStaticMeshIdOpen, setCommonStaticMeshIdOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<{
    label: string;
    index: number;
  } | null>(null);
  const [replaceScope, setReplaceScope] = useState<UnitModelReplaceScope>("fullFbx");
  const [replaceFolderPreview, setReplaceFolderPreview] = useState<{
    source: string;
    preview: UnitModelReplacePreview;
    tempDir?: string;
  } | null>(null);
  const [replaceNumshbPreview, setReplaceNumshbPreview] = useState<{
    source: string;
    preview: UnitModelNumshbReplacePreview;
    tempDir?: string;
  } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [importEntries, setImportEntries] = useState<DaeImportEntry[]>([]);
  const [importWorkflow, setImportWorkflow] = useState<DaeImportWorkflowMode>("unitModel");
  const [showImportConfig, setShowImportConfig] = useState(false);
  const [importProgress, setImportProgress] = useState<UnitImportProgressState>({
    open: false,
    progress: 0,
    steps: [],
  });
  const replaceTargetRef = useRef(replaceTarget);
  replaceTargetRef.current = replaceTarget;
  const suppressReplaceCloseRef = useRef(false);

  const canMutate = Boolean(modelRoot && structureJsonPath);

  const viewportSuspend = useCallbackModalViewportSuspendInteraction(onViewportSuspendChange);

  const handleAddFolder = async () => {
    if (!modelRoot || !structureJsonPath) {
      toast.error(t("manager.errors.openFolder"));
      return;
    }
    setBusy("add-folder");
    try {
      const source = await open({
        directory: true,
        multiple: false,
        title: t("manager.dialogs.selectSsbhFolder"),
        defaultPath:
          (await getStoredDialogDefaultPath(UNIT_MODEL_ADD_SSBH_FOLDER_DIALOG_PATH_KEY)) ??
          modelRoot ??
          undefined,
      });
      if (typeof source !== "string" || !source.trim()) return;
      await rememberStoredDialogSelection(
        UNIT_MODEL_ADD_SSBH_FOLDER_DIALOG_PATH_KEY,
        source,
        "directory",
      );
      const validation = await validateUnitModelSourceFolder(source);
      const inventory = await listUnitModelTextures(modelRoot, structureJsonPath);
      // fhm2d records carry no names, so a numatb reference resolves against the name stored
      // inside the nutexb; fall back to the file name only when the footer was unreadable.
      const poolNames = new Set(
        inventory.textures.map((texture) => {
          const stored = texture.internalName?.trim();
          return stored ? `${stored}.nutexb` : texture.filename;
        }),
      );
      const texturePlan = buildSourceTexturePlan(validation, poolNames);
      setAddFolderPreview({ source, validation, texturePlan });
    } catch (error) {
      toast.error(t("manager.errors.invalidPreparedFolder"), { description: String(error) });
    } finally {
      setBusy(null);
    }
  };

  const handleConfirmAddFolder = async () => {
    if (!modelRoot || !structureJsonPath || !addFolderPreview) return;
    const { source, validation, texturePlan } = addFolderPreview;
    if (texturePlan.missing.length > 0) {
      toast.error(t("manager.errors.missingTextures"));
      return;
    }
    setBusy("add-folder");
    try {
      const commonModelId = isExvsCommon
        ? parseExvsCommonRuntimeModelId(commonModelIdText)
        : undefined;
      const result = await addUnitModelModel(
        modelRoot,
        source,
        structureJsonPath,
        commonModelId,
      );
      toast.success(t("manager.success.modelAdded", { name: validation.modelName }), {
        description: isExvsCommon
          ? t("manager.details.countsCommon", {
              models: result.modelCount,
              files: result.totalFiles,
              type: EXVS_COMMON_NEW_SHL_MODEL_TYPE,
            })
          : t("manager.details.counts", {
              models: result.modelCount,
              files: result.totalFiles,
            }),
      });
      showMutationSyncWarning(result.syncWarning, t("manager.errors.textureSync"));
      if (validation.ignoredSourceNuhlpb && !isExvsCommon) {
        toast.info(t("manager.success.nuhlpbIgnored"));
      }
      setAddFolderPreview(null);
      setCommonModelIdText("");
      emitUnitModelTexturesChanged();
      onMutated?.();
    } catch (error) {
      toast.error(t("manager.errors.addFailed"), { description: String(error) });
    } finally {
      setBusy(null);
    }
  };

  const handleAddStaticMesh = async () => {
    if (!modelRoot || !structureJsonPath) {
      toast.error(t("manager.errors.openFolder"));
      return;
    }
    if (isExvsCommon) {
      setCommonModelIdText("");
      setCommonStaticMeshIdOpen(true);
      return;
    }
    await startStaticMeshImport(null);
  };

  const startStaticMeshImport = async (commonModelId: number | null) => {
    if (!modelRoot || !structureJsonPath) {
      toast.error(t("manager.errors.openFolder"));
      return;
    }
    setBusy("analyze");
    try {
      setCommonStaticMeshModelId(commonModelId);
      const selected = await open({
        multiple: false,
        title: t("manager.dialogs.selectFbxDae"),
        filters: [{ name: "Static Mesh", extensions: ["fbx", "dae"] }],
        defaultPath:
          (await getStoredDialogDefaultPath(UNIT_MODEL_IMPORT_STATIC_MESH_DIALOG_PATH_KEY)) ??
          modelRoot ??
          undefined,
      });
      const filePath = Array.isArray(selected) ? selected[0] : selected;
      if (!filePath) return;
      await rememberStoredDialogSelection(
        UNIT_MODEL_IMPORT_STATIC_MESH_DIALOG_PATH_KEY,
        filePath,
        "file",
      );
      const fileName = filePath.split(/[/\\]/).pop() ?? "model.dae";
      const baseFilename = sanitizeBaseFilename(fileName);
      const sourceFormat = detectStaticMeshImportFormat(fileName);
      let config = createDefaultDaeImportConfig(baseFilename);
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
      config = applyUnitModelFbxImportDefaults(config, sourceFormat);

      const entry: DaeImportEntry = {
        importId: `unit_model_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        fileName,
        filePath,
        sourceFormat,
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
      if (sourceFormat === "fbx") {
        session.setImportKind("fbx");
        session.setFlipUv(true);
      }

      setImportWorkflow("unitModel");
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
                  config: applyUnitModelFbxImportDefaults(
                    syncDaeImportConfigUpAxisFromAnalysis(
                      candidate.config,
                      analysis,
                    ),
                    candidate.sourceFormat,
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
      steps: createUnitImportSteps(entry.fileName, t),
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
          exvsCommonModelId: commonStaticMeshModelId ?? undefined,
        },
        handleStaticMeshProgress,
      );
      toast.success(t("manager.success.unitModelAdded", { name: baseFilename }), {
        description: isExvsCommon
          ? t("manager.details.countsCommon", {
              models: result.modelCount,
              files: result.totalFiles,
              type: EXVS_COMMON_NEW_SHL_MODEL_TYPE,
            })
          : t("manager.details.counts", {
              models: result.modelCount,
              files: result.totalFiles,
            }),
      });
      showMutationSyncWarning(result.syncWarning, t("manager.errors.textureSync"));
      setImportEntries([]);
      setCommonStaticMeshModelId(null);
      emitUnitModelTexturesChanged();
      onMutated?.();
    } catch (error) {
      toast.error(t("manager.errors.importFailed"), {
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
      const result = await removeUnitModelModel(
        modelRoot,
        label,
        structureJsonPath,
        isExvsCommon,
      );
      toast.success(t("manager.success.modelRemoved"), {
        description: t("manager.details.removed", {
          models: result.modelCount,
          files: result.removedFiles.length,
        }),
      });
      showMutationSyncWarning(result.syncWarning, t("manager.errors.textureSync"));
      setRemoveTarget(null);
      emitUnitModelTexturesChanged();
      onMutated?.();
    } catch (error) {
      toast.error(t("manager.errors.removeFailed"), { description: String(error) });
    } finally {
      setBusy(null);
    }
  };

  const handleRequestRemove = (label: string) => {
    if (!canMutate || busy !== null) return;
    setRemoveTarget(label);
  };

  const handleCreateNumatbTemplate = async (model: ModelSummary) => {
    if (!structureJsonPath) {
      toast.error(t("manager.errors.openFolder"));
      return;
    }
    setBusy(`template:${model.label}`);
    try {
      const result = await createNumatbTemplateFromUnitModel({
        structureJsonPath,
        model: model.node,
        templateName: model.label,
      });
      const mayaCount = result.template.mayaFile.entries.length;
      const nustCount = result.template.nustFile.entries.length;
      toast.success(
        result.replacedExisting
          ? `Updated NUMATB template "${result.template.name}"`
          : `Created NUMATB template "${result.template.name}"`,
        {
          description:
            `Maya ${mayaCount} material(s), Nust ${nustCount} material(s). ` +
            "Select it in Import FBX / DAE → NUMATB template.",
        },
      );
    } catch (error) {
      toast.error(t("manager.errors.templateFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(null);
    }
  };

  const handleOpenReplace = (label: string, index: number) => {
    if (!modelRoot || !structureJsonPath) {
      toast.error(t("manager.errors.openFolder"));
      return;
    }
    setReplaceTarget({ label, index });
    setReplaceScope("numshb");
    setReplaceFolderPreview(null);
    setReplaceNumshbPreview(null);
  };

  const cleanupReplaceTempDir = async (path?: string) => {
    if (!path) return;
    try {
      await remove(path, { recursive: true });
    } catch {
      // Temp conversion files are best-effort cleanup.
    }
  };

  const handleCloseReplace = () => {
    if (busy?.startsWith("replace:")) return;
    if (suppressReplaceCloseRef.current || showImportConfig || importProgress.open) {
      return;
    }
    const tempPath = replaceNumshbPreview?.tempDir ?? replaceFolderPreview?.tempDir;
    setReplaceTarget(null);
    setReplaceFolderPreview(null);
    setReplaceNumshbPreview(null);
    void cleanupReplaceTempDir(tempPath);
  };

  const handleReplaceScopeChange = (scope: UnitModelReplaceScope) => {
    const tempPath = replaceNumshbPreview?.tempDir ?? replaceFolderPreview?.tempDir;
    setReplaceScope(scope);
    setReplaceFolderPreview(null);
    setReplaceNumshbPreview(null);
    void cleanupReplaceTempDir(tempPath);
  };

  const handleChooseFullFolder = async () => {
    if (!modelRoot || !structureJsonPath || !replaceTarget) {
      toast.error(t("manager.errors.openFolder"));
      return;
    }
    const label = replaceTarget.label;
    setBusy(`replace:${label}`);
    try {
      const source = await open({
        directory: true,
        multiple: false,
        title: t("manager.dialogs.selectReplaceFolder", { label }),
        defaultPath:
          (await getStoredDialogDefaultPath(UNIT_MODEL_REPLACE_SSBH_FOLDER_DIALOG_PATH_KEY)) ??
          modelRoot ??
          undefined,
      });
      if (typeof source !== "string" || !source.trim()) return;
      await rememberStoredDialogSelection(
        UNIT_MODEL_REPLACE_SSBH_FOLDER_DIALOG_PATH_KEY,
        source,
        "directory",
      );
      const preview = await previewUnitModelModelReplacement(
        modelRoot,
        label,
        source,
        structureJsonPath,
      );
      setReplaceFolderPreview({ source, preview });
    } catch (error) {
      toast.error(t("manager.errors.invalidReplaceFolder"), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(null);
    }
  };

  const handleChooseExistingNumshb = async () => {
    if (!modelRoot || !structureJsonPath || !replaceTarget) {
      toast.error(t("manager.errors.openFolder"));
      return;
    }
    const label = replaceTarget.label;
    setBusy(`replace:${label}`);
    try {
      const selected = await open({
        multiple: false,
        title: t("manager.dialogs.selectReplaceNumshb", { label }),
        filters: [{ name: "NUMSHB", extensions: ["numshb"] }],
        defaultPath:
          (await getStoredDialogDefaultPath(UNIT_MODEL_REPLACE_NUMSHB_DIALOG_PATH_KEY)) ??
          modelRoot ??
          undefined,
      });
      const source = Array.isArray(selected) ? selected[0] : selected;
      if (typeof source !== "string" || !source.trim()) return;
      await rememberStoredDialogSelection(
        UNIT_MODEL_REPLACE_NUMSHB_DIALOG_PATH_KEY,
        source,
        "file",
      );
      const preview = await previewUnitModelNumshbReplacement(
        modelRoot,
        label,
        source,
        structureJsonPath,
      );
      const previousTemp = replaceNumshbPreview?.tempDir;
      setReplaceNumshbPreview({ source, preview });
      await cleanupReplaceTempDir(previousTemp);
    } catch (error) {
      toast.error(t("manager.errors.invalidNumshb"), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(null);
    }
  };

  const handleConvertReplaceNumshb = async () => {
    if (!modelRoot || !structureJsonPath || !replaceTarget) {
      toast.error(t("manager.errors.openFolder"));
      return;
    }
    setBusy("analyze");
    try {
      const selected = await open({
        multiple: false,
        title: t("manager.dialogs.selectConvertNumshb", { label: replaceTarget.label }),
        filters: [{ name: "Static Mesh", extensions: ["fbx", "dae"] }],
        defaultPath:
          (await getStoredDialogDefaultPath(UNIT_MODEL_REPLACE_NUMSHB_SOURCE_DIALOG_PATH_KEY)) ??
          modelRoot ??
          undefined,
      });
      const filePath = Array.isArray(selected) ? selected[0] : selected;
      if (!filePath) return;
      await rememberStoredDialogSelection(
        UNIT_MODEL_REPLACE_NUMSHB_SOURCE_DIALOG_PATH_KEY,
        filePath,
        "file",
      );
      const fileName = filePath.split(/[/\\]/).pop() ?? "model.fbx";
      const baseFilename = sanitizeBaseFilename(fileName);
      const sourceFormat = detectStaticMeshImportFormat(fileName);
      let config = createDefaultDaeImportConfig(baseFilename);
      config.loadToScene = false;
      config.convertToSsbh = true;
      config.generateHkt = false;
      config.directToDisk = true;
      config.outputDirectory = modelRoot;
      config.ssbhConfig.writeNumdlb = false;
      config.ssbhConfig.writeNumshb = true;
      config.ssbhConfig.writeNusktb = false;
      config.ssbhConfig.writeNumatb = false;
      config.ssbhConfig.writeJnttbl = false;
      config.ssbhConfig.writeMayaProfile = false;
      config = applyUnitModelFbxImportDefaults(config, sourceFormat);

      const entry: DaeImportEntry = {
        importId: `unit_model_replace_numshb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        fileName,
        filePath,
        sourceFormat,
        analysis: null,
        config,
        analyzing: true,
        analyzeError: null,
      };

      const session = useDaeSsbhSessionStore.getState();
      session.resetSession();
      session.setOutputBaseName(baseFilename);
      session.setWriteNumdlb(false);
      session.setWriteNumshb(true);
      session.setWriteNusktb(false);
      session.setWriteNumatb(false);
      session.setWriteMayaProfile(false);
      if (sourceFormat === "fbx") {
        session.setImportKind("fbx");
        session.setFlipUv(true);
      }

      suppressReplaceCloseRef.current = true;
      setImportWorkflow("unitModelReplaceNumshb");
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
                  config: applyUnitModelFbxImportDefaults(
                    syncDaeImportConfigUpAxisFromAnalysis(
                      candidate.config,
                      analysis,
                    ),
                    candidate.sourceFormat,
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

  const handleConvertReplaceFull = async () => {
    if (!modelRoot || !structureJsonPath || !replaceTarget) {
      toast.error(t("manager.errors.openFolder"));
      return;
    }
    setBusy("analyze");
    try {
      const selected = await open({
        multiple: false,
        title: t("manager.dialogs.selectConvertFull", { label: replaceTarget.label }),
        filters: [{ name: "Static Mesh", extensions: ["fbx", "dae"] }],
        defaultPath:
          (await getStoredDialogDefaultPath(UNIT_MODEL_REPLACE_FULL_SOURCE_DIALOG_PATH_KEY)) ??
          modelRoot ??
          undefined,
      });
      const filePath = Array.isArray(selected) ? selected[0] : selected;
      if (!filePath) return;
      await rememberStoredDialogSelection(
        UNIT_MODEL_REPLACE_FULL_SOURCE_DIALOG_PATH_KEY,
        filePath,
        "file",
      );
      const fileName = filePath.split(/[/\\]/).pop() ?? "model.fbx";
      const baseFilename = sanitizeBaseFilename(fileName);
      const sourceFormat = detectStaticMeshImportFormat(fileName);
      let config = createDefaultDaeImportConfig(baseFilename);
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
      config = applyUnitModelFbxImportDefaults(config, sourceFormat);

      const entry: DaeImportEntry = {
        importId: `unit_model_replace_full_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        fileName,
        filePath,
        sourceFormat,
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
      if (sourceFormat === "fbx") {
        session.setImportKind("fbx");
        session.setFlipUv(true);
      }

      suppressReplaceCloseRef.current = true;
      setImportWorkflow("unitModelReplaceFull");
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
                  config: applyUnitModelFbxImportDefaults(
                    syncDaeImportConfigUpAxisFromAnalysis(
                      candidate.config,
                      analysis,
                    ),
                    candidate.sourceFormat,
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

  const handleConfirmReplaceNumshbConvert = async () => {
    const entry = importEntries[0];
    const target = replaceTargetRef.current;
    if (!entry || !entry.analysis) {
      toast.error(t("manager.errors.analysisNotReady"));
      return;
    }
    if (!modelRoot || !structureJsonPath || !target) {
      toast.error(t("manager.errors.replaceTargetMissing"));
      return;
    }
    const session = useDaeSsbhSessionStore.getState();
    const baseFilename = sanitizeBaseFilename(session.outputBaseName);
    setBusy(`replace:${target.label}`);
    setShowImportConfig(false);
    setImportProgress({
      open: true,
      progress: 20,
      steps: [
        { step: "convert", label: t("manager.progress.convertNumshb"), status: "active" },
        { step: "done", label: t("manager.progress.replacePreview"), status: "pending" },
      ],
    });
    const stamp = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const outputDir = await join(await tempDir(), "unit-model-replace-numshb", stamp);
    try {
      await mkdir(outputDir, { recursive: true });
      const convertParams = {
        outputDir,
        baseFilename,
        scaleFactor: Number.parseFloat(session.scaleFactorText) || 1,
        flipUv: session.flipUv,
        upAxis: session.upAxis,
        includeGeometryNames: [...session.includeGeometryNames],
        writeLog: false,
        writeNumdlb: false,
        writeNumshb: true,
        writeNusktb: false,
        writeNumatb: false,
        writeMayaProfile: false,
        numdlbEntries: [],
        mayaFile: null,
        nustFile: null,
      };
      const converted =
        entry.sourceFormat === "fbx"
          ? await ssbhConvertFbxToSsbh({ fbxPath: entry.filePath, ...convertParams })
          : await ssbhConvertDaeToSsbh({ daePath: entry.filePath, ...convertParams });
      const source = converted.files.numshbPath?.trim();
      if (!source) {
        throw new Error("Conversion did not produce a .numshb file.");
      }
      const preview = await previewUnitModelNumshbReplacement(
        modelRoot,
        target.label,
        source,
        structureJsonPath,
      );
      const previousTemp = replaceNumshbPreview?.tempDir;
      setReplaceTarget(target);
      setReplaceNumshbPreview({ source, preview, tempDir: outputDir });
      await cleanupReplaceTempDir(previousTemp);
      setImportEntries([]);
      suppressReplaceCloseRef.current = false;
    } catch (error) {
      toast.error(t("manager.errors.convertNumshbFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
      suppressReplaceCloseRef.current = true;
      setShowImportConfig(true);
      await cleanupReplaceTempDir(outputDir);
    } finally {
      setImportProgress({ open: false, progress: 0, steps: [] });
      setBusy(null);
    }
  };

  const handleConfirmReplaceFullConvert = async () => {
    const entry = importEntries[0];
    const target = replaceTargetRef.current;
    if (!entry || !entry.analysis) {
      toast.error(t("manager.errors.analysisNotReady"));
      return;
    }
    if (!modelRoot || !structureJsonPath || !target) {
      toast.error(t("manager.errors.replaceTargetMissing"));
      return;
    }
    const session = useDaeSsbhSessionStore.getState();
    const baseFilename = sanitizeBaseFilename(session.outputBaseName);
    setBusy(`replace:${target.label}`);
    setShowImportConfig(false);
    setImportProgress({
      open: true,
      progress: 0,
      steps: createUnitImportSteps(entry.fileName, t),
    });
    const stamp = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const outputDir = await join(await tempDir(), "unit-model-replace-full", stamp);
    try {
      await mkdir(outputDir, { recursive: true });
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
      await stageUnitModelStaticMesh(
        {
          modelRoot,
          outputDir,
          sourcePath: entry.filePath,
          config: importConfig,
          includeGeometryNames: [...session.includeGeometryNames],
        },
        handleStaticMeshProgress,
      );
      const preview = await previewUnitModelModelReplacement(
        modelRoot,
        target.label,
        outputDir,
        structureJsonPath,
      );
      const previousTemp = replaceFolderPreview?.tempDir;
      setReplaceTarget(target);
      setReplaceScope("fullFbx");
      setReplaceFolderPreview({ source: outputDir, preview, tempDir: outputDir });
      await cleanupReplaceTempDir(previousTemp);
      setImportEntries([]);
      suppressReplaceCloseRef.current = false;
    } catch (error) {
      toast.error(t("manager.errors.convertFullFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
      suppressReplaceCloseRef.current = true;
      setShowImportConfig(true);
      await cleanupReplaceTempDir(outputDir);
    } finally {
      setImportProgress({ open: false, progress: 0, steps: [] });
      setBusy(null);
    }
  };

  const handleConfirmReplaceFolder = async () => {
    if (!modelRoot || !structureJsonPath || !replaceTarget) return;
    if (replaceScope === "numshb") {
      if (!replaceNumshbPreview) return;
      if (replaceNumshbPreview.preview.blockers.length > 0) {
        toast.error(t("manager.errors.replaceMeshBlocked"));
        return;
      }
      const targetName = replaceNumshbPreview.preview.target.modelName;
      setBusy(`replace:${targetName}`);
      try {
        await replaceUnitModelNumshb(
          modelRoot,
          targetName,
          replaceNumshbPreview.source,
          structureJsonPath,
        );
        toast.success(t("manager.success.meshReplaced", { name: targetName }), {
          description: t("manager.success.meshOverwrite"),
        });
        const tempPath = replaceNumshbPreview.tempDir;
        setReplaceTarget(null);
        setReplaceNumshbPreview(null);
        await cleanupReplaceTempDir(tempPath);
        onMutated?.();
      } catch (error) {
        toast.error(t("manager.errors.replaceMeshFailed"), {
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setBusy(null);
      }
      return;
    }
    if (!replaceFolderPreview) return;
    const { source, preview } = replaceFolderPreview;
    if (preview.blockers.length > 0) {
      toast.error(t("manager.errors.replaceModelBlocked"));
      return;
    }
    const targetName = preview.target.modelName;
    setBusy(`replace:${targetName}`);
    try {
      const result = await replaceUnitModelModel(
        modelRoot,
        targetName,
        source,
        structureJsonPath,
        isExvsCommon,
      );
      toast.success(t("manager.success.modelReplaced", { name: targetName }), {
        description: t("manager.details.replaced", {
          models: result.modelCount,
          files: result.totalFiles,
          removed: result.removedFiles.length,
        }),
      });
      showMutationSyncWarning(result.syncWarning, t("manager.errors.textureSync"));
      const tempPath = replaceFolderPreview.tempDir;
      setReplaceTarget(null);
      setReplaceFolderPreview(null);
      await cleanupReplaceTempDir(tempPath);
      emitUnitModelTexturesChanged();
      onMutated?.();
    } catch (error) {
      toast.error(t("manager.errors.replaceModelFailed"), {
        description: error instanceof Error ? error.message : String(error),
      });
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

  const addFolderDuplicate =
    addFolderPreview != null &&
    parsed.models.some(
      (m) => m.label.toLowerCase() === addFolderPreview.validation.modelName.toLowerCase(),
    );

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-card/40", className)}>
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Boxes className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-semibold tracking-tight">{t("manager.title")}</h2>
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
                title={t("manager.addTitle")}
              >
                {busy !== null ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                )}
                <span className="text-xs font-medium">{t("manager.add")}</span>
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
                  <span className="block text-xs font-medium">{t("manager.importFbxDae")}</span>
                  <span className="block text-[10px] text-muted-foreground">
                    {t("manager.importFbxDaeDescription")}
                  </span>
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onSelect={() => void handleAddFolder()}
              >
                <FolderPlus className="h-4 w-4" aria-hidden />
                <span>
                  <span className="block text-xs font-medium">{t("manager.addSsbhFolder")}</span>
                  <span className="block text-[10px] text-muted-foreground">
                    {t("manager.addSsbhFolderDescription")}
                  </span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {parsed.models.length > 0 ? (
            <CopyInfoToAiButton
              label={t("manager.copyModelsToAi")}
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
            {t("manager.errors.readModels", { error: parsed.error })}
          </div>
        ) : parsed.models.length > 0 ? (
          <ul className="divide-y">
            {parsed.models.map((model, modelIndex) => {
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
                        {model.fileTypes.join(" ") || t("manager.noDirectFiles")}
                      </p>
                    </div>
                  </button>
                  <CopyInfoToAiButton
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    label={t("manager.copyModelInfoToAi", { name: model.label })}
                    buildPayload={() => ({
                      kind: "unit-model",
                      scope: `model:${model.label}`,
                      note: structureJsonPath ? `from ${structureJsonPath}` : undefined,
                      data: model.node,
                    })}
                  />
                  {onExportModel ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-muted-foreground opacity-0 transition-colors hover:text-primary group-hover:opacity-100 focus-visible:opacity-100"
                      disabled={busy !== null}
                      onClick={() => onExportModel(model.label)}
                      title={t("manager.exportModel", { name: model.label })}
                      aria-label={t("manager.exportModel", { name: model.label })}
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  ) : null}
                  {structureJsonPath ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-muted-foreground opacity-0 transition-colors hover:text-primary group-hover:opacity-100 focus-visible:opacity-100"
                      disabled={busy !== null}
                      onClick={() => void handleCreateNumatbTemplate(model)}
                      title={t("manager.createNumatbTitle", { name: model.label })}
                      aria-label={t("manager.createNumatbAria", { name: model.label })}
                    >
                      {busy === `template:${model.label}` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <LayoutTemplate className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </Button>
                  ) : null}
                  {canMutate ? (
                    <>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-muted-foreground opacity-0 transition-colors hover:text-primary group-hover:opacity-100 focus-visible:opacity-100"
                        disabled={busy !== null}
                        onClick={() => handleOpenReplace(model.label, modelIndex)}
                        title={t("manager.replaceModel", { name: model.label })}
                        aria-label={t("manager.replaceModel", { name: model.label })}
                      >
                        {busy === `replace:${model.label}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Replace className="h-3.5 w-3.5" aria-hidden />
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-muted-foreground opacity-0 transition-colors hover:text-red-600 group-hover:opacity-100 focus-visible:opacity-100 dark:hover:text-red-400"
                        disabled={busy !== null}
                        onClick={() => handleRequestRemove(model.label)}
                        title={t("manager.removeModel", { name: model.label })}
                        aria-label={t("manager.removeModel", { name: model.label })}
                      >
                        {busy === `remove:${model.label}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        )}
                      </Button>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <Boxes className="h-8 w-8 text-muted-foreground/50" aria-hidden />
            <p className="text-xs text-muted-foreground">
              {t("manager.empty")}
            </p>
          </div>
        )}
      </ScrollArea>
      <ExvsCommonModelIdDialog
        open={commonStaticMeshIdOpen}
        busy={busy === "analyze"}
        initialValue={commonModelIdText}
        onCancel={() => setCommonStaticMeshIdOpen(false)}
        onConfirm={(modelId, text) => {
          setCommonModelIdText(text);
          setCommonStaticMeshIdOpen(false);
          void startStaticMeshImport(modelId);
        }}
      />
      <UnitModelAddFolderModal
        open={addFolderPreview !== null}
        validation={addFolderPreview?.validation ?? null}
        duplicateName={addFolderDuplicate}
        texturePlan={addFolderPreview?.texturePlan ?? null}
        busy={busy === "add-folder"}
        exvsCommon={isExvsCommon}
        modelIdText={commonModelIdText}
        onModelIdTextChange={setCommonModelIdText}
        onConfirm={() => void handleConfirmAddFolder()}
        onCancel={() => setAddFolderPreview(null)}
      />
      <UnitModelReplaceFolderModal
        open={
          replaceTarget !== null && !showImportConfig && !importProgress.open
        }
        targetModelName={replaceTarget?.label ?? ""}
        targetModelIndex={replaceTarget?.index ?? null}
        scope={replaceScope}
        fullPreview={replaceFolderPreview?.preview ?? null}
        numshbPreview={replaceNumshbPreview?.preview ?? null}
        busy={busy === `replace:${replaceTarget?.label ?? ""}`}
        onScopeChange={handleReplaceScopeChange}
        onChooseFullFolder={() => void handleChooseFullFolder()}
        onChooseExistingNumshb={() => void handleChooseExistingNumshb()}
        onConvertFbx={() =>
          void (replaceScope === "fullFbx"
            ? handleConvertReplaceFull()
            : handleConvertReplaceNumshb())
        }
        onConfirm={() => void handleConfirmReplaceFolder()}
        onCancel={handleCloseReplace}
      />
      <UnitModelRemoveModelModal
        open={removeTarget !== null}
        modelLabel={removeTarget}
        busy={removeTarget !== null && busy === `remove:${removeTarget}`}
        onConfirm={() => {
          if (removeTarget) void handleRemove(removeTarget);
        }}
        onCancel={() => setRemoveTarget(null)}
      />
      {showImportConfig && importEntries.length > 0 ? (
        <DaeImportConfigModal
          entries={importEntries}
          havokInfo={null}
          stageRoot={modelRoot ?? null}
          workflowMode={importWorkflow}
          viewportSuspend={viewportSuspend}
          onConfigChange={handleImportConfigChange}
          onImport={() =>
            void (importWorkflow === "unitModelReplaceNumshb"
              ? handleConfirmReplaceNumshbConvert()
              : importWorkflow === "unitModelReplaceFull"
                ? handleConfirmReplaceFullConvert()
                : handleConfirmStaticMeshImport())
          }
          onCancel={() => {
            suppressReplaceCloseRef.current = false;
            setShowImportConfig(false);
            setImportEntries([]);
          }}
        />
      ) : null}
      <StageImportProgressDialog
        open={importProgress.open}
        progress={importProgress.progress}
        steps={importProgress.steps}
        title={t("manager.progress.title")}
        onClose={() =>
          setImportProgress((current) => ({ ...current, open: false }))
        }
      />
    </div>
  );
}
