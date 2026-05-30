import {
  useSceneTextureManagerStore,
  type TextureManagerEntry,
} from "../store/sceneTextureManagerStore";
import type { NutexbTextureDataMap } from "../hooks/useSceneTextureLoader";
import type { SceneTextureDecodeContext } from "../utils/sceneTextureDecode";
import {
  ensureSceneTextureThumbnailDataUrl,
  getSceneTextureThumbnailDataUrl,
  lookupSceneTextureData,
  tryCacheThumbnailFromMap,
} from "../utils/sceneTextureThumbnail";
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
import { Plus, Search, Image as ImageIcon } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useMemo, useCallback, useEffect, useReducer, useState } from "react";
import { TexturePreviewModal } from "./TexturePreviewModal";
import { TextureReplaceModal } from "./TextureReplaceModal";
import {
  TextureAddConfirmModal,
  type TextureAddConfirmPayload,
} from "./TextureAddConfirmModal";
import { VirtualizedList } from "./VirtualizedList";
import {
  convertImageToNutexb,
  reencodeNutexbWithFormat,
} from "../utils/sceneTextureConvert";
import type { DdsFormat } from "./TextureFormatSelect";

const ASYNC_THUMB_CONCURRENCY = 4;
const TEXTURE_ROW_HEIGHT = 40;

interface SceneTextureManagerProps {
  textureDataMap: NutexbTextureDataMap;
  decodeContext: SceneTextureDecodeContext;
}

