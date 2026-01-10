import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { Buffer } from "buffer";
import { toast } from "sonner";
import { RefreshCw, Save, Image as ImageIcon, Loader2, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SeriesList, buildSeriesListBuffer } from "@/models/seriesList";
import { SeriesEditor } from "./series-list/SeriesEditor";
import { extractA0253FirstFolderSeriesBaseNameOrder } from "./series-list/seriesImage";

interface SeriesListViewProps {
  folderPath: string;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
}

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; filePath: string; message: string }
  | { status: "ready"; filePath: string; list: SeriesList };

type SeriesImageCountState =
  | { status: "idle"; dirPath: string }
  | { status: "loading"; dirPath: string }
  | { status: "error"; dirPath: string; message: string }
  | { status: "ready"; dirPath: string; count: number; seriesBaseNameOrder: Array<string | null> };

export default function SeriesListView({ folderPath, isActive, onUnsavedChanges }: SeriesListViewProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [hasChanges, setHasChanges] = useState(false);
  const [isRefreshingNutexb, setIsRefreshingNutexb] = useState(false);
  const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);
  const [seriesImageCountState, setSeriesImageCountState] = useState<SeriesImageCountState>({
    status: "idle",
    dirPath: "",
  });
  const lastLoadedKeyRef = useRef<string>("");

  const resolveFilePath = useCallback(async () => {
    return await join(folderPath, "0xb7367090", "series_list.bin");
  }, [folderPath]);

  const resolveSeriesImageConvertDir = useCallback(async () => {
    return await join(folderPath, "0xA0253AA0", "__convert");
  }, [folderPath]);

  const resolveSeriesImageStructureJsonPath = useCallback(async () => {
    return await join(folderPath, "0xA0253AA0_structure.json");
  }, [folderPath]);

  const resetEditorState = useCallback(() => {
    setHasChanges(false);
    onUnsavedChanges?.(false);
  }, [onUnsavedChanges]);

  const load = useCallback(async () => {
    if (!folderPath) {
      setLoadState({ status: "error", filePath: "", message: "Folder path is empty" });
      resetEditorState();
      return;
    }

    const filePath = await resolveFilePath();
    setLoadState({ status: "loading" });
    try {
      const fileData = await readFile(filePath);
      const list = new SeriesList(Buffer.from(fileData));
      setLoadState({ status: "ready", filePath, list });
      resetEditorState();
    } catch (error) {
      console.error(error);
      setLoadState({ status: "error", filePath, message: error instanceof Error ? error.message : "Unknown error" });
      resetEditorState();
    }
  }, [folderPath, resetEditorState, resolveFilePath]);

  useEffect(() => {
    if (!isActive) return;
    const key = `${folderPath}::serieslist`;
    if (key === lastLoadedKeyRef.current) return;
    lastLoadedKeyRef.current = key;
    void load();
  }, [folderPath, isActive, load]);

  const loadSeriesImageCount = useCallback(async () => {
    if (!folderPath) {
      setSeriesImageCountState({ status: "error", dirPath: "", message: "Folder path is empty" });
      return;
    }

    const dirPath = await resolveSeriesImageConvertDir();
    setSeriesImageCountState({ status: "loading", dirPath });
    try {
      const structurePath = await resolveSeriesImageStructureJsonPath();
      const raw = await readFile(structurePath);
      const text = new TextDecoder().decode(raw);
      const json = JSON.parse(text);
      const seriesBaseNameOrder = extractA0253FirstFolderSeriesBaseNameOrder(json);
      setSeriesImageCountState({ status: "ready", dirPath, count: seriesBaseNameOrder.length, seriesBaseNameOrder });
    } catch (error) {
      setSeriesImageCountState({
        status: "error",
        dirPath,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [folderPath, resolveSeriesImageConvertDir, resolveSeriesImageStructureJsonPath]);

  useEffect(() => {
    if (!isActive) return;
    if (!folderPath) return;
    void loadSeriesImageCount();
  }, [folderPath, isActive, loadSeriesImageCount]);

  const handleEditorChange = useCallback(
    (next: SeriesList) => {
      setLoadState((prev) => {
        if (prev.status !== "ready") return prev;
        return { ...prev, list: next };
      });
      setHasChanges(true);
      onUnsavedChanges?.(true);
    },
    [onUnsavedChanges]
  );

  const fileMeta = useMemo(() => {
    if (loadState.status !== "ready") return null;
    return {
      count: loadState.list.SeriesCount,
      commands: loadState.list.CommandsCount,
    };
  }, [loadState]);

  const handleSaveFile = useCallback(async () => {
    if (loadState.status !== "ready") return;
    const filePath = loadState.filePath;
    try {
      const backupPath = filePath.replace(/\.bin$/i, "_bak.bin");
      try {
        const existing = await readFile(filePath);
        await writeFile(backupPath, existing);
      } catch {
        // Ignore backup failures
      }

      const buffer = buildSeriesListBuffer(loadState.list);
      await writeFile(filePath, buffer);
      toast.success("Saved series_list.bin");
      setHasChanges(false);
      onUnsavedChanges?.(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save series_list.bin");
    }
  }, [loadState, onUnsavedChanges]);

  const handleRefreshNutexb = useCallback(async () => {
    if (!folderPath) {
      toast.error("Folder path is empty");
      return;
    }

    try {
      setIsRefreshingNutexb(true);
      const seriesImageDir = await join(folderPath, "0xA0253AA0");
      const result = await invoke<{ converted: number; failed: number; skipped: number }>(
        "nutexb_batch_export_png",
        {
          rootDir: seriesImageDir,
          outputMode: "root_convert",
          overwrite: true,
        }
      );
      toast.success(`Converted ${result.converted} nutexb file(s) to PNG`);
      if (result.failed > 0) {
        toast.error(`Failed to convert ${result.failed} file(s)`);
      }
      void loadSeriesImageCount();
    } catch (error) {
      console.error(error);
      toast.error("Failed to refresh nutexb previews");
    } finally {
      setIsRefreshingNutexb(false);
    }
  }, [folderPath, loadSeriesImageCount]);

  if (!isActive) {
    return <div className="h-full w-full" />;
  }

  if (loadState.status === "loading") {
    return (
      <div className="h-full w-full">
        <Card className="h-full flex flex-col">
          <CardHeader>
            <CardTitle>Series List</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">Loading series_list.bin...</div>
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
            <CardTitle>Series List</CardTitle>
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
        Select this tab to load series_list.bin
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle>Series List</CardTitle>
              <div className="text-xs text-muted-foreground break-all mt-1">Series List: {loadState.filePath}</div>
              {fileMeta && (
                <div className="text-xs text-muted-foreground mt-1">
                  Loaded: {fileMeta.count} series, {fileMeta.commands} commands
                </div>
              )}
              <div className="text-xs text-muted-foreground break-all mt-2">
                Series Image List: {seriesImageCountState.dirPath || "-"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Loaded:{" "}
                {seriesImageCountState.status === "ready"
                  ? `${seriesImageCountState.count} png`
                  : seriesImageCountState.status === "loading"
                    ? "Loading..."
                    : seriesImageCountState.status === "error"
                      ? "Failed"
                      : "-"}
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
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsInfoDialogOpen(true)}
                className="inline-flex items-center gap-2"
              >
                <Info className="w-4 h-4" />
                Info
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSaveFile()}
                disabled={!hasChanges}
                className="inline-flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save File
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 min-h-0">
          <SeriesEditor
            seriesListData={loadState.list}
            seriesImageConvertDirPath={seriesImageCountState.dirPath}
            seriesImageSeriesBaseNameOrder={seriesImageCountState.status === "ready" ? seriesImageCountState.seriesBaseNameOrder : []}
            onRefreshSeriesImages={loadSeriesImageCount}
            onChange={handleEditorChange}
          />
        </CardContent>
      </Card>

      <Dialog open={isInfoDialogOpen} onOpenChange={setIsInfoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Info</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 pt-2">
                <p>1. 自动加载0xb7367090\series_list.bin</p>
                <p>2. 图片mapping自0xA0253AA0\__convert</p>
                <p>3. 图片透过0xA0253AA0_structure.json来mapping原有顺序</p>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}

