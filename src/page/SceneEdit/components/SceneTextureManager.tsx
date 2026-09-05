import {
  useSceneTextureManagerStore,
  type TextureManagerEntry,
} from "../store/sceneTextureManagerStore";
import type { NutexbTextureDataMap } from "../hooks/useSceneTextureLoader";
import type { SceneTextureDecodeContext } from "../utils/sceneTextureDecode";
import {
  ensureSceneTextureThumbnailDataUrl,
  clearSceneTextureThumbnailCache,
  getSceneTextureThumbnailDataUrl,
  lookupSceneTextureData,
  tryCacheThumbnailFromMap,
} from "../utils/sceneTextureThumbnail";
import { clearNutexbRgbaCache } from "@/components/ssbh-model-preview/nutexbPreviewCache";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { Plus, Search, Image as ImageIcon, Download } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useMemo, useCallback, useEffect, useReducer, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { TexturePreviewModal } from "./TexturePreviewModal";
import { TextureReplaceModal } from "./TextureReplaceModal";
import {
  TextureAddConfirmModal,
  type TextureAddSelection,
} from "./TextureAddConfirmModal";
import { VirtualizedList } from "./VirtualizedList";
import {
  convertImageToNutexb,
  exportNutexbToPng,
  replaceNutexbInPlace,
  reencodeNutexbWithFormat,
} from "../utils/sceneTextureConvert";
import {
  analyzeTextureAddCandidates,
  findTextureEntryForDuplicate,
  invalidateNutexbInternalName,
  type AnalyzedAddCandidate,
  type RawAddFile,
} from "../utils/sceneTextureAddPlan";
import { useSceneDirtyStore } from "../store/sceneDirtyStore";
import type { DdsFormat } from "./TextureFormatSelect";

const ASYNC_THUMB_CONCURRENCY = 4;
const TEXTURE_ROW_HEIGHT = 40;

function formatInfoCategory(category: TextureManagerEntry["infoCategory"], t: (key: string) => string): string {
  switch (category) {
    case "fog":
      return t("categories.fog");
    case "light":
      return t("categories.light");
    case "post_effect":
      return t("categories.postEffect");
    default:
      return t("categories.info");
  }
}

interface SceneTextureManagerProps {
  textureDataMap: NutexbTextureDataMap;
  decodeContext: SceneTextureDecodeContext;
}

