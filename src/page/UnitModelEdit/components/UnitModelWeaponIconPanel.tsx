import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { confirm, open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Eye,
  Image as ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Replace,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSsbhModelPreview } from "@/components/ssbh-model-preview/SsbhModelPreviewPanel";
import { clearNutexbRgbaCache } from "@/components/ssbh-model-preview/nutexbPreviewCache";
import { TexturePreviewModal } from "@/page/SceneEdit/components/TexturePreviewModal";
import { TextureReplaceModal } from "@/page/SceneEdit/components/TextureReplaceModal";
import {
  TextureAddConfirmModal,
  type TextureAddSelection,
} from "@/page/SceneEdit/components/TextureAddConfirmModal";
import type { DdsFormat } from "@/page/SceneEdit/components/TextureFormatSelect";
import { replaceNutexbInPlace } from "@/page/SceneEdit/utils/sceneTextureConvert";
import {
  analyzeTextureAddCandidates,
  invalidateNutexbInternalName,
  type AnalyzedAddCandidate,
  type RawAddFile,
} from "@/page/SceneEdit/utils/sceneTextureAddPlan";
import { applyWeaponIconAddSelections } from "../utils/unitModelWeaponIconAdd";
import {
  clearSceneTextureThumbnailCache,
  ensureSceneTextureThumbnailDataUrl,
  getSceneTextureThumbnailDataUrl,
} from "@/page/SceneEdit/utils/sceneTextureThumbnail";
import type { SceneTextureDecodeContext } from "@/page/SceneEdit/utils/sceneTextureDecode";
import type { TextureManagerEntry } from "@/page/SceneEdit/store/sceneTextureManagerStore";
import type { NutexbTextureDataMap } from "@/page/SceneEdit/hooks/useSceneTextureLoader";
import {
  getStoredDialogDefaultPath,
  rememberStoredDialogSelection,
} from "@/utils/dialogDefaultPathStore";
import { getBaseName, inferUnitModelStructurePath } from "../utils/unitModelRepackService";
import {
  UNIT_MODEL_ADD_WEAPON_ICON_DIALOG_PATH_KEY,
  UNIT_MODEL_REPLACE_WEAPON_ICON_DIALOG_PATH_KEY,
} from "../utils/unitModelEditorSettings";
import {
  listUnitModelWeaponIcons,
  removeUnitModelWeaponIcon,
  reorderUnitModelWeaponIcons,
  weaponIconHudLabel,
  type UnitModelWeaponIconEntry,
  type UnitModelWeaponIconInventory,
} from "../utils/unitModelWeaponIconService";
import { isExvsCommonModelRoot } from "../utils/exvsCommonService";

const UNIT_TEXTURES_CHANGED_EVENT = "unit-model-textures-changed";

