import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { confirm, open } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { useConfigStore } from "@/store/configStore";
import {
  getStoredDialogDefaultPath,
  rememberStoredDialogSelection,
} from "@/utils/dialogDefaultPathStore";
import { UNIT_MODEL_OPEN_FOLDER_DIALOG_PATH_KEY } from "../utils/unitModelEditorSettings";
import { useSsbhModelPreview } from "@/components/ssbh-model-preview/SsbhModelPreviewPanel";
import {
  getBaseName,
  inferUnitModelStructurePath,
  validateUnitModelForRepack,
  type UnitModelRepackResult,
  type UnitModelValidationResult,
} from "../utils/unitModelRepackService";
import {
  commonValidationAsUnitModel,
  isExvsCommonModelRoot,
  validateExvsCommonBundle,
} from "../utils/exvsCommonService";
import { type UnitModelExtractResult } from "../utils/unitModelExtractService";
import { buildUnitModelAiReviewPayload } from "../utils/unitModelAiReviewPayload";
import {
  listUnitModelTextures,
  syncUnitModelTextureContainers,
  type UnitModelTextureInventory,
} from "../utils/unitModelTextureService";
import {
  analyzeUnitModelFolderMigration,
  migrateUnitModelFolderLayout,
} from "../utils/unitModelMigrationService";
import { resolveMigratedFhm2dFolderPath } from "@/utils/fhm2dFolderPathResolution";
import { promptAndMigrateFhm2dStructureIfNeeded } from "@/utils/fhm2dStructureMetadata";

export type UnitModelWorkspaceBusy = "pick" | "extract" | "migrate" | "validate" | "copy" | null;

type RunValidationOptions = {
  silent?: boolean;
};

type UseUnitModelWorkspaceOptions = {
  clearScheduledPreviewReload?: () => void;
};

function inferLoadedRoot(preview: ReturnType<typeof useSsbhModelPreview>): string | null {
  const active = preview.previewInstances.find((inst) => inst.id === preview.activePreviewInstanceId);
  const bundle = active?.bundle ?? preview.previewInstances[0]?.bundle ?? preview.bundle;
  if (!bundle || bundle.sourceKind !== "disk") return null;
  return bundle.rootFolder || null;
}

