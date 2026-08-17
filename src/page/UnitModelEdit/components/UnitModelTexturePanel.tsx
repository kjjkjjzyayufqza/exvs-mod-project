import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { confirm, open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  Copy,
  Download,
  Eye,
  Image as ImageIcon,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Replace,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  getStoredDialogDefaultPath,
  rememberStoredDialogSelection,
} from "@/utils/dialogDefaultPathStore";
import { useSsbhModelPreview } from "@/components/ssbh-model-preview/SsbhModelPreviewPanel";
import { clearNutexbRgbaCache } from "@/components/ssbh-model-preview/nutexbPreviewCache";
import {
  TextureAddConfirmModal,
  type TextureAddSelection,
} from "@/page/SceneEdit/components/TextureAddConfirmModal";
import { TexturePreviewModal } from "@/page/SceneEdit/components/TexturePreviewModal";
import { TextureReplaceModal } from "@/page/SceneEdit/components/TextureReplaceModal";
import type { DdsFormat } from "@/page/SceneEdit/components/TextureFormatSelect";
import {
  convertImageToNutexb,
  exportNutexbToPng,
  reencodeNutexbWithFormat,
  replaceNutexbInPlace,
} from "@/page/SceneEdit/utils/sceneTextureConvert";
import {
  analyzeTextureAddCandidates,
  findTextureEntryForDuplicate,
  invalidateNutexbInternalName,
  type AnalyzedAddCandidate,
  type RawAddFile,
} from "@/page/SceneEdit/utils/sceneTextureAddPlan";
import {
  clearSceneTextureThumbnailCache,
  ensureSceneTextureThumbnailDataUrl,
  getSceneTextureThumbnailDataUrl,
  lookupSceneTextureData,
  tryCacheThumbnailFromMap,
} from "@/page/SceneEdit/utils/sceneTextureThumbnail";
import type { SceneTextureDecodeContext } from "@/page/SceneEdit/utils/sceneTextureDecode";
import type { TextureManagerEntry } from "@/page/SceneEdit/store/sceneTextureManagerStore";
import type { NutexbTextureDataMap } from "@/page/SceneEdit/hooks/useSceneTextureLoader";
import {
  addUnitModelNutexb,
  listUnitModelTextures,
  registerUnitModelPoolOrphans,
  removeUnitModelNutexb,
  unitTextureToManagerEntry,
  type UnitModelTextureEntry,
  type UnitModelTextureInventory,
} from "../utils/unitModelTextureService";
import { getBaseName, inferUnitModelStructurePath } from "../utils/unitModelRepackService";
import {
  UNIT_MODEL_ADD_TEXTURE_DIALOG_PATH_KEY,
  UNIT_MODEL_BATCH_EXPORT_TEXTURES_DIALOG_PATH_KEY,
  UNIT_MODEL_EXPORT_TEXTURE_DIALOG_PATH_KEY,
  UNIT_MODEL_REPLACE_TEXTURE_DIALOG_PATH_KEY,
} from "../utils/unitModelEditorSettings";
import {
  addExvsCommonTexture,
  isExvsCommonModelRoot,
  removeExvsCommonTexture,
} from "../utils/exvsCommonService";

const ASYNC_THUMB_CONCURRENCY = 4;
const UNIT_TEXTURES_CHANGED_EVENT = "unit-model-textures-changed";
const UNIT_TEXTURE_ROW_ESTIMATE_SIZE = 64;

type Props = {
  unitRoot: string | null;
  /** When true, fills the parent panel (left Textures tab) instead of a fixed min height card. */
  embedded?: boolean;
  /** When set, scroll to + highlight the texture with this filename (basename, case-insensitive). */
  focusTextureFilename?: string | null;
  /** Open the numatb that references a texture, given a numatb basename (from `referencedBy`). */
  onOpenReferencingNumatb?: (numatbBasename: string) => void;
};

