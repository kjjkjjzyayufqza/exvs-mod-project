import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { useConfigStore } from "@/store/configStore";
import { useSsbhModelPreview } from "@/components/ssbh-model-preview/SsbhModelPreviewPanel";
import {
  getBaseName,
  inferUnitModelStructurePath,
  validateUnitModelForRepack,
  type UnitModelRepackResult,
  type UnitModelValidationResult,
} from "../utils/unitModelRepackService";
import { type UnitModelExtractResult } from "../utils/unitModelExtractService";
import { buildUnitModelAiReviewPayload } from "../utils/unitModelAiReviewPayload";
import { listUnitModelTextures, type UnitModelTextureInventory } from "../utils/unitModelTextureService";

export type UnitModelWorkspaceBusy = "pick" | "extract" | "validate" | "copy" | null;

function inferLoadedRoot(preview: ReturnType<typeof useSsbhModelPreview>): string | null {
  const active = preview.previewInstances.find((inst) => inst.id === preview.activePreviewInstanceId);
  const bundle = active?.bundle ?? preview.previewInstances[0]?.bundle ?? preview.bundle;
  if (!bundle || bundle.sourceKind !== "disk") return null;
  return bundle.rootFolder || null;
}

export function useUnitModelWorkspace(unitRoot: string | null, onUnitRootChange: (path: string | null) => void) {
  const preview = useSsbhModelPreview();
  const obModPath = useConfigStore((state) => state.obModPath ?? "");
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
  const folderName = useMemo(() => (activeRoot ? getBaseName(activeRoot) : ""), [activeRoot]);
  const [validation, setValidation] = useState<UnitModelValidationResult | null>(null);
  const [lastRepack, setLastRepack] = useState<UnitModelRepackResult | null>(null);
  const [busy, setBusy] = useState<UnitModelWorkspaceBusy>(null);
  const [repackDialogOpen, setRepackDialogOpen] = useState(false);
  const [extractDialogOpen, setExtractDialogOpen] = useState(false);

  useEffect(() => {
    const onTexturesChanged = () => {
      setValidation(null);
      setLastRepack(null);
    };
    window.addEventListener("unit-model-textures-changed", onTexturesChanged);
    return () => window.removeEventListener("unit-model-textures-changed", onTexturesChanged);
  }, []);

  const hasErrors = Boolean(validation && validation.errors.length > 0);
  const statusLabel = validation ? (validation.valid ? "Ready to repack" : "Blocked") : "Not validated";
  const isBusy = busy !== null;

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

  const openExtractDialog = () => {
    setExtractDialogOpen(true);
  };

  const handleExtracted = async (result: UnitModelExtractResult) => {
    setBusy("extract");
    try {
      onUnitRootChange(result.modelRoot);
      await preview.loadModelAt(result.modelRoot);
      setValidation(null);
      setLastRepack(null);
    } catch (error) {
      toast.error("Failed to load extracted unit model", { description: String(error) });
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
        validationForPayload = await validateUnitModelForRepack(activeRoot, structurePath);
        setValidation(validationForPayload);
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
    structurePath,
    folderName,
    validation,
    lastRepack,
    busy,
    isBusy,
    repackDialogOpen,
    setRepackDialogOpen,
    extractDialogOpen,
    setExtractDialogOpen,
    handleExtracted,
    setLastRepack,
    hasErrors,
    statusLabel,
    pickUnitFolder,
    openExtractDialog,
    useLoadedRoot,
    runValidation,
    openRepackDialog,
    copyReviewPayload,
    openOutputInExplorer,
  };
}