export function SceneTextureManager({
  textureDataMap,
  decodeContext,
}: SceneTextureManagerProps) {
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
  const [addConfirm, setAddConfirm] = useState<TextureAddConfirmPayload | null>(
    null,
  );
  const [pendingAddQueue, setPendingAddQueue] = useState<TextureAddConfirmPayload[]>(
    [],
  );
  const [isAddConverting, setIsAddConverting] = useState(false);
  const [isPreviewReencoding, setIsPreviewReencoding] = useState(false);
  const [, bumpThumbnailCache] = useReducer((value: number) => value + 1, 0);

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

  const commitImageAdd = useCallback(
    async (filePath: string, ddsFormat: DdsFormat) => {
      const filename = filePath.split(/[/\\]/).pop() ?? "unknown";
      const nutexbFilename = filename.replace(/\.[^.]+$/, ".nutexb");
      const entryId = `tex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      addEntry({
        id: entryId,
        filename: nutexbFilename,
        status: "added",
        format: "converting",
        width: 0,
        height: 0,
        sizeBytes: 0,
        referencedBy: [],
        thumbnailDataUrl: null,
        nutexbPath: null,
        sourceImagePath: filePath,
      });

      try {
        const result = await convertImageToNutexb({
          sourcePath: filePath,
          ddsFormat,
        });
        replaceEntry(entryId, {
          nutexbPath: result.outputNutexbPath,
          format: ddsFormat,
          thumbnailDataUrl: null,
        });
      } catch {
        replaceEntry(entryId, { format: "error" });
      }
    },
    [addEntry, replaceEntry],
  );

  const advanceAddQueue = useCallback(() => {
    setPendingAddQueue((queue) => {
      const [next, ...rest] = queue;
      setAddConfirm(next ?? null);
      return rest;
    });
  }, []);

  const handleAddConfirm = useCallback(
    async (ddsFormat: DdsFormat) => {
      if (!addConfirm) return;
      setIsAddConverting(true);
      try {
        await commitImageAdd(addConfirm.sourcePath, ddsFormat);
        advanceAddQueue();
      } finally {
        setIsAddConverting(false);
      }
    },
    [addConfirm, advanceAddQueue, commitImageAdd],
  );

  const handleAddTexture = useCallback(async () => {
    const selected = await open({
      title: "Add Texture to Scene",
      multiple: true,
      filters: [
        { name: "Textures", extensions: ["nutexb", "png", "dds", "tga"] },
      ],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];

    const imagePayloads: TextureAddConfirmPayload[] = [];

    for (const filePath of paths) {
      const filename = filePath.split(/[/\\]/).pop() ?? "unknown";
      const isNutexb = filename.toLowerCase().endsWith(".nutexb");

      if (isNutexb) {
        const entryId = `tex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        addEntry({
          id: entryId,
          filename,
          status: "added",
          format: "unknown",
          width: 0,
          height: 0,
          sizeBytes: 0,
          referencedBy: [],
          thumbnailDataUrl: null,
          nutexbPath: filePath,
          sourceImagePath: null,
        });
        continue;
      }

      imagePayloads.push({
        sourcePath: filePath,
        filename,
        nutexbFilename: filename.replace(/\.[^.]+$/, ".nutexb"),
      });
    }

    if (imagePayloads.length === 0) return;

    const [first, ...rest] = imagePayloads;
    setAddConfirm(first);
    setPendingAddQueue(rest);
  }, [addEntry]);

  const handleReplace = useCallback(
    (entry: TextureManagerEntry) => {
      setReplaceTarget(entry);
    },
    []
  );

  const handleDelete = useCallback(
    (entry: TextureManagerEntry) => {
      if (entry.status !== "added") return;
      removeEntry(entry.id);
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
            placeholder="Search textures..."
            className="h-6 pl-6 text-[11px]"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={handleAddTexture}
          title="Add texture"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <VirtualizedList
        items={filtered}
        rowHeight={TEXTURE_ROW_HEIGHT}
        getItemKey={(entry) => entry.id}
        className="flex-1 min-h-0 overflow-auto"
        emptyState={
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-1">
            <ImageIcon className="h-6 w-6 opacity-40" />
            <p className="text-[10px] opacity-60">
              {searchQuery.trim() ? `No textures match "${searchQuery.trim()}"` : "No textures"}
            </p>
          </div>
        }
        renderRow={(entry) => (
          <TextureRow
            entry={entry}
            textureDataMap={textureDataMap}
            isSelected={entry.id === selectedId}
            onSelect={() => {
              setSelectedId(entry.id);
              if (entry.nutexbPath) {
                handlePreview(entry);
              }
            }}
            onPreview={() => handlePreview(entry)}
            onReplace={() => handleReplace(entry)}
            onDelete={() => handleDelete(entry)}
            onCopyPath={() => handleCopyPath(entry)}
          />
        )}
      />

      {previewEntry && (
        <TexturePreviewModal
          entry={previewEntry}
          textureDataMap={textureDataMap}
          decodeContext={decodeContext}
          onClose={() => setPreviewEntry(null)}
          onFormatApply={handlePreviewFormatApply}
          isReencoding={isPreviewReencoding}
        />
      )}

      {addConfirm && (
        <TextureAddConfirmModal
          payload={addConfirm}
          onClose={() => {
            if (!isAddConverting) {
              setAddConfirm(null);
              setPendingAddQueue([]);
            }
          }}
          onConfirm={handleAddConfirm}
          isConverting={isAddConverting}
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
              title: `Replace ${entry.filename}`,
              multiple: false,
              filters: [
                { name: "Textures", extensions: ["nutexb", "png", "dds", "tga"] },
              ],
            }).then((selected) => {
              if (typeof selected !== "string" || !selected.trim()) return;
              const filePath = selected.trim();
              const isNutexb = filePath.toLowerCase().endsWith(".nutexb");
              if (isNutexb) {
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

interface TextureRowProps {
  entry: TextureManagerEntry;
  textureDataMap: NutexbTextureDataMap;
  isSelected: boolean;
  onSelect: () => void;
  onPreview: () => void;
  onReplace: () => void;
  onDelete: () => void;
  onCopyPath: () => void;
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
}: TextureRowProps) {
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
                : "—"}
              {dims && ` · ${dims}`}
            </span>
          </div>

          <div className="flex flex-col items-end gap-0.5 shrink-0">
            <Badge
              variant={entry.status === "added" ? "default" : "secondary"}
              className="text-[9px] px-1 py-0 leading-tight h-auto"
            >
              {entry.status}
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
        <ContextMenuItem onClick={onPreview}>Preview</ContextMenuItem>
        <ContextMenuItem onClick={onReplace}>Replace</ContextMenuItem>
        <ContextMenuItem onClick={onCopyPath}>Copy Path</ContextMenuItem>
        {entry.status === "added" && (
          <ContextMenuItem onClick={onDelete} className="text-destructive">
            Delete
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