export function SceneTextureManager({
  textureDataMap,
  decodeContext,
}: SceneTextureManagerProps) {
  const { t } = useTranslation("scene-texture");
  const {
    entries,
    selectedId,
    searchQuery,
    setSelectedId,
    setSearchQuery,
    addEntry,
    removeEntry,
    replaceEntry,
  } = useSceneTextureManagerStore();
  const [previewEntry, setPreviewEntry] = useState<TextureManagerEntry | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<TextureManagerEntry | null>(null);
  const [addCandidates, setAddCandidates] = useState<AnalyzedAddCandidate[] | null>(
    null,
  );
  const [addAnalyzing, setAddAnalyzing] = useState(false);
  const [isAddConverting, setIsAddConverting] = useState(false);
  const [convertProgress, setConvertProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [isPreviewReencoding, setIsPreviewReencoding] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [, bumpThumbnailCache] = useReducer((value: number) => value + 1, 0);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedId) ?? null,
    [entries, selectedId],
  );

  useEffect(() => {
    let cancelled = false;
    let frameId = 0;
    let entryIndex = 0;
    const asyncPaths = new Set<string>();

    const finishAsync = async () => {
      const paths = Array.from(asyncPaths);
      if (paths.length === 0 || cancelled) return;

      let cursor = 0;
      const worker = async () => {
        while (!cancelled) {
          const index = cursor++;
          if (index >= paths.length) return;
          await ensureSceneTextureThumbnailDataUrl(
            paths[index],
            textureDataMap,
            decodeContext,
          );
        }
      };

      await Promise.all(
        Array.from(
          { length: Math.min(ASYNC_THUMB_CONCURRENCY, paths.length) },
          () => worker(),
        ),
      );

      if (!cancelled) {
        bumpThumbnailCache();
      }
    };

    const processBatch = () => {
      if (cancelled) return;
      const batchEnd = Math.min(entryIndex + 32, entries.length);
      for (; entryIndex < batchEnd; entryIndex += 1) {
        const path = entries[entryIndex]?.nutexbPath;
        if (!path) continue;
        const cached = tryCacheThumbnailFromMap(path, textureDataMap);
        if (!cached) {
          asyncPaths.add(path);
        }
      }

      if (entryIndex < entries.length) {
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
  }, [entries, textureDataMap, decodeContext]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter((e) => e.filename.toLowerCase().includes(q));
  }, [entries, searchQuery]);

  const modelEntries = useMemo(
    () => filtered.filter((entry) => entry.scope !== "info"),
    [filtered],
  );
  const infoEntries = useMemo(
    () => filtered.filter((entry) => entry.scope === "info"),
    [filtered],
  );
  const hasInfoEntries = useMemo(
    () => entries.some((entry) => entry.scope === "info"),
    [entries],
  );

  const handleAddTexture = useCallback(async () => {
    const selected = await open({
      title: t("dialog.addTitle"),
      multiple: true,
      filters: [
        { name: t("dialog.texturesFilter"), extensions: ["nutexb", "png", "dds", "tga"] },
      ],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    if (paths.length === 0) return;

    const files: RawAddFile[] = paths.map((p) => ({
      sourcePath: p,
      filename: p.split(/[/\\]/).pop() ?? "unknown",
    }));

    // Open the modal immediately with un-analyzed rows so the user sees the
    // selection at once, then fill in duplicate flags once the (async) internal
    // name reads finish.
    setAddAnalyzing(true);
    setAddCandidates(
      files.map((f) => ({
        id: f.sourcePath,
        sourcePath: f.sourcePath,
        filename: f.filename,
        nutexbFilename: f.filename.replace(/\.[^.]+$/, ".nutexb"),
        isNutexb: f.filename.toLowerCase().endsWith(".nutexb"),
        internalName: null,
        duplicate: false,
        duplicateReason: null,
        duplicateOf: null,
      })),
    );

    try {
      const analyzed = await analyzeTextureAddCandidates(
        files,
        useSceneTextureManagerStore.getState().entries,
      );
      setAddCandidates(analyzed);
    } catch (error) {
      console.error(error);
      toast.error(t("errors.analyzeDuplicates"));
    } finally {
      setAddAnalyzing(false);
    }
  }, []);

  const handleBatchConfirm = useCallback(
    async (selections: TextureAddSelection[]) => {
      if (selections.length === 0) return;
      setIsAddConverting(true);
      setConvertProgress({ done: 0, total: selections.length });

      try {
        let done = 0;
        let addedCount = 0;
        let replacedCount = 0;
        let failedCount = 0;

        for (const { candidate, ddsFormat, replace } of selections) {
          if (replace) {
            const existing = findTextureEntryForDuplicate(
              useSceneTextureManagerStore.getState().entries,
              candidate,
            );
            if (!existing?.nutexbPath) {
              failedCount += 1;
              toast.error(t("errors.cannotReplace", { filename: candidate.filename }), {
                description: existing
                  ? t("errors.noTargetPath")
                  : t("errors.entryNotFound"),
              });
              done += 1;
              setConvertProgress({ done, total: selections.length });
              continue;
            }
            try {
              await replaceNutexbInPlace({
                sourcePath: candidate.sourcePath,
                targetNutexbPath: existing.nutexbPath,
                ddsFormat,
              });
              invalidateNutexbInternalName(existing.nutexbPath);
              replaceEntry(existing.id, {
                format: candidate.isNutexb ? "unknown" : ddsFormat,
                thumbnailDataUrl: null,
                sourceImagePath: candidate.isNutexb ? null : candidate.sourcePath,
              });
              replacedCount += 1;
            } catch (error) {
              failedCount += 1;
              console.error(error);
              toast.error(t("errors.replaceFailed", { filename: existing.filename }), {
                description:
                  error instanceof Error ? error.message : String(error),
              });
            }
            done += 1;
            setConvertProgress({ done, total: selections.length });
            continue;
          }

          const entryId = `tex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

          if (candidate.isNutexb) {
            addEntry({
              id: entryId,
              filename: candidate.nutexbFilename,
              status: "added",
              scope: "model",
              infoCategory: null,
              format: "unknown",
              width: 0,
              height: 0,
              sizeBytes: 0,
              referencedBy: [],
              thumbnailDataUrl: null,
              nutexbPath: candidate.sourcePath,
              sourceImagePath: null,
            });
            addedCount += 1;
          } else {
            addEntry({
              id: entryId,
              filename: candidate.nutexbFilename,
              status: "added",
              scope: "model",
              infoCategory: null,
              format: "converting",
              width: 0,
              height: 0,
              sizeBytes: 0,
              referencedBy: [],
              thumbnailDataUrl: null,
              nutexbPath: null,
              sourceImagePath: candidate.sourcePath,
            });
            try {
              const result = await convertImageToNutexb({
                sourcePath: candidate.sourcePath,
                ddsFormat,
              });
              replaceEntry(entryId, {
                nutexbPath: result.outputNutexbPath,
                format: ddsFormat,
                thumbnailDataUrl: null,
              });
              addedCount += 1;
            } catch {
              replaceEntry(entryId, { format: "error" });
              failedCount += 1;
            }
          }

          done += 1;
          setConvertProgress({ done, total: selections.length });
        }

        if (addedCount > 0 || replacedCount > 0) {
          useSceneDirtyStore.getState().markGlobalDirty("textures");
          clearNutexbRgbaCache();
          clearSceneTextureThumbnailCache();
          bumpThumbnailCache();
        }
        if (replacedCount > 0 && failedCount === 0) {
          toast.success(
            addedCount > 0
              ? `Added ${addedCount}, replaced ${replacedCount} texture(s)`
              : `Replaced ${replacedCount} texture(s)`,
          );
        }
      } finally {
        setIsAddConverting(false);
        setConvertProgress(null);
        setAddCandidates(null);
        setAddAnalyzing(false);
      }
    },
    [addEntry, replaceEntry],
  );

  const handleReplace = useCallback(
    (entry: TextureManagerEntry) => {
      setReplaceTarget(entry);
    },
    []
  );

  const handleDelete = useCallback(
    (entry: TextureManagerEntry) => {
      if (entry.scope === "info") {
        toast.info(t("errors.infoNotRemovable"));
        return;
      }
      // A texture wired into a numatb material must not be removed — doing so
      // would leave a dangling reference. Removal stays in-memory until the user
      // commits with "save changes" (existing files are deleted from the stage
      // textures/ folder by the save pipeline at that point).
      if (entry.referencedBy.length > 0) {
        toast.error(t("errors.referenced"), {
          description: t("errors.usedBy", { filename: entry.filename, refs: entry.referencedBy.join(", ") }),
        });
        return;
      }
      removeEntry(entry.id);
      useSceneDirtyStore.getState().markGlobalDirty("textures");
    },
    [removeEntry]
  );

  const handleCopyPath = useCallback(async (entry: TextureManagerEntry) => {
    const path = entry.nutexbPath ?? entry.sourceImagePath ?? entry.filename;
    await navigator.clipboard.writeText(path);
  }, []);

  const handlePreview = useCallback((entry: TextureManagerEntry) => {
    if (entry.nutexbPath) {
      setPreviewEntry(entry);
    }
  }, []);

  const handleExport = useCallback(async (entry: TextureManagerEntry) => {
    if (!entry.nutexbPath || isExporting) return;
    setIsExporting(true);
    try {
      const outputPath = await exportNutexbToPng({
        nutexbPath: entry.nutexbPath,
        suggestedFilename: entry.filename.replace(/\.nutexb$/i, ".png"),
      });
      if (outputPath) {
        toast.success(t("success.exported", { filename: outputPath.split(/[/\\]/).pop() }));
      }
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error ? error.message : t("errors.exportFailed");
      toast.error(message);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting]);

  const handlePreviewFormatApply = useCallback(
    async (ddsFormat: DdsFormat) => {
      if (!previewEntry?.nutexbPath) return;
      setIsPreviewReencoding(true);
      try {
        await reencodeNutexbWithFormat({
          nutexbPath: previewEntry.nutexbPath,
          ddsFormat,
          sourceImagePath: previewEntry.sourceImagePath,
        });
        invalidateNutexbInternalName(previewEntry.nutexbPath);
        replaceEntry(previewEntry.id, {
          format: ddsFormat,
          thumbnailDataUrl: null,
        });
        setPreviewEntry((prev) =>
          prev ? { ...prev, format: ddsFormat, thumbnailDataUrl: null } : prev,
        );
        bumpThumbnailCache();
      } catch {
        replaceEntry(previewEntry.id, { format: "error" });
      } finally {
        setIsPreviewReencoding(false);
      }
    },
    [previewEntry, replaceEntry],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-2 py-1.5 bg-muted/20 border-b">
        <div className="relative flex-1">
          <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("toolbar.searchPlaceholder")}
            className="h-6 pl-6 text-[11px]"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={handleAddTexture}
          title={t("toolbar.add")}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        {selectedEntry?.nutexbPath && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => void handleExport(selectedEntry)}
            disabled={isExporting}
            title={t("toolbar.exportSelected")}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
        {modelEntries.length === 0 && infoEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-1">
            <ImageIcon className="h-6 w-6 opacity-40" />
            <p className="text-[10px] opacity-60">
              {searchQuery.trim() ? t("empty.noMatches", { query: searchQuery.trim() }) : t("empty.noTextures")}
            </p>
          </div>
        ) : (
          <>
            <TextureSection
              title={t("sections.model")}
              description={t("sections.sharedFolder")}
              entries={modelEntries}
              textureDataMap={textureDataMap}
              selectedId={selectedId}
              onSelect={(entry) => {
                setSelectedId(entry.id);
                if (entry.nutexbPath) {
                  handlePreview(entry);
                }
              }}
              onPreview={handlePreview}
              onReplace={handleReplace}
              onDelete={handleDelete}
              onCopyPath={handleCopyPath}
              onExport={handleExport}
              isExporting={isExporting}
              grow={infoEntries.length === 0}
            />
            {(hasInfoEntries || infoEntries.length > 0) && (
              <TextureSection
                title={t("sections.info")}
                description={t("sections.infoDescription")}
                entries={infoEntries}
                textureDataMap={textureDataMap}
                selectedId={selectedId}
                onSelect={(entry) => {
                  setSelectedId(entry.id);
                  if (entry.nutexbPath) {
                    handlePreview(entry);
                  }
                }}
                onPreview={handlePreview}
                onReplace={handleReplace}
                onDelete={handleDelete}
                onCopyPath={handleCopyPath}
                onExport={handleExport}
                isExporting={isExporting}
                grow={modelEntries.length === 0}
              />
            )}
          </>
        )}
      </div>

      {previewEntry && (
        <TexturePreviewModal
          entry={previewEntry}
          textureDataMap={textureDataMap}
          decodeContext={decodeContext}
          onClose={() => setPreviewEntry(null)}
          onFormatApply={
            previewEntry.scope === "info" ? undefined : handlePreviewFormatApply
          }
          isReencoding={isPreviewReencoding}
        />
      )}

      {addCandidates && (
        <TextureAddConfirmModal
          candidates={addCandidates}
          analyzing={addAnalyzing}
          isConverting={isAddConverting}
          convertProgress={convertProgress}
          onClose={() => {
            if (!isAddConverting) {
              setAddCandidates(null);
              setAddAnalyzing(false);
            }
          }}
          onConfirm={handleBatchConfirm}
        />
      )}

      {replaceTarget && (
        <TextureReplaceModal
          entry={replaceTarget}
          onClose={() => setReplaceTarget(null)}
          onConfirm={(ddsFormat) => {
            const entry = replaceTarget;
            setReplaceTarget(null);
            open({
              title: t("actions.replaceNamed", { filename: entry.filename }),
              multiple: false,
              filters: [
                { name: t("dialog.texturesFilter"), extensions: ["nutexb", "png", "dds", "tga"] },
              ],
            }).then((selected) => {
              if (typeof selected !== "string" || !selected.trim()) return;
              const filePath = selected.trim();
              const isNutexb = filePath.toLowerCase().endsWith(".nutexb");
              if (entry.scope === "info") {
                if (!entry.nutexbPath) {
                  toast.error(t("errors.noTargetPath"));
                  return;
                }
                replaceNutexbInPlace({
                  sourcePath: filePath,
                  targetNutexbPath: entry.nutexbPath,
                  ddsFormat,
                })
                  .then(() => {
                    invalidateNutexbInternalName(entry.nutexbPath as string);
                    clearNutexbRgbaCache();
                    clearSceneTextureThumbnailCache();
                    replaceEntry(entry.id, {
                      format: isNutexb ? "unknown" : ddsFormat,
                      thumbnailDataUrl: null,
                    });
                    bumpThumbnailCache();
                    toast.success(t("success.replaced", { filename: entry.filename }));
                  })
                  .catch((error) => {
                    console.error(error);
                    const message =
                      error instanceof Error
                        ? error.message
                        : t("errors.replaceFailed", { filename: entry.filename });
                    toast.error(message);
                  });
                return;
              }
              if (isNutexb) {
                invalidateNutexbInternalName(filePath);
                replaceEntry(entry.id, {
                  nutexbPath: filePath,
                  sourceImagePath: null,
                  thumbnailDataUrl: null,
                });
              } else {
                replaceEntry(entry.id, {
                  sourceImagePath: filePath,
                  format: "converting",
                  thumbnailDataUrl: null,
                });
                convertImageToNutexb({ sourcePath: filePath, ddsFormat })
                  .then((result) => {
                    replaceEntry(entry.id, {
                      nutexbPath: result.outputNutexbPath,
                      format: ddsFormat,
                      thumbnailDataUrl: null,
                    });
                  })
                  .catch(() => {
                    replaceEntry(entry.id, { format: "error" });
                  });
              }
            });
          }}
        />
      )}
    </div>
  );
}

interface TextureSectionProps {
  title: string;
  description: string;
  entries: TextureManagerEntry[];
  textureDataMap: NutexbTextureDataMap;
  selectedId: string | null;
  onSelect: (entry: TextureManagerEntry) => void;
  onPreview: (entry: TextureManagerEntry) => void;
  onReplace: (entry: TextureManagerEntry) => void;
  onDelete: (entry: TextureManagerEntry) => void;
  onCopyPath: (entry: TextureManagerEntry) => void;
  onExport: (entry: TextureManagerEntry) => void;
  isExporting: boolean;
  grow: boolean;
}

function TextureSection({
  title,
  description,
  entries,
  textureDataMap,
  selectedId,
  onSelect,
  onPreview,
  onReplace,
  onDelete,
  onCopyPath,
  onExport,
  isExporting,
  grow,
}: TextureSectionProps) {
  const { t } = useTranslation("scene-texture");
  return (
    <section className={cn("flex min-h-0 flex-col border-b border-border/40", grow ? "flex-1" : "basis-1/2")}>
      <div className="flex items-center justify-between gap-2 border-b border-border/30 bg-muted/10 px-2 py-1">
        <div className="min-w-0">
          <div className="truncate text-[10px] font-semibold text-foreground">
            {title}
          </div>
          <div className="truncate text-[9px] text-muted-foreground">
            {description}
          </div>
        </div>
        <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[9px] leading-none">
          {entries.length}
        </Badge>
      </div>
      <VirtualizedList
        items={entries}
        rowHeight={TEXTURE_ROW_HEIGHT}
        getItemKey={(entry) => entry.id}
        className="flex-1 min-h-0 overflow-auto"
        emptyState={
          <div className="flex h-16 items-center justify-center px-2 text-center text-[10px] text-muted-foreground">
            {t("empty.noSectionMatches")}
          </div>
        }
        renderRow={(entry) => (
          <TextureRow
            entry={entry}
            textureDataMap={textureDataMap}
            isSelected={entry.id === selectedId}
            onSelect={() => onSelect(entry)}
            onPreview={() => onPreview(entry)}
            onReplace={() => onReplace(entry)}
            onDelete={() => onDelete(entry)}
            onCopyPath={() => onCopyPath(entry)}
            onExport={() => onExport(entry)}
            canExport={Boolean(entry.nutexbPath) && !isExporting}
          />
        )}
      />
    </section>
  );
}

interface TextureRowProps {
  entry: TextureManagerEntry;
  textureDataMap: NutexbTextureDataMap;
  isSelected: boolean;
  onSelect: () => void;
  onPreview: () => void;
  onReplace: () => void;
  onDelete: () => void;
  onCopyPath: () => void;
  onExport: () => void;
  canExport: boolean;
}

function TextureRow({
  entry,
  textureDataMap,
  isSelected,
  onSelect,
  onPreview,
  onReplace,
  onDelete,
  onCopyPath,
  onExport,
  canExport,
}: TextureRowProps) {
  const { t } = useTranslation("scene-texture");
  const thumbnailDataUrl = entry.nutexbPath
    ? getSceneTextureThumbnailDataUrl(entry.nutexbPath, textureDataMap)
    : null;

  const loadedData = entry.nutexbPath
    ? lookupSceneTextureData(textureDataMap, entry.nutexbPath)
    : null;

  const dims =
    loadedData && loadedData.width > 0 && loadedData.height > 0
      ? `${loadedData.width}x${loadedData.height}`
      : entry.width > 0 && entry.height > 0
        ? `${entry.width}x${entry.height}`
        : null;

  const isConverting = entry.format === "converting";
  const isInfoTexture = entry.scope === "info";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "flex h-full items-center gap-2 px-2 py-1 cursor-pointer select-none border-b border-border/30",
            isSelected
              ? "bg-accent text-accent-foreground"
              : "hover:bg-muted/40"
          )}
          onClick={onSelect}
        >
          <div className="w-8 h-8 shrink-0 rounded bg-muted/50 flex items-center justify-center overflow-hidden">
            {thumbnailDataUrl ? (
              <img
                src={thumbnailDataUrl}
                alt={entry.filename}
                className="w-full h-full object-cover"
              />
            ) : isConverting ? (
              <Skeleton className="h-full w-full rounded" />
            ) : (
              <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
            )}
          </div>

          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-[11px] truncate leading-tight">
              {entry.filename}
            </span>
            <span className="text-[10px] text-muted-foreground leading-tight">
              {entry.format !== "unknown" && entry.format !== "pending"
                ? entry.format
                : "-"}
              {dims && ` / ${dims}`}
            </span>
          </div>

          <div className="flex flex-col items-end gap-0.5 shrink-0">
            <Badge
              variant={entry.status === "added" ? "default" : "secondary"}
              className="text-[9px] px-1 py-0 leading-tight h-auto"
            >
              {isInfoTexture ? formatInfoCategory(entry.infoCategory, t) : entry.status}
            </Badge>
            {entry.referencedBy.length > 0 && (
              <span className="text-[9px] text-muted-foreground/70 font-mono tabular-nums">
                ×{entry.referencedBy.length}
              </span>
            )}
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onClick={onPreview}>{t("actions.preview")}</ContextMenuItem>
        {canExport && (
          <ContextMenuItem onClick={onExport}>{t("actions.exportPng")}</ContextMenuItem>
        )}
        <ContextMenuItem onClick={onReplace}>{t("actions.replace")}</ContextMenuItem>
        <ContextMenuItem onClick={onCopyPath}>{t("actions.copyPath")}</ContextMenuItem>
        {!isInfoTexture && (
          <ContextMenuItem
            onClick={onDelete}
            disabled={entry.referencedBy.length > 0}
            className={entry.referencedBy.length > 0 ? undefined : "text-destructive"}
          >
            {entry.referencedBy.length > 0
              ? t("actions.removeReferenced")
              : t("actions.remove")}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
