import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { exists, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { dirname, join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { RefreshCw, Image as ImageIcon, Loader2, FolderOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardIconList } from "./card-icon-list/CardIconList";
import { CardIconAddDialog } from "./card-icon-list/CardIconAddDialog";
import { CardIconBatchReplaceDialog } from "./card-icon-list/CardIconBatchReplaceDialog";
import { extractCardIconItems, removeCardIconFromStructureJson } from "./card-icon-list/cardIconStructure";

interface NutexbIconListViewProps {
  folderPath: string;
  hash: string;
  title: string;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
}

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; filePath: string; message: string }
  | { status: "ready"; filePath: string; items: ReturnType<typeof extractCardIconItems>; convertDirPath: string };

function normalizeHash(hash: string): string {
  const trimmed = hash.trim();
  if (!trimmed) return "";
  return trimmed.toLowerCase().startsWith("0x") ? trimmed : `0x${trimmed}`;
}

export function NutexbIconListView({
  folderPath,
  hash,
  title,
  isActive,
  onUnsavedChanges,
}: NutexbIconListViewProps) {
  const normalizedHash = normalizeHash(hash);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isRefreshingNutexb, setIsRefreshingNutexb] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const lastLoadedKeyRef = useRef<string>("");

  const resolveStructurePath = useCallback(async () => {
    return await join(folderPath, `${normalizedHash}_structure.json`);
  }, [folderPath, normalizedHash]);

  const resolveRootDir = useCallback(async () => {
    return await join(folderPath, normalizedHash);
  }, [folderPath, normalizedHash]);

  const resolveConvertDir = useCallback(async () => {
    return await join(folderPath, normalizedHash, "__convert");
  }, [folderPath, normalizedHash]);

  const load = useCallback(async () => {
    if (!folderPath) {
      setLoadState({ status: "error", filePath: "", message: "Folder path is empty" });
      return;
    }

    const filePath = await resolveStructurePath();
    setLoadState({ status: "loading" });
    try {
      const raw = await readTextFile(filePath);
      const json = JSON.parse(raw);
      const items = extractCardIconItems(json);
      const subFileData: Array<Record<string, any>> = Array.isArray(json?.SubFileData) ? json.SubFileData : [];
      const fileUrlMap = new Map<number, string>();
      for (const row of subFileData) {
        const idx = Number(row?.fileIndex);
        if (!Number.isFinite(idx)) continue;
        const url = typeof row?.fileUrl === "string" ? row.fileUrl : "";
        if (!url) continue;
        fileUrlMap.set(idx, url);
      }
      const enrichedItems = items.map((item) => ({
        ...item,
        fileUrl: item.fileIndex !== null && fileUrlMap.has(item.fileIndex) ? fileUrlMap.get(item.fileIndex) : undefined,
      }));
      const convertDirPath = await resolveConvertDir();
      setLoadState({ status: "ready", filePath, items: enrichedItems, convertDirPath });
      onUnsavedChanges?.(false);
    } catch (error) {
      console.error(error);
      setLoadState({ status: "error", filePath, message: error instanceof Error ? error.message : "Unknown error" });
    }
  }, [folderPath, onUnsavedChanges, resolveConvertDir, resolveStructurePath]);

  useEffect(() => {
    if (!isActive) return;
    const key = `${folderPath}::${normalizedHash}::nutexbiconlist`;
    if (key === lastLoadedKeyRef.current) return;
    lastLoadedKeyRef.current = key;
    void load();
  }, [folderPath, normalizedHash, isActive, load]);

  useEffect(() => {
    if (loadState.status !== "ready") return;
    setSelectedIndex((prev) => {
      if (loadState.items.length === 0) return -1;
      if (prev < 0) return prev;
      return Math.min(prev, loadState.items.length - 1);
    });
  }, [loadState]);

  const meta = useMemo(() => {
    if (loadState.status !== "ready") return null;
    return {
      count: loadState.items.length,
      structurePath: loadState.filePath,
      convertDirPath: loadState.convertDirPath,
    };
  }, [loadState]);

  const handleRefreshNutexb = useCallback(async () => {
    if (!folderPath) {
      toast.error("Folder path is empty");
      return;
    }
    if (isRefreshingNutexb) return;

    try {
      setIsRefreshingNutexb(true);
      const rootDir = await resolveRootDir();
      const result = await invoke<{ converted: number; failed: number; skipped: number }>(
        "nutexb_batch_export_png",
        {
          rootDir,
          outputMode: "root_convert",
          overwrite: true,
        }
      );
      toast.success(`Converted ${result.converted} nutexb file(s) to PNG`);
      if (result.failed > 0) {
        toast.error(`Failed to convert ${result.failed} file(s)`);
      }
      void load();
    } catch (error) {
      console.error(error);
      toast.error("Failed to refresh nutexb previews");
    } finally {
      setIsRefreshingNutexb(false);
    }
  }, [folderPath, isRefreshingNutexb, load, resolveRootDir]);

  const handleRemoveItem = useCallback(async (item: { itemIndex: number; fileIndex: number | null; fileUrl?: string | null }) => {
    if (!folderPath) {
      toast.error("Folder path is empty");
      return;
    }
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      const structurePath = await resolveStructurePath();
      const raw = await readTextFile(structurePath);
      const json = JSON.parse(raw);
      const { nextStructJson } = removeCardIconFromStructureJson(json, {
        fileIndex: item.fileIndex,
        itemIndex: item.itemIndex,
      });
      await writeTextFile(structurePath, JSON.stringify(nextStructJson, null, 2));
      toast.success("Removed icon");
      await load();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to remove icon: ${message}`);
    } finally {
      setIsUpdating(false);
    }
  }, [folderPath, isUpdating, load, resolveStructurePath]);

  const applyMoveInMemory = useCallback((items: Array<{ itemIndex: number; fileIndex: number | null; name: string | null; fileUrl?: string | null }>, fromIndex: number, toIndex: number) => {
    const total = items.length;
    const nextFrom = Math.max(0, Math.min(total - 1, Math.trunc(fromIndex)));
    const nextTo = Math.max(0, Math.min(total - 1, Math.trunc(toIndex)));
    if (nextFrom === nextTo) return items;
    const reordered = [...items];
    const [moved] = reordered.splice(nextFrom, 1);
    reordered.splice(nextTo, 0, moved);
    return reordered.map((it, idx) => ({ ...it, itemIndex: idx }));
  }, []);

  const handleMoveItem = useCallback((fromIndex: number, toIndex: number) => {
    if (loadState.status !== "ready") return;
    const total = loadState.items.length;
    const nextFrom = Math.max(0, Math.min(total - 1, Math.trunc(fromIndex)));
    const nextTo = Math.max(0, Math.min(total - 1, Math.trunc(toIndex)));
    if (nextFrom === nextTo) return;

    const selectedItem = loadState.items.find((it) => it.itemIndex === selectedIndex) ?? null;
    const selectedKey = selectedItem?.fileIndex ?? selectedItem?.name ?? null;

    const nextItems = applyMoveInMemory(loadState.items, nextFrom, nextTo);

    setLoadState((prev) => (prev.status === "ready" ? { ...prev, items: nextItems } : prev));
    onUnsavedChanges?.(true);

    if (selectedKey !== null) {
      const nextSelectedIndex = nextItems.findIndex((it) => (it.fileIndex ?? it.name ?? null) === selectedKey);
      if (nextSelectedIndex >= 0) {
        setSelectedIndex(nextSelectedIndex);
      }
    }
  }, [applyMoveInMemory, loadState, onUnsavedChanges, selectedIndex]);

  const handleOpenPath = useCallback(async (rawPath: string) => {
    try {
      const isWindowsPath = /^[a-zA-Z]:[\\/]/.test(rawPath) || rawPath.startsWith("\\\\");
      const normalizedPath = isWindowsPath ? rawPath.replace(/\//g, "\\") : rawPath.replace(/\\/g, "/");

      if (normalizedPath.includes('"')) {
        toast.error('Invalid path: contains a quote character (")');
        return;
      }

      const pathExists = await exists(normalizedPath);
      if (!pathExists) {
        toast.error("Path does not exist");
        return;
      }

      await openPath(normalizedPath);
    } catch (error) {
      console.error("Error opening path:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(message ? `Failed to open: ${message}` : "Failed to open");
    }
  }, []);

  const handleOpenStructureFolder = useCallback(async () => {
    if (loadState.status !== "ready") return;
    const folderPathToOpen = await dirname(loadState.filePath);
    await handleOpenPath(folderPathToOpen);
  }, [loadState, handleOpenPath]);

  const handleOpenConvertDir = useCallback(async () => {
    if (loadState.status !== "ready") return;
    await handleOpenPath(loadState.convertDirPath);
  }, [loadState, handleOpenPath]);

  if (!isActive) {
    return <div className="h-full w-full" />;
  }

  if (loadState.status === "loading") {
    return (
      <div className="h-full w-full">
        <Card className="h-full flex flex-col border-none shadow-none rounded-none bg-transparent">
          <CardHeader className="p-0 pb-4">
            <CardTitle>{title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-0">
            <div className="text-sm text-muted-foreground">
              Loading {normalizedHash}_structure.json...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className="h-full w-full">
        <Card className="border-none shadow-none rounded-none bg-transparent">
          <CardHeader className="p-0 pb-4">
            <CardTitle>{title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-0">
            <div className="text-sm text-muted-foreground">
              {loadState.filePath ? (
                <>
                  <div className="font-medium text-foreground">File</div>
                  <div className="break-all">{loadState.filePath}</div>
                </>
              ) : (
                <div className="break-all">Folder path is empty</div>
              )}
            </div>
            <div className="text-sm text-destructive">{loadState.message}</div>
            <Button size="sm" onClick={() => void load()} className="inline-flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Reload
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadState.status !== "ready") {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
        Select this tab to load icons
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <Card className="h-full flex flex-col border-none shadow-none rounded-none bg-transparent">
        <CardHeader className="p-0 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle>{title}</CardTitle>
              <div className="text-xs text-muted-foreground break-all mt-1 flex items-center gap-1">
                Structure: {meta?.structurePath}
                {meta?.structurePath && (
                  <button
                    type="button"
                    onClick={() => void handleOpenStructureFolder()}
                    className="shrink-0 p-0.5 rounded hover:bg-accent hover:text-accent-foreground"
                    title="Open folder"
                    aria-label="Open folder"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Loaded: {meta?.count ?? 0} icons</div>
              <div className="text-xs text-muted-foreground break-all mt-2 flex items-center gap-1">
                Convert Dir: {meta?.convertDirPath ?? "-"}
                {meta?.convertDirPath && (
                  <button
                    type="button"
                    onClick={() => void handleOpenConvertDir()}
                    className="shrink-0 p-0.5 rounded hover:bg-accent hover:text-accent-foreground"
                    title="Open folder"
                    aria-label="Open folder"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => void load()} className="inline-flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Reload
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleRefreshNutexb()}
                disabled={isRefreshingNutexb || !folderPath}
                className="inline-flex items-center gap-2"
              >
                {isRefreshingNutexb ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                Refresh Nutexb
              </Button>
              <CardIconBatchReplaceDialog
                folderPath={folderPath}
                convertDirPath={loadState.convertDirPath}
                items={loadState.items}
                onApplied={load}
                triggerLabel="Replace Format"
              />
              <CardIconAddDialog
                folderPath={folderPath}
                hash={normalizedHash}
                convertDirPath={loadState.convertDirPath}
                structurePath={loadState.filePath}
                nextIndex={loadState.items.length}
                onAdded={load}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 min-h-0 flex flex-col overflow-hidden p-0">
          <CardIconList
            items={loadState.items}
            folderPath={folderPath}
            convertDirPath={loadState.convertDirPath}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
            onReplaced={load}
            onRemove={handleRemoveItem}
            onMove={handleMoveItem}
            isUpdating={isUpdating}
          />
        </CardContent>
      </Card>
    </div>
  );
}
