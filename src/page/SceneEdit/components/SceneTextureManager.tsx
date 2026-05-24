import {
  useSceneTextureManagerStore,
  type TextureManagerEntry,
} from "../store/sceneTextureManagerStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { Plus, Search, Image as ImageIcon } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useMemo, useCallback, useEffect, useRef } from "react";

export function SceneTextureManager() {
  const {
    entries,
    selectedId,
    searchQuery,
    setSelectedId,
    setSearchQuery,
    addEntry,
    removeEntry,
    replaceEntry,
    setThumbnail,
  } = useSceneTextureManagerStore();
  const loadingRef = useRef(new Set<string>());

  // Lazy thumbnail loading for entries that have nutexbPath but no thumbnail
  useEffect(() => {
    for (const entry of entries) {
      if (entry.thumbnailDataUrl || !entry.nutexbPath || loadingRef.current.has(entry.id)) continue;
      loadingRef.current.add(entry.id);
      invoke<string>("nutexb_thumbnail_base64", { inputPath: entry.nutexbPath })
        .then((base64) => {
          setThumbnail(entry.id, `data:image/png;base64,${base64}`);
        })
        .catch(() => {
          // Silently fail — keep placeholder icon
        })
        .finally(() => {
          loadingRef.current.delete(entry.id);
        });
    }
  }, [entries, setThumbnail]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter((e) => e.filename.toLowerCase().includes(q));
  }, [entries, searchQuery]);

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
    for (const path of paths) {
      const filename = path.split(/[/\\]/).pop() ?? "unknown";
      const isNutexb = filename.toLowerCase().endsWith(".nutexb");
      addEntry({
        id: `tex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        filename,
        status: "added",
        format: isNutexb ? "unknown" : "pending",
        width: 0,
        height: 0,
        sizeBytes: 0,
        referencedBy: [],
        thumbnailDataUrl: null,
        nutexbPath: isNutexb ? path : null,
        sourceImagePath: isNutexb ? null : path,
      });
    }
  }, [addEntry]);

  const handleReplace = useCallback(
    async (entry: TextureManagerEntry) => {
      const selected = await open({
        title: `Replace ${entry.filename}`,
        multiple: false,
        filters: [
          { name: "Textures", extensions: ["nutexb", "png", "dds", "tga"] },
        ],
      });
      if (typeof selected !== "string" || !selected.trim()) return;
      replaceEntry(entry.id, {
        sourceImagePath: selected.trim(),
        nutexbPath: selected.toLowerCase().endsWith(".nutexb")
          ? selected.trim()
          : entry.nutexbPath,
      });
    },
    [replaceEntry]
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
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

      {/* List */}
      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-1">
            <ImageIcon className="h-6 w-6 opacity-40" />
            <p className="text-[10px] opacity-60">No textures</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map((entry) => (
              <TextureRow
                key={entry.id}
                entry={entry}
                isSelected={entry.id === selectedId}
                onSelect={() => setSelectedId(entry.id)}
                onReplace={() => handleReplace(entry)}
                onDelete={() => handleDelete(entry)}
                onCopyPath={() => handleCopyPath(entry)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface TextureRowProps {
  entry: TextureManagerEntry;
  isSelected: boolean;
  onSelect: () => void;
  onReplace: () => void;
  onDelete: () => void;
  onCopyPath: () => void;
}

function TextureRow({
  entry,
  isSelected,
  onSelect,
  onReplace,
  onDelete,
  onCopyPath,
}: TextureRowProps) {
  const dims =
    entry.width > 0 && entry.height > 0
      ? `${entry.width}x${entry.height}`
      : null;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "flex items-center gap-2 px-2 py-1 cursor-pointer select-none border-b border-border/30",
            isSelected
              ? "bg-accent text-accent-foreground"
              : "hover:bg-muted/40"
          )}
          style={{ height: 40 }}
          onClick={onSelect}
        >
          {/* Thumbnail */}
          <div className="w-8 h-8 shrink-0 rounded bg-muted/50 flex items-center justify-center overflow-hidden">
            {entry.thumbnailDataUrl ? (
              <img
                src={entry.thumbnailDataUrl}
                alt={entry.filename}
                className="w-full h-full object-cover"
              />
            ) : (
              <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
            )}
          </div>

          {/* Center info */}
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

          {/* Right badges */}
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