export function useUnitModelWorkspace(
  unitRoot: string | null,
  onUnitRootChange: (path: string | null) => void,
  options: UseUnitModelWorkspaceOptions = {},
) {
  const { clearScheduledPreviewReload } = options;
  const preview = useSsbhModelPreview();
  const obModPath = useConfigStore((state) => state.obModPath ?? "");
  const loadedRoot = inferLoadedRoot(preview);
  const activeRoot = unitRoot ?? loadedRoot;
  const isExvsCommon = isExvsCommonModelRoot(activeRoot);
  const structurePath = useMemo(() => {
    if (!activeRoot) return null;
    try {
      return inferUnitModelStructurePath(activeRoot);
    } catch {
      return null;
    }
  }, [activeRoot]);
  const folderName = useMemo(() => (activeRoot ? getBaseName(activeRoot) : ""), [activeRoot]);
  const [validation, setValidation] = useState<UnitModelValidationResult | null>(null);
  const [validationRefreshTick, setValidationRefreshTick] = useState(0);
  const [isValidating, setIsValidating] = useState(false);
  const [lastRepack, setLastRepack] = useState<UnitModelRepackResult | null>(null);
  const [busy, setBusy] = useState<UnitModelWorkspaceBusy>(null);
  const [repackDialogOpen, setRepackDialogOpen] = useState(false);
  const [extractDialogOpen, setExtractDialogOpen] = useState(false);
  const validationRequestIdRef = useRef(0);

  const markValidationStale = useCallback(() => {
    validationRequestIdRef.current += 1;
    setValidation(null);
    setIsValidating(false);
    setLastRepack(null);
    setValidationRefreshTick((tick) => tick + 1);
  }, []);

  const acceptValidationResult = useCallback((result: UnitModelValidationResult) => {
    validationRequestIdRef.current += 1;
    setIsValidating(false);
    setValidation(result);
  }, []);

  useEffect(() => {
    const onTexturesChanged = () => markValidationStale();
    window.addEventListener("unit-model-textures-changed", onTexturesChanged);
    return () => window.removeEventListener("unit-model-textures-changed", onTexturesChanged);
  }, [markValidationStale]);

  const hasErrors = Boolean(validation && validation.errors.length > 0);
  const statusLabel = isValidating
    ? "Checking..."
    : validation
      ? validation.valid
        ? "Ready to repack"
        : `${validation.errors.length} issue(s)`
      : activeRoot
        ? "Pending validation"
        : "No folder";
  const isBusy = busy !== null;

  const runValidation = useCallback(
    async (options: RunValidationOptions = {}) => {
      const silent = options.silent === true;
      if (!activeRoot || !structurePath) {
        setValidation(null);
        if (!silent) {
          toast.error("No unit model folder selected");
        }
        return null;
      }

      const requestId = validationRequestIdRef.current + 1;
      validationRequestIdRef.current = requestId;
      setIsValidating(true);
      if (!silent) {
        setBusy("validate");
      }

      try {
        const result = isExvsCommon
          ? commonValidationAsUnitModel(
              await validateExvsCommonBundle(activeRoot, structurePath),
            )
          : await validateUnitModelForRepack(activeRoot, structurePath);
        if (requestId !== validationRequestIdRef.current) {
          return null;
        }
        setValidation(result);
        if (!silent) {
          if (result.valid) {
            toast.success("Unit model validation passed");
          } else {
            toast.error("Unit model validation failed", {
              description: `${result.errors.length} issue(s) must be fixed before repack`,
            });
          }
        }
        return result;
      } catch (error) {
        if (requestId === validationRequestIdRef.current && !silent) {
          toast.error("Validation command failed", { description: String(error) });
        }
        return null;
      } finally {
        if (requestId === validationRequestIdRef.current) {
          setIsValidating(false);
        }
        if (!silent) {
          setBusy((current) => (current === "validate" ? null : current));
        }
      }
    },
    [activeRoot, isExvsCommon, structurePath],
  );

  const autoSyncStructureForRoot = useCallback(async (rootPath: string) => {
    if (isExvsCommonModelRoot(rootPath)) return;
    const resolvedStructurePath = inferUnitModelStructurePath(rootPath);
    try {
      await syncUnitModelTextureContainers(rootPath, resolvedStructurePath);
    } catch (error) {
      console.error("Failed to auto-sync unit-model structure before load", error);
      toast.error("Unit model auto-fix failed", { description: String(error) });
    }
  }, []);

  useEffect(() => {
    if (!activeRoot || !structurePath) {
      validationRequestIdRef.current += 1;
      setValidation(null);
      setIsValidating(false);
      return;
    }
    setValidation(null);
    void runValidation({ silent: true });
  }, [activeRoot, structurePath, validationRefreshTick, runValidation]);

  const pickUnitFolder = async () => {
    if (busy === "pick" || preview.loading) {
      return;
    }
    clearScheduledPreviewReload?.();
    setBusy("pick");
    try {
      const storedDefault = await getStoredDialogDefaultPath(UNIT_MODEL_OPEN_FOLDER_DIALOG_PATH_KEY);
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Open unit model folder",
        defaultPath: storedDefault ?? activeRoot ?? preview.workspaceRoot ?? undefined,
      });
      if (typeof selected !== "string" || !selected.trim()) return;
      const trimmedSelected = selected.trim();
      await rememberStoredDialogSelection(
        UNIT_MODEL_OPEN_FOLDER_DIALOG_PATH_KEY,
        trimmedSelected,
        "directory",
      );
      let rootToLoad = trimmedSelected;
      if (isExvsCommonModelRoot(rootToLoad)) {
        onUnitRootChange(rootToLoad);
        await preview.loadModelAt(rootToLoad);
        setLastRepack(null);
        return;
      }
      rootToLoad = await resolveMigratedFhm2dFolderPath(rootToLoad);
      try {
        const metadataStructurePath = inferUnitModelStructurePath(rootToLoad);
        const metadataMigration = await promptAndMigrateFhm2dStructureIfNeeded({
          structureJsonPath: metadataStructurePath,
          title: "Migrate Unit Model FHM2D structure",
        });
        if (metadataMigration) {
          rootToLoad = metadataMigration.rootPath ?? rootToLoad;
          toast.success("FHM2D structure metadata migrated", {
            description: `${metadataMigration.name} -> ${metadataMigration.hashName}`,
          });
        }
      } catch (error) {
        console.warn("FHM2D metadata migration check failed", error);
      }
      const migration = await analyzeUnitModelFolderMigration(rootToLoad);
      if (migration.canMigrate && migration.state === "legacy") {
        const ok = await confirm(
          [
            "This looks like an older Unit Model extract.",
            "",
            `Models: ${migration.modelCount}`,
            `Files to regroup: ${migration.plannedFileMoves}`,
            "",
            "Migrate it to the current Unit Model folder layout before loading?",
          ].join("\n"),
          {
            title: "Migrate Unit Model folder",
            kind: "warning",
          },
        );
        if (ok) {
          setBusy("migrate");
          const result = await migrateUnitModelFolderLayout(rootToLoad, migration.structureJsonPath);
          rootToLoad = result.modelRoot;
          toast.success("Unit model folder migrated", {
            description: `${result.updatedFileUrls} fileUrl(s) updated. Backup: ${
              result.backupStructureJsonPath ?? "none"
            }`,
          });
          for (const warning of result.warnings.slice(0, 3)) {
            toast.warning("Migration warning", { description: warning });
          }
        } else {
          toast.message("Opened without migration", {
            description: "Some Unit Model edit operations expect the current folder layout.",
          });
        }
      }
      await autoSyncStructureForRoot(rootToLoad);
      onUnitRootChange(rootToLoad);
      await preview.loadModelAt(rootToLoad);
      setLastRepack(null);
    } catch (error) {
      toast.error("Failed to open unit model folder", { description: String(error) });
    } finally {
      setBusy(null);
    }
  };

  const openExtractDialog = () => {
    setExtractDialogOpen(true);
  };

  const handleExtracted = async (result: UnitModelExtractResult) => {
    if (preview.loading) {
      return;
    }
    clearScheduledPreviewReload?.();
    setBusy("extract");
    try {
      await autoSyncStructureForRoot(result.modelRoot);
      onUnitRootChange(result.modelRoot);
      await preview.loadModelAt(result.modelRoot);
      setLastRepack(null);
    } catch (error) {
      toast.error("Failed to load extracted unit model", { description: String(error) });
    } finally {
      setBusy(null);
    }
  };

  const useLoadedRoot = async () => {
    if (!loadedRoot) return;
    await autoSyncStructureForRoot(loadedRoot);
    onUnitRootChange(loadedRoot);
    toast.success("Using loaded model root");
  };

  const openRepackDialog = () => {
    if (!activeRoot || !structurePath) {
      toast.error("No unit model folder selected");
      return;
    }
    if (!obModPath.trim()) {
      toast.error("OB Mod folder is not configured", {
        description: "Set the OB Mod path in Config before repacking.",
      });
      return;
    }
    setRepackDialogOpen(true);
  };

  const copyReviewPayload = async () => {
    if (!activeRoot || !structurePath) {
      toast.error("No unit model folder selected");
      return;
    }
    setBusy("copy");
    try {
      let validationForPayload = validation;
      if (!validationForPayload) {
        validationForPayload = await runValidation({ silent: true });
      }

      let textureInventory: UnitModelTextureInventory | null = null;
      try {
        textureInventory = await listUnitModelTextures(activeRoot, structurePath);
      } catch (error) {
        toast.error("Texture inventory failed; copying available payload", {
          description: String(error),
        });
      }

      const payload = await buildUnitModelAiReviewPayload({
        activeModelRoot: activeRoot,
        structurePath,
        validation: validationForPayload,
        lastRepack,
        preview,
        textureInventory,
      });

      await writeText(payload);
      toast.success("Copied unit model review payload");
    } catch (error) {
      toast.error("Failed to copy review payload", { description: String(error) });
    } finally {
      setBusy(null);
    }
  };

  const openOutputInExplorer = async () => {
    if (!lastRepack?.outputPath) return;
    await revealItemInDir(lastRepack.outputPath);
  };

  return {
    preview,
    obModPath,
    loadedRoot,
    activeRoot,
    isExvsCommon,
    structurePath,
    folderName,
    validation,
    lastRepack,
    busy,
    isValidating,
    isBusy,
    repackDialogOpen,
    setRepackDialogOpen,
    extractDialogOpen,
    setExtractDialogOpen,
    handleExtracted,
    setLastRepack,
    acceptValidationResult,
    hasErrors,
    statusLabel,
    markValidationStale,
    pickUnitFolder,
    openExtractDialog,
    useLoadedRoot,
    runValidation,
    openRepackDialog,
    copyReviewPayload,
    openOutputInExplorer,
  };
}
