import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { RefreshCw, Image as ImageIcon, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardIconList } from "./card-icon-list/CardIconList";
import { CardIconAddDialog } from "./card-icon-list/CardIconAddDialog";
import { extractCardIconItems, removeCardIconFromStructureJson } from "./card-icon-list/cardIconStructure";

interface CardIconListViewProps {
  folderPath: string;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
}

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; filePath: string; message: string }
  | { status: "ready"; filePath: string; items: ReturnType<typeof extractCardIconItems>; convertDirPath: string };

export default function CardIconListView({ folderPath, isActive }: CardIconListViewProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isRefreshingNutexb, setIsRefreshingNutexb] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const lastLoadedKeyRef = useRef<string>("");

  const resolveStructurePath = useCallback(async () => {
    return await join(folderPath, "0x49235031_structure.json");
  }, [folderPath]);

  const resolveRootDir = useCallback(async () => {
    return await join(folderPath, "0x49235031");
  }, [folderPath]);

  const resolveConvertDir = useCallback(async () => {
    return await join(folderPath, "0x49235031", "__convert");
  }, [folderPath]);

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
    } catch (error) {
      console.error(error);
      setLoadState({ status: "error", filePath, message: error instanceof Error ? error.message : "Unknown error" });
    }
  }, [folderPath, resolveConvertDir, resolveStructurePath]);

  useEffect(() => {
    if (!isActive) return;
    const key = `${folderPath}::cardiconlist`;
    if (key === lastLoadedKeyRef.current) return;
    lastLoadedKeyRef.current = key;
    void load();
  }, [folderPath, isActive, load]);

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

  const handleRemoveItem = useCallback(async (item: { itemIndex: number; fileUrl?: string | null }) => {
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
      const { nextStructJson } = removeCardIconFromStructureJson(json, item.itemIndex);
      await writeTextFile(structurePath, JSON.stringify(nextStructJson, null, 2));
      toast.success("Removed card icon");
      await load();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to remove card icon: ${message}`);
    } finally {
      setIsUpdating(false);
    }
  }, [folderPath, isUpdating, load, resolveStructurePath]);

  if (!isActive) {
    return <div className="h-full w-full" />;
  }

  if (loadState.status === "loading") {
    return (
      <div className="h-full w-full">
        <Card className="h-full flex flex-col">
          <CardHeader>
            <CardTitle>Card Icon List</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">Loading 0x49235031_structure.json...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className="h-full w-full">
        <Card>
          <CardHeader>
            <CardTitle>Card Icon List</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
        Select this tab to load card icons
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle>Card Icon List</CardTitle>
              <div className="text-xs text-muted-foreground break-all mt-1">Structure: {meta?.structurePath}</div>
              <div className="text-xs text-muted-foreground mt-1">Loaded: {meta?.count ?? 0} icons</div>
              <div className="text-xs text-muted-foreground break-all mt-2">
                Convert Dir: {meta?.convertDirPath ?? "-"}
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
              <CardIconAddDialog
                folderPath={folderPath}
                convertDirPath={loadState.convertDirPath}
                structurePath={loadState.filePath}
                nextIndex={loadState.items.length}
                onAdded={load}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <CardIconList
            items={loadState.items}
            folderPath={folderPath}
            convertDirPath={loadState.convertDirPath}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
            onReplaced={load}
            onRemove={handleRemoveItem}
          />
        </CardContent>
      </Card>
    </div>
  );
}