type Props = {
  unitRoot: string | null;
  onMutated?: () => void;
  focusFilename?: string | null;
  readOnly?: boolean;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function emitUnitTexturesChanged(): void {
  window.dispatchEvent(new CustomEvent(UNIT_TEXTURES_CHANGED_EVENT));
}

function iconToManagerEntry(icon: UnitModelWeaponIconEntry): TextureManagerEntry {
  return {
    id: `weapon_icon_${icon.fileIndex}`,
    filename: icon.filename,
    status: "existing",
    scope: "model",
    infoCategory: null,
    format: icon.format,
    width: icon.width,
    height: icon.height,
    sizeBytes: icon.sizeBytes,
    referencedBy: [weaponIconHudLabel(icon.hudIndex)],
    thumbnailDataUrl: null,
    nutexbPath: icon.path,
    sourceImagePath: null,
  };
}

export function UnitModelWeaponIconPanel({
  unitRoot,
  onMutated,
  focusFilename = null,
  readOnly = false,
}: Props) {
  const preview = useSsbhModelPreview();
  const isExvsCommon = isExvsCommonModelRoot(unitRoot);
  const mutationsLocked = readOnly || isExvsCommon;
  const structurePath = useMemo(() => {
    if (!unitRoot) return null;
    try {
      return inferUnitModelStructurePath(unitRoot);
    } catch {
      return null;
    }
  }, [unitRoot]);
  const decodeContext = useMemo<SceneTextureDecodeContext>(
    () => ({ sourceKind: "disk", sessionId: null, maxDimension: 64 }),
    [],
  );
  const previewDecodeContext = useMemo<SceneTextureDecodeContext>(
    () => ({ sourceKind: "disk", sessionId: null, maxDimension: null }),
    [],
  );
  const textureDataMap = preview.textureDataMap as unknown as NutexbTextureDataMap;
  const [inventory, setInventory] = useState<UnitModelWeaponIconInventory | null>(null);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"add" | "reorder" | "remove" | "replace" | null>(null);
  const [previewEntry, setPreviewEntry] = useState<TextureManagerEntry | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<TextureManagerEntry | null>(null);
  const [addCandidates, setAddCandidates] = useState<AnalyzedAddCandidate[] | null>(null);
  const [addAnalyzing, setAddAnalyzing] = useState(false);
  const [convertProgress, setConvertProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [, bumpThumbnailCache] = useReducer((value: number) => value + 1, 0);
  const focusKey = (focusFilename ?? "").toLowerCase();

  const selectedIcon = useMemo(
    () => inventory?.icons.find((icon) => icon.fileIndex === selectedFileIndex) ?? null,
    [inventory, selectedFileIndex],
  );
  const managerEntries = useMemo<TextureManagerEntry[]>(
    () => (inventory?.icons ?? []).map(iconToManagerEntry),
    [inventory],
  );

  const refreshInventory = useCallback(async () => {
    if (!unitRoot || !structurePath) {
      setInventory(null);
      return null;
    }
    setLoading(true);
    try {
      const next = await listUnitModelWeaponIcons(unitRoot, structurePath);
      setInventory(next);
      setSelectedFileIndex((prev) => {
        if (prev !== null && next.icons.some((icon) => icon.fileIndex === prev)) return prev;
        return null;
      });
      return next;
    } catch (error) {
      toast.error("Failed to list weapon icons", { description: String(error) });
      return null;
    } finally {
      setLoading(false);
    }
  }, [structurePath, unitRoot]);

  useEffect(() => {
    void refreshInventory();
  }, [refreshInventory]);

  useEffect(() => {
    setSelectedFileIndex(null);
  }, [unitRoot]);

  useEffect(() => {
    let cancelled = false;
    const paths = (inventory?.icons ?? []).map((icon) => icon.path).filter(Boolean);
    void (async () => {
      for (const path of paths) {
        if (cancelled) return;
        await ensureSceneTextureThumbnailDataUrl(path, textureDataMap, decodeContext);
      }
      if (!cancelled) bumpThumbnailCache();
    })();
    return () => {
      cancelled = true;
    };
  }, [decodeContext, inventory, textureDataMap]);

  const notifyMutated = useCallback(
    (next: UnitModelWeaponIconInventory) => {
      setInventory(next);
      emitUnitTexturesChanged();
      onMutated?.();
    },
    [onMutated],
  );

  const handleAdd = useCallback(async () => {
    if (!unitRoot || !structurePath) {
      toast.error("No unit model folder selected");
      return;
    }
    if (mutationsLocked) {
      toast.message("Weapon HUD icons are only edited on character packs.");
      return;
    }
    const selected = await open({
      title: "Add weapon HUD icon",
      multiple: true,
      filters: [{ name: "Textures", extensions: ["nutexb", "png", "dds", "tga"] }],
      defaultPath:
        (await getStoredDialogDefaultPath(UNIT_MODEL_ADD_WEAPON_ICON_DIALOG_PATH_KEY)) ??
        unitRoot ??
        undefined,
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    if (paths.length === 0) return;
    const firstPath = paths[0];
    if (firstPath) {
      await rememberStoredDialogSelection(
        UNIT_MODEL_ADD_WEAPON_ICON_DIALOG_PATH_KEY,
        firstPath,
        "file",
      );
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
      toast.error("Failed to analyze weapon icons", { description: String(error) });
      setAddCandidates(null);
    } finally {
      setAddAnalyzing(false);
    }
  }, [managerEntries, mutationsLocked, structurePath, unitRoot]);

  const handleBatchConfirm = useCallback(
    async (selections: TextureAddSelection[]) => {
      if (!unitRoot || !structurePath || selections.length === 0) return;
      setBusy("add");
      setConvertProgress({ done: 0, total: selections.length });
      try {
        const result = await applyWeaponIconAddSelections({
          modelRoot: unitRoot,
          structureJsonPath: structurePath,
          selections,
          existingEntries: managerEntries,
          onProgress: (done, total) => setConvertProgress({ done, total }),
        });
        if (result.replacedCount > 0) {
          const next = await refreshInventory();
          if (next) setInventory(next);
          emitUnitTexturesChanged();
          onMutated?.();
        } else if (result.inventory) {
          notifyMutated(result.inventory);
        }
        const summaryParts: string[] = [];
        if (result.addedCount > 0) summaryParts.push(`Added ${result.addedCount}`);
        if (result.replacedCount > 0) summaryParts.push(`replaced ${result.replacedCount}`);
        toast.success(
          summaryParts.length > 0
            ? `${summaryParts.join(", ")} HUD icon(s)`
            : "No HUD icons changed",
        );
      } catch (error) {
        toast.error("Failed to add weapon icon", { description: String(error) });
        await refreshInventory();
      } finally {
        setBusy(null);
        setConvertProgress(null);
        setAddCandidates(null);
        setAddAnalyzing(false);
        clearNutexbRgbaCache();
        clearSceneTextureThumbnailCache();
        bumpThumbnailCache();
      }
    },
    [managerEntries, notifyMutated, onMutated, refreshInventory, structurePath, unitRoot],
  );

  const handleMove = useCallback(
    async (fileIndex: number, direction: -1 | 1) => {
      if (!unitRoot || !structurePath || !inventory) return;
      if (mutationsLocked) return;
      const from = inventory.icons.findIndex((icon) => icon.fileIndex === fileIndex);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= inventory.icons.length) return;
      const fileIndices = inventory.icons.map((icon) => icon.fileIndex);
      const swapped = fileIndices[from]!;
      fileIndices[from] = fileIndices[to]!;
      fileIndices[to] = swapped;
      setBusy("reorder");
      try {
        const next = await reorderUnitModelWeaponIcons({
          modelRoot: unitRoot,
          structureJsonPath: structurePath,
          fileIndices,
        });
        notifyMutated(next);
      } catch (error) {
        toast.error("Failed to reorder weapon icons", { description: String(error) });
        await refreshInventory();
      } finally {
        setBusy(null);
      }
    },
    [inventory, mutationsLocked, notifyMutated, refreshInventory, structurePath, unitRoot],
  );

  const handleRemove = useCallback(
    async (icon: UnitModelWeaponIconEntry) => {
      if (!unitRoot || !structurePath) return;
      if (mutationsLocked) return;
      const confirmed = await confirm(
        `Remove ${weaponIconHudLabel(icon.hudIndex)} (${icon.filename}) from the HUD table? Later icons shift down. This does not unbind MSC slots.`,
        { title: "Remove weapon HUD icon", kind: "warning" },
      );
      if (!confirmed) return;
      setBusy("remove");
      try {
        const next = await removeUnitModelWeaponIcon({
          modelRoot: unitRoot,
          structureJsonPath: structurePath,
          fileIndex: icon.fileIndex,
        });
        notifyMutated(next);
        toast.success(`Removed ${icon.filename}`);
      } catch (error) {
        toast.error("Failed to remove weapon icon", { description: String(error) });
        await refreshInventory();
      } finally {
        setBusy(null);
      }
    },
    [mutationsLocked, notifyMutated, refreshInventory, structurePath, unitRoot],
  );

  const handleReplace = useCallback(
    async (entry: TextureManagerEntry, ddsFormat: DdsFormat) => {
      if (!entry.nutexbPath) {
        throw new Error(`Cannot replace ${entry.filename}: missing nutexb path`);
      }
      const selected = await open({
        title: "Replace weapon HUD icon",
        multiple: false,
        filters: [{ name: "Textures", extensions: ["nutexb", "png", "dds", "tga"] }],
        defaultPath:
          (await getStoredDialogDefaultPath(UNIT_MODEL_REPLACE_WEAPON_ICON_DIALOG_PATH_KEY)) ??
          unitRoot ??
          undefined,
      });
      if (!selected || Array.isArray(selected)) return;
      await rememberStoredDialogSelection(
        UNIT_MODEL_REPLACE_WEAPON_ICON_DIALOG_PATH_KEY,
        selected,
        "file",
      );
      setBusy("replace");
      try {
        await replaceNutexbInPlace({
          sourcePath: selected,
          targetNutexbPath: entry.nutexbPath,
          ddsFormat,
        });
        invalidateNutexbInternalName(entry.nutexbPath);
        clearNutexbRgbaCache();
        clearSceneTextureThumbnailCache();
        bumpThumbnailCache();
        await refreshInventory();
        emitUnitTexturesChanged();
        toast.success(`Replaced ${entry.filename}`);
      } catch (error) {
        toast.error("Failed to replace weapon icon", { description: String(error) });
      } finally {
        setBusy(null);
      }
    },
    [refreshInventory, unitRoot],
  );

  const noRoot = !unitRoot;
  const icons = inventory?.icons ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-semibold">Weapon HUD icons</div>
          <div className="truncate text-[10px] text-muted-foreground">
            Structure order is HUD 0, 1, 2… not Explorer sort
          </div>
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
          variant="default"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => void handleAdd()}
          disabled={noRoot || busy !== null || mutationsLocked}
          title="Add HUD icon (nutexb / png / dds / tga)"
        >
          {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>

      <div className="border-b px-2 py-2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold">
              {unitRoot ? getBaseName(unitRoot) : "No unit loaded"}
            </div>
            <div className="truncate font-mono text-[10px] text-muted-foreground" title={structurePath ?? undefined}>
              {structurePath ?? "-"}
            </div>
          </div>
          <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px]">
            {icons.length}
          </Badge>
        </div>
        {isExvsCommon ? (
          <div className="mt-2 text-[10px] text-muted-foreground">
            EXVS Common packs do not own character HUD icons.
          </div>
        ) : (
          <div className="mt-2 text-[10px] text-muted-foreground">
            A new art at the end does not create a bar. Bind the HUD slot in MSC / armsparam too.
          </div>
        )}
        {inventory?.warnings.length ? (
          <div className="mt-2 flex items-start gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="line-clamp-2">{inventory.warnings[0]}</span>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {noRoot ? (
          <div className="flex h-32 flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageIcon className="h-6 w-6 opacity-40" />
            <span className="text-[11px]">Open a unit model folder</span>
          </div>
        ) : loading && !inventory ? (
          <div className="p-2 text-[11px] text-muted-foreground">Loading HUD icons…</div>
        ) : icons.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageIcon className="h-6 w-6 opacity-40" />
            <span className="text-[11px]">No weapon_icon Folder yet</span>
          </div>
        ) : (
          icons.map((icon, index) => {
            const focused = focusKey.length > 0 && icon.filename.toLowerCase() === focusKey;
            return (
              <WeaponIconRow
                key={icon.fileIndex}
                icon={icon}
                selected={selectedIcon?.fileIndex === icon.fileIndex}
                focused={focused}
                textureDataMap={textureDataMap}
                canMoveUp={index > 0}
                canMoveDown={index < icons.length - 1}
                busy={busy !== null}
                mutationsLocked={mutationsLocked}
                onSelect={() => setSelectedFileIndex(icon.fileIndex)}
                onPreview={() => setPreviewEntry(iconToManagerEntry(icon))}
                onReplace={() => setReplaceTarget(iconToManagerEntry(icon))}
                onMoveUp={() => void handleMove(icon.fileIndex, -1)}
                onMoveDown={() => void handleMove(icon.fileIndex, 1)}
                onRemove={() => void handleRemove(icon)}
              />
            );
          })
        )}
      </div>

      {previewEntry ? (
        <TexturePreviewModal
          entry={previewEntry}
          textureDataMap={textureDataMap}
          decodeContext={previewDecodeContext}
          onClose={() => setPreviewEntry(null)}
        />
      ) : null}

      {replaceTarget ? (
        <TextureReplaceModal
          entry={replaceTarget}
          onClose={() => setReplaceTarget(null)}
          onConfirm={(ddsFormat) => {
            const entry = replaceTarget;
            setReplaceTarget(null);
            void handleReplace(entry, ddsFormat);
          }}
        />
      ) : null}

      {addCandidates ? (
        <TextureAddConfirmModal
          candidates={addCandidates}
          analyzing={addAnalyzing}
          isConverting={busy === "add"}
          convertProgress={convertProgress}
          title={`Add HUD icons (${addCandidates.length})`}
          subtitle="PNG/DDS/TGA convert into weapon_icon; check a conflict row to replace"
          onClose={() => {
            if (busy !== "add") {
              setAddCandidates(null);
              setAddAnalyzing(false);
            }
          }}
          onConfirm={(selections) => {
            void handleBatchConfirm(selections);
          }}
        />
      ) : null}
    </div>
  );
}