function inferLoadedRoot(preview: ReturnType<typeof useSsbhModelPreview>): string | null {
  const active = preview.previewInstances.find((inst) => inst.id === preview.activePreviewInstanceId);
  const bundle = active?.bundle ?? preview.previewInstances[0]?.bundle ?? preview.bundle;
  if (!bundle || bundle.sourceKind !== "disk") return null;
  return bundle.rootFolder || null;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function textureDims(texture: UnitModelTextureEntry): string {
  return texture.width > 0 && texture.height > 0 ? `${texture.width}x${texture.height}` : "-";
}

function emitUnitTexturesChanged(): void {
  window.dispatchEvent(new CustomEvent(UNIT_TEXTURES_CHANGED_EVENT));
}

export function UnitModelTexturePanel({
  unitRoot,
  embedded = false,
  focusTextureFilename = null,
  onOpenReferencingNumatb,
}: Props) {
  const focusKey = (focusTextureFilename ?? "").toLowerCase();
  const preview = useSsbhModelPreview();
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
  const decodeContext = useMemo<SceneTextureDecodeContext>(
    () => ({ sourceKind: "disk", sessionId: null, maxDimension: 64 }),
    [],
  );
  const previewDecodeContext = useMemo<SceneTextureDecodeContext>(
    () => ({ sourceKind: "disk", sessionId: null, maxDimension: null }),
    [],
  );
  const textureDataMap = preview.textureDataMap as unknown as NutexbTextureDataMap;
  const [inventory, setInventory] = useState<UnitModelTextureInventory | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"add" | "register" | "replace" | "remove" | "export" | "batchExport" | "format" | null>(null);
  const [previewEntry, setPreviewEntry] = useState<TextureManagerEntry | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<TextureManagerEntry | null>(null);
  const [addCandidates, setAddCandidates] = useState<AnalyzedAddCandidate[] | null>(null);
  const [addAnalyzing, setAddAnalyzing] = useState(false);
  const [convertProgress, setConvertProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchExportProgress, setBatchExportProgress] = useState<{ done: number; total: number } | null>(null);
  const [, bumpThumbnailCache] = useReducer((value: number) => value + 1, 0);
  const textureListRef = useRef<HTMLDivElement | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const managerEntries = useMemo<TextureManagerEntry[]>(
    () => inventory?.textures.map(unitTextureToManagerEntry) ?? [],
    [inventory],
  );
  const selectedTexture = useMemo(
    () => inventory?.textures.find((texture) => texture.id === selectedId) ?? null,
    [inventory, selectedId],
  );
  const filteredTextures = useMemo(() => {
    const textures = inventory?.textures ?? [];
    const q = deferredSearchQuery.trim().toLowerCase();
    if (!q) return textures;
    return textures.filter((texture) => {
      return (
        texture.filename.toLowerCase().includes(q) ||
        texture.internalName?.toLowerCase().includes(q) ||
        texture.referencedBy.some((ref) => ref.toLowerCase().includes(q))
      );
    });
  }, [deferredSearchQuery, inventory]);
  const getTextureListScrollElement = useCallback(() => textureListRef.current, []);
  const textureRowVirtualizer = useVirtualizer({
    count: filteredTextures.length,
    getScrollElement: getTextureListScrollElement,
    getItemKey: (index) => filteredTextures[index]?.id ?? index,
    estimateSize: () => UNIT_TEXTURE_ROW_ESTIMATE_SIZE,
    overscan: 8,
  });
  const focusedTextureIndex = useMemo(() => {
    if (!focusKey) return -1;
    return filteredTextures.findIndex((texture) => texture.filename.toLowerCase() === focusKey);
  }, [filteredTextures, focusKey]);

  useEffect(() => {
    if (focusedTextureIndex < 0) return;
    textureRowVirtualizer.scrollToIndex(focusedTextureIndex, { align: "center" });
  }, [focusedTextureIndex, textureRowVirtualizer]);

  const refreshInventory = useCallback(async () => {
    if (!activeRoot || !structurePath) {
      setInventory(null);
      return null;
    }
    setLoading(true);
    try {
      const next = await listUnitModelTextures(activeRoot, structurePath);
      setInventory(next);
      setSelectedId((prev) => {
        if (prev && next.textures.some((texture) => texture.id === prev)) return prev;
        return null;
      });
      return next;
    } catch (error) {
      toast.error("Failed to list unit textures", { description: String(error) });
      return null;
    } finally {
      setLoading(false);
    }
  }, [activeRoot, structurePath]);

  useEffect(() => {
    void refreshInventory();
  }, [refreshInventory]);

  useEffect(() => {
    setSelectedId(null);
  }, [activeRoot]);

  useEffect(() => {
    let cancelled = false;
    let frameId = 0;
    let cursor = 0;
    const textures = inventory?.textures ?? [];
    const asyncPaths = new Set<string>();

    const finishAsync = async () => {
      const paths = Array.from(asyncPaths);
      if (paths.length === 0 || cancelled) return;
      let workerCursor = 0;
      const worker = async () => {
        while (!cancelled) {
          const index = workerCursor++;
          if (index >= paths.length) return;
          await ensureSceneTextureThumbnailDataUrl(
            paths[index]!,
            textureDataMap,
            decodeContext,
          );
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(ASYNC_THUMB_CONCURRENCY, paths.length) }, () => worker()),
      );
      if (!cancelled) bumpThumbnailCache();
    };

    const processBatch = () => {
      if (cancelled) return;
      const end = Math.min(cursor + 32, textures.length);
      for (; cursor < end; cursor += 1) {
        const path = textures[cursor]?.path;
        if (!path) continue;
        const cached = tryCacheThumbnailFromMap(path, textureDataMap);
        if (!cached) asyncPaths.add(path);
      }
      if (cursor < textures.length) {
        frameId = requestAnimationFrame(processBatch);
        return;
      }
      bumpThumbnailCache();
      void finishAsync();
    };

    frameId = requestAnimationFrame(processBatch);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [inventory, textureDataMap, decodeContext]);

  const reloadPreviewAfterDiskChange = useCallback(async () => {
    clearNutexbRgbaCache();
    clearSceneTextureThumbnailCache();
    bumpThumbnailCache();
    if (preview.previewInstances.length > 0) {
      try {
        await preview.reloadCurrentModel();
      } catch (error) {
        toast.error("Texture changed, but preview reload failed", { description: String(error) });
      }
    }
  }, [preview]);

  const handleAddTexture = useCallback(async () => {
    if (!activeRoot || !structurePath) {
      toast.error("No unit model folder selected");
      return;
    }
    const selected = await open({
      title: "Add unit texture",
      multiple: true,
      filters: [{ name: "Textures", extensions: ["nutexb", "png", "dds", "tga"] }],
      defaultPath:
        (await getStoredDialogDefaultPath(UNIT_MODEL_ADD_TEXTURE_DIALOG_PATH_KEY)) ??
        activeRoot ??
        undefined,
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    if (paths.length === 0) return;
    const firstPath = paths[0];
    if (firstPath) {
      await rememberStoredDialogSelection(UNIT_MODEL_ADD_TEXTURE_DIALOG_PATH_KEY, firstPath, "file");
    }

    const files: RawAddFile[] = paths.map((path) => ({
      sourcePath: path,
      filename: getBaseName(path),
    }));
    setAddAnalyzing(true);
    setAddCandidates(
      files.map((file) => ({
        id: file.sourcePath,
        sourcePath: file.sourcePath,
        filename: file.filename,
        nutexbFilename: file.filename.replace(/\.[^.]+$/, ".nutexb"),
        isNutexb: file.filename.toLowerCase().endsWith(".nutexb"),
        internalName: null,
        duplicate: false,
        duplicateReason: null,
        duplicateOf: null,
      })),
    );

    try {
      const analyzed = await analyzeTextureAddCandidates(files, managerEntries);
      setAddCandidates(analyzed);
    } catch (error) {
      toast.error("Failed to analyze textures", { description: String(error) });
    } finally {
      setAddAnalyzing(false);
    }
  }, [activeRoot, structurePath, managerEntries]);

  const handleRegisterPoolOrphans = useCallback(async () => {
    if (!activeRoot || !structurePath) return;
    if (isExvsCommon) {
      toast.message("EXVS Common textures must be added through the managed Add action.");
      return;
    }
    setBusy("register");
    try {
      const next = await registerUnitModelPoolOrphans({
        modelRoot: activeRoot,
        structureJsonPath: structurePath,
      });
      setInventory(next);
      emitUnitTexturesChanged();
      const registeredWarning = next.warnings.find((warning) =>
        warning.startsWith("Registered "),
      );
      if (registeredWarning) {
        toast.success(registeredWarning);
      } else {
        toast.message("No orphan pool textures found on disk");
      }
    } catch (error) {
      toast.error("Failed to register pool textures", { description: String(error) });
      await refreshInventory();
    } finally {
      setBusy(null);
    }
  }, [activeRoot, isExvsCommon, structurePath, refreshInventory]);

  const handleBatchConfirm = useCallback(
    async (selections: TextureAddSelection[]) => {
      if (!activeRoot || !structurePath || selections.length === 0) return;
      setBusy("add");
      setConvertProgress({ done: 0, total: selections.length });
      try {
        let done = 0;
        let addedCount = 0;
        let replacedCount = 0;
        let nextInventory: UnitModelTextureInventory | null = null;
        const entriesForLookup = managerEntries;

        for (const { candidate, ddsFormat, replace } of selections) {
          if (replace) {
            const existing = findTextureEntryForDuplicate(entriesForLookup, candidate);
            if (!existing?.nutexbPath) {
              throw new Error(
                existing
                  ? `Cannot replace ${candidate.filename}: existing texture has no path`
                  : `Cannot replace ${candidate.filename}: matching texture not found`,
              );
            }
            await replaceNutexbInPlace({
              sourcePath: candidate.sourcePath,
              targetNutexbPath: existing.nutexbPath,
              ddsFormat,
            });
            invalidateNutexbInternalName(existing.nutexbPath);
            replacedCount += 1;
            done += 1;
            setConvertProgress({ done, total: selections.length });
            continue;
          }

          const sourceNutexbPath = candidate.isNutexb
            ? candidate.sourcePath
            : (
                await convertImageToNutexb({
                  sourcePath: candidate.sourcePath,
                  ddsFormat,
                })
              ).outputNutexbPath;
          if (isExvsCommon) {
            await addExvsCommonTexture({
              modelRoot: activeRoot,
              structureJsonPath: structurePath,
              sourcePath: sourceNutexbPath,
              targetFilename: candidate.nutexbFilename,
            });
            nextInventory = await listUnitModelTextures(activeRoot, structurePath);
          } else {
            nextInventory = await addUnitModelNutexb({
              modelRoot: activeRoot,
              structureJsonPath: structurePath,
              sourcePath: sourceNutexbPath,
              targetFilename: candidate.nutexbFilename,
            });
          }
          invalidateNutexbInternalName(sourceNutexbPath);
          addedCount += 1;
          done += 1;
          setConvertProgress({ done, total: selections.length });
        }

        if (replacedCount > 0) {
          await refreshInventory();
          await reloadPreviewAfterDiskChange();
        } else if (nextInventory) {
          setInventory(nextInventory);
        }
        emitUnitTexturesChanged();
        const summaryParts: string[] = [];
        if (addedCount > 0) summaryParts.push(`Added ${addedCount}`);
        if (replacedCount > 0) summaryParts.push(`replaced ${replacedCount}`);
        toast.success(
          summaryParts.length > 0
            ? `${summaryParts.join(", ")} unit texture(s)`
            : "No unit textures changed",
        );
      } catch (error) {
        toast.error("Failed to add unit texture", { description: String(error) });
        await refreshInventory();
      } finally {
        setBusy(null);
        setConvertProgress(null);
        setAddCandidates(null);
        setAddAnalyzing(false);
        clearSceneTextureThumbnailCache();
        bumpThumbnailCache();
      }
    },
    [activeRoot, isExvsCommon, structurePath, refreshInventory, reloadPreviewAfterDiskChange, managerEntries],
  );

  const handleReplaceTexture = useCallback(
    async (entry: TextureManagerEntry, ddsFormat: DdsFormat) => {
      if (!entry.nutexbPath) return;
      const selected = await open({
        title: `Replace ${entry.filename}`,
        multiple: false,
        filters: [{ name: "Textures", extensions: ["nutexb", "png", "dds", "tga"] }],
        defaultPath:
          (await getStoredDialogDefaultPath(UNIT_MODEL_REPLACE_TEXTURE_DIALOG_PATH_KEY)) ??
          activeRoot ??
          undefined,
      });
      if (typeof selected !== "string" || !selected.trim()) return;
      await rememberStoredDialogSelection(
        UNIT_MODEL_REPLACE_TEXTURE_DIALOG_PATH_KEY,
        selected.trim(),
        "file",
      );
      setBusy("replace");
      try {
        await replaceNutexbInPlace({
          sourcePath: selected.trim(),
          targetNutexbPath: entry.nutexbPath,
          ddsFormat,
        });
        invalidateNutexbInternalName(entry.nutexbPath);
        await refreshInventory();
        await reloadPreviewAfterDiskChange();
        emitUnitTexturesChanged();
        toast.success(`Replaced ${entry.filename}`);
      } catch (error) {
        toast.error("Failed to replace unit texture", { description: String(error) });
      } finally {
        setBusy(null);
      }
    },
    [refreshInventory, reloadPreviewAfterDiskChange, activeRoot],
  );

  const handleRemoveTexture = useCallback(
    async (texture: UnitModelTextureEntry) => {
      if (!activeRoot || !structurePath) return;
      if (!texture.canRemove) {
        toast.error("Cannot remove a referenced texture", {
          description: texture.referencedBy.length
            ? texture.referencedBy.join(", ")
            : `Structure refs: ${texture.structureRefCount}`,
        });
        return;
      }
      const ok = await confirm(`Remove ${texture.filename}?`, {
        title: "Remove unit texture",
        kind: "warning",
      });
      if (!ok) return;
      setBusy("remove");
      try {
        let next: UnitModelTextureInventory;
        if (isExvsCommon) {
          await removeExvsCommonTexture({
              modelRoot: activeRoot,
              structureJsonPath: structurePath,
              fileIndex: texture.fileIndex,
          });
          next = await listUnitModelTextures(activeRoot, structurePath);
        } else {
          next = await removeUnitModelNutexb({
              modelRoot: activeRoot,
              structureJsonPath: structurePath,
              fileIndex: texture.fileIndex,
          });
        }
        setInventory(next);
        clearSceneTextureThumbnailCache();
        bumpThumbnailCache();
        emitUnitTexturesChanged();
        toast.success(`Removed ${texture.filename}`);
      } catch (error) {
        toast.error("Failed to remove unit texture", { description: String(error) });
      } finally {
        setBusy(null);
      }
    },
    [activeRoot, isExvsCommon, structurePath],
  );

  const handleExportTexture = useCallback(async (texture: UnitModelTextureEntry) => {
    setBusy("export");
    try {
      const output = await exportNutexbToPng({
        nutexbPath: texture.path,
        suggestedFilename: texture.filename.replace(/\.nutexb$/i, ".png"),
        dialogPathKey: UNIT_MODEL_EXPORT_TEXTURE_DIALOG_PATH_KEY,
      });
      if (output) toast.success(`Exported ${getBaseName(output)}`);
    } catch (error) {
      toast.error("Failed to export unit texture", { description: String(error) });
    } finally {
      setBusy(null);
    }
  }, []);

  const handleBatchExportTextures = useCallback(async () => {
    const textures = (inventory?.textures ?? []).filter((texture) => texture.exists);
    if (textures.length === 0) {
      toast.error("No existing unit textures to export");
      return;
    }

    const selected = await open({
      title: "Batch export unit textures",
      directory: true,
      multiple: false,
      defaultPath: await getStoredDialogDefaultPath(UNIT_MODEL_BATCH_EXPORT_TEXTURES_DIALOG_PATH_KEY),
    });
    if (typeof selected !== "string" || !selected.trim()) return;

    const outputDir = selected.trim();
    await rememberStoredDialogSelection(
      UNIT_MODEL_BATCH_EXPORT_TEXTURES_DIALOG_PATH_KEY,
      outputDir,
      "directory",
    );
    const usedNames = new Map<string, number>();
    const outputNameForTexture = (texture: UnitModelTextureEntry) => {
      const baseName = texture.filename.replace(/\.nutexb$/i, ".png");
      const lower = baseName.toLowerCase();
      const count = usedNames.get(lower) ?? 0;
      usedNames.set(lower, count + 1);
      if (count === 0) return baseName;
      return baseName.replace(/\.png$/i, `_${count + 1}.png`);
    };

    setBusy("batchExport");
    setBatchExportProgress({ done: 0, total: textures.length });
    const failures: string[] = [];
    try {
      let done = 0;
      for (const texture of textures) {
        const outputPath = await join(outputDir, outputNameForTexture(texture));
        try {
          await invoke("nutexb_export_png", {
            inputPath: texture.path,
            outputPath,
          });
        } catch (error) {
          failures.push(`${texture.filename}: ${String(error)}`);
        } finally {
          done += 1;
          setBatchExportProgress({ done, total: textures.length });
        }
      }

      if (failures.length > 0) {
        toast.error("Batch export finished with errors", {
          description: `${textures.length - failures.length}/${textures.length} exported. ${failures[0]}`,
        });
      } else {
        toast.success(`Exported ${textures.length} texture(s)`);
      }
    } finally {
      setBusy(null);
      setBatchExportProgress(null);
    }
  }, [inventory]);

  const handlePreviewFormatApply = useCallback(
    async (ddsFormat: DdsFormat) => {
      if (!previewEntry?.nutexbPath) return;
      setBusy("format");
      try {
        await reencodeNutexbWithFormat({
          nutexbPath: previewEntry.nutexbPath,
          ddsFormat,
          sourceImagePath: previewEntry.sourceImagePath,
        });
        invalidateNutexbInternalName(previewEntry.nutexbPath);
        await refreshInventory();
        await reloadPreviewAfterDiskChange();
        emitUnitTexturesChanged();
        setPreviewEntry((prev) => (prev ? { ...prev, format: ddsFormat } : prev));
      } catch (error) {
        toast.error("Failed to re-encode unit texture", { description: String(error) });
      } finally {
        setBusy(null);
      }
    },
    [previewEntry, refreshInventory, reloadPreviewAfterDiskChange],
  );

  const copyPath = useCallback(async (texture: UnitModelTextureEntry) => {
    await navigator.clipboard.writeText(texture.path);
    toast.success("Copied texture path");
  }, []);

  const openPreview = useCallback((texture: UnitModelTextureEntry) => {
    setSelectedId(texture.id);
    setPreviewEntry(unitTextureToManagerEntry(texture));
  }, []);

  const noRoot = !activeRoot || !structurePath;

  return (
    <div
      className={cn(
        "flex flex-col bg-background",
        embedded ? "h-full min-h-0" : "min-h-[520px] rounded-md border",
      )}
    >
      <div className="flex items-center gap-2 border-b bg-muted/20 px-2 py-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search .nutexb"
            className="h-8 pl-7 text-xs"
            disabled={noRoot}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => void refreshInventory()}
          disabled={noRoot || loading}
          title="Refresh"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => void handleBatchExportTextures()}
          disabled={noRoot || busy !== null || !inventory?.textures.some((texture) => texture.exists)}
          title={
            batchExportProgress
              ? `Exporting ${batchExportProgress.done}/${batchExportProgress.total}`
              : "Batch export PNG"
          }
        >
          {busy === "batchExport" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => void handleRegisterPoolOrphans()}
          disabled={noRoot || busy !== null || isExvsCommon}
          title="Register orphan textures already on disk in textures/"
        >
          {busy === "register" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          variant="default"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => void handleAddTexture()}
          disabled={noRoot || busy !== null}
          title="Add texture"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="border-b px-2 py-2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold">
              {activeRoot ? getBaseName(activeRoot) : "No unit loaded"}
            </div>
            <div className="truncate font-mono text-[10px] text-muted-foreground" title={structurePath ?? undefined}>
              {structurePath ?? "-"}
            </div>
          </div>
          <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px]">
            {inventory?.textures.length ?? 0}
          </Badge>
        </div>
        {inventory?.warnings.length ? (
          <div className="mt-2 flex items-start gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="line-clamp-2">{inventory.warnings[0]}</span>
          </div>
        ) : null}
      </div>

      <div ref={textureListRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {noRoot ? (
          <div className="flex h-32 flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageIcon className="h-6 w-6 opacity-40" />
            <span className="text-[11px]">Open a unit model folder</span>
          </div>
        ) : loading && !inventory ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : filteredTextures.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageIcon className="h-6 w-6 opacity-40" />
            <span className="text-[11px]">{searchQuery.trim() ? "No matching textures" : "No .nutexb entries"}</span>
          </div>
        ) : (
          <div className="relative w-full" style={{ height: textureRowVirtualizer.getTotalSize() }}>
            {textureRowVirtualizer.getVirtualItems().map((virtualRow) => {
              const texture = filteredTextures[virtualRow.index];
              if (!texture) return null;
              return (
                <div
                  key={texture.id}
                  ref={textureRowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  className="absolute left-0 top-0 w-full border-b border-border/50"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <UnitTextureRow
                    texture={texture}
                    selected={selectedTexture?.id === texture.id}
                    focused={focusKey.length > 0 && texture.filename.toLowerCase() === focusKey}
                    textureDataMap={textureDataMap}
                    onSelect={() => setSelectedId(texture.id)}
                    onPreview={() => openPreview(texture)}
                    onExport={() => void handleExportTexture(texture)}
                    onReplace={() => setReplaceTarget(unitTextureToManagerEntry(texture))}
                    onRemove={() => void handleRemoveTexture(texture)}
                    onCopyPath={() => void copyPath(texture)}
                    onOpenReferencingNumatb={onOpenReferencingNumatb}
                    busy={busy !== null}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {previewEntry ? (
        <TexturePreviewModal
          entry={previewEntry}
          textureDataMap={textureDataMap}
          decodeContext={previewDecodeContext}
          onClose={() => setPreviewEntry(null)}
          onFormatApply={handlePreviewFormatApply}
          isReencoding={busy === "format"}
        />
      ) : null}

      {replaceTarget ? (
        <TextureReplaceModal
          entry={replaceTarget}
          onClose={() => setReplaceTarget(null)}
          onConfirm={(ddsFormat) => {
            const entry = replaceTarget;
            setReplaceTarget(null);
            void handleReplaceTexture(entry, ddsFormat);
          }}
        />
      ) : null}

      {addCandidates ? (
        <TextureAddConfirmModal
          candidates={addCandidates}
          analyzing={addAnalyzing}
          isConverting={busy === "add"}
          convertProgress={convertProgress}
          onClose={() => {
            if (busy !== "add") {
              setAddCandidates(null);
              setAddAnalyzing(false);
            }
          }}
          onConfirm={handleBatchConfirm}
        />
      ) : null}
    </div>
  );
}

function UnitTextureRow({
  texture,
  selected,
  focused = false,
  textureDataMap,
  onSelect,
  onPreview,
  onExport,
  onReplace,
  onRemove,
  onCopyPath,
  onOpenReferencingNumatb,
  busy,
}: {
  texture: UnitModelTextureEntry;
  selected: boolean;
  focused?: boolean;
  textureDataMap: NutexbTextureDataMap;
  onSelect: () => void;
  onPreview: () => void;
  onExport: () => void;
  onReplace: () => void;
  onRemove: () => void;
  onCopyPath: () => void;
  onOpenReferencingNumatb?: (numatbBasename: string) => void;
  busy: boolean;
}) {
  const thumbnailDataUrl = getSceneTextureThumbnailDataUrl(texture.path, textureDataMap);
  const loadedData = lookupSceneTextureData(textureDataMap, texture.path);
  const dims =
    loadedData && loadedData.width > 0 && loadedData.height > 0
      ? `${loadedData.width}x${loadedData.height}`
      : textureDims(texture);
  const referenced = texture.structureRefCount > 0 || texture.numatbReferenceCount > 0;

  return (
    <div
      className={cn(
        "flex min-w-0 cursor-pointer items-center gap-2 px-2 py-1.5 transition-colors",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-muted/35",
        focused && "ring-2 ring-inset ring-amber-500/70",
        !texture.exists && "bg-destructive/5",
      )}
      onClick={onSelect}
    >
      <button
        type="button"
        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted/60"
        onClick={(event) => {
          event.stopPropagation();
          onPreview();
        }}
        title="Preview"
      >
        {thumbnailDataUrl ? (
          <img src={thumbnailDataUrl} alt={texture.filename} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-4 w-4 text-muted-foreground/60" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium" title={texture.filename}>
          {texture.filename}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {texture.format} / {dims} / {formatBytes(texture.sizeBytes)}
        </div>
        {texture.internalName && texture.internalName !== texture.filename.replace(/\.nutexb$/i, "") ? (
          <div className="truncate font-mono text-[9px] text-muted-foreground" title={texture.internalName}>
            {texture.internalName}
          </div>
        ) : null}
        {selected && onOpenReferencingNumatb && texture.referencedBy.length > 0 ? (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span className="text-[9px] text-muted-foreground">used by</span>
            {texture.referencedBy.map((mat) => (
              <button
                key={mat}
                type="button"
                className="rounded bg-muted px-1 py-0.5 font-mono text-[9px] text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary"
                title={`Open ${mat}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenReferencingNumatb(mat);
                }}
              >
                {mat}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="flex items-center gap-1">
          {!texture.exists ? (
            <Badge variant="destructive" className="h-5 px-1.5 text-[9px]">
              missing
            </Badge>
          ) : referenced ? (
            <Badge variant="secondary" className="h-5 px-1.5 text-[9px]" title={texture.referencedBy.join(", ")}>
              ref {texture.numatbReferenceCount || texture.structureRefCount}
            </Badge>
          ) : (
            <Badge variant="outline" className="h-5 px-1.5 text-[9px]">
              loose
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton title="Preview" onClick={onPreview} disabled={!texture.exists || busy}>
            <Eye className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton title="Export PNG" onClick={onExport} disabled={!texture.exists || busy}>
            <Download className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton title="Replace" onClick={onReplace} disabled={!texture.exists || busy}>
            <Replace className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton title="Copy path" onClick={onCopyPath} disabled={busy}>
            <Copy className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton title="Remove" onClick={onRemove} disabled={!texture.canRemove || busy} danger={texture.canRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

function IconButton({
  title,
  onClick,
  disabled,
  danger = false,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-6 w-6", danger && "text-destructive hover:text-destructive")}
      title={title}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </Button>
  );
}