function WeaponIconRow({
  icon,
  selected,
  focused,
  textureDataMap,
  canMoveUp,
  canMoveDown,
  busy,
  mutationsLocked,
  onSelect,
  onPreview,
  onReplace,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  icon: UnitModelWeaponIconEntry;
  selected: boolean;
  focused: boolean;
  textureDataMap: NutexbTextureDataMap;
  canMoveUp: boolean;
  canMoveDown: boolean;
  busy: boolean;
  mutationsLocked: boolean;
  onSelect: () => void;
  onPreview: () => void;
  onReplace: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const thumbnailDataUrl = getSceneTextureThumbnailDataUrl(icon.path, textureDataMap);
  const dims = icon.width > 0 && icon.height > 0 ? `${icon.width}x${icon.height}` : "-";

  return (
    <div
      className={cn(
        "flex min-w-0 cursor-pointer items-center gap-2 border-b border-border/50 px-2 py-1.5 transition-colors",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-muted/35",
        focused && "ring-2 ring-inset ring-amber-500/70",
        !icon.exists && "bg-destructive/5",
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
          <img src={thumbnailDataUrl} alt={icon.filename} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-4 w-4 text-muted-foreground/60" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="h-5 shrink-0 px-1.5 font-mono text-[9px]">
            {weaponIconHudLabel(icon.hudIndex)}
          </Badge>
          <span className="truncate text-[11px] font-medium" title={icon.filename}>
            {icon.filename}
          </span>
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {icon.format} / {dims} / {formatBytes(icon.sizeBytes)} / fi {icon.fileIndex}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <IconButton title="Preview" onClick={onPreview} disabled={!icon.exists || busy}>
          <Eye className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton title="Move HUD index up" onClick={onMoveUp} disabled={!canMoveUp || busy || mutationsLocked}>
          <ArrowUp className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton title="Move HUD index down" onClick={onMoveDown} disabled={!canMoveDown || busy || mutationsLocked}>
          <ArrowDown className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton title="Replace art" onClick={onReplace} disabled={!icon.exists || busy || mutationsLocked}>
          <Replace className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton title="Remove from HUD table" onClick={onRemove} disabled={busy || mutationsLocked} danger>
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
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
    <button
      type="button"
      title={title}
      disabled={disabled}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40",
        danger && "hover:bg-destructive/15 hover:text-destructive",
      )}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}
