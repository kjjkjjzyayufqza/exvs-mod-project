import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Buffer } from "buffer";
import { toast } from "sonner";
import { Download, Upload, RefreshCw, Save, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CharacterListOB, buildCharacterListBuffer } from "@/models/characterListOB";
import { SeriesList } from "@/models/seriesList";
import { getPathSeparatorFromFileUrl } from "@/lib/fhm2d_fileUrlUtils";
import { extractCardIconItems } from "./card-icon-list/cardIconStructure";
import { buildCardIconPreviewPath } from "./card-icon-list/cardIconUtils";
import {
  extractA0253FirstFolderSeriesBaseNameOrder,
  formatSeriesPngFileNameFromBaseName,
  resolveMappedSeriesBaseName,
} from "./series-list/seriesImage";
import { CharacterEditor } from "./character-list/CharacterEditor";
import type { SeriesIdPickerItem } from "./character-list/SeriesIdPickerPopover";
import {
  applyCharaJsonImportToList,
  exportCharaJsonToFile,
  pickCharaJsonImportPreview,
  type CharaJsonImportPreview,
} from "./character-list/CharaJson";

interface CharacterListViewProps {
  folderPath: string;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
}

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; filePath: string; message: string }
  | { status: "ready"; filePath: string; list: CharacterListOB };

type SeriesPickerState =
  | { status: "idle"; filePath: string; convertDirPath: string }
  | { status: "loading"; filePath: string; convertDirPath: string }
  | { status: "error"; filePath: string; convertDirPath: string; message: string }
  | { status: "ready"; filePath: string; convertDirPath: string; items: SeriesIdPickerItem[] };

type CardIconMapState =
  | { status: "idle"; filePath: string; convertDirPath: string }
  | { status: "loading"; filePath: string; convertDirPath: string }
  | { status: "error"; filePath: string; convertDirPath: string; message: string }
  | {
      status: "ready";
      filePath: string;
      convertDirPath: string;
      nameOrder: Array<string | null>;
      pickerItems: Array<{ index: number; name: string | null; previewSrc: string }>;
    };

export default function CharacterListView({ folderPath, isActive, onUnsavedChanges }: CharacterListViewProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [seriesPickerState, setSeriesPickerState] = useState<SeriesPickerState>({
    status: "idle",
    filePath: "",
    convertDirPath: "",
  });
  const [cardIconMapState, setCardIconMapState] = useState<CardIconMapState>({
    status: "idle",
    filePath: "",
    convertDirPath: "",
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<CharaJsonImportPreview | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [editorResetKey, setEditorResetKey] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const lastLoadedKeyRef = useRef<string>("");

  const resolveFilePath = useCallback(async () => {
    return await join(folderPath, "0xDFD38C70", "character_list.bin");
  }, [folderPath]);

  const resolveSeriesListFilePath = useCallback(async () => {
    return await join(folderPath, "0xb7367090", "series_list.bin");
  }, [folderPath]);

  const resolveSeriesImageConvertDir = useCallback(async () => {
    return await join(folderPath, "0xA0253AA0", "__convert");
  }, [folderPath]);

  const resolveSeriesImageStructureJsonPath = useCallback(async () => {
    return await join(folderPath, "0xA0253AA0_structure.json");
  }, [folderPath]);

  const resolveCardIconStructureJsonPath = useCallback(async () => {
    return await join(folderPath, "0x49235031_structure.json");
  }, [folderPath]);

  const resolveCardIconConvertDir = useCallback(async () => {
    return await join(folderPath, "0x49235031", "__convert");
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
      const list = new CharacterListOB(Buffer.from(fileData));
      setLoadState({ status: "ready", filePath, list });
      resetEditorState();
    } catch (error) {
      console.error(error);
      setLoadState({ status: "error", filePath, message: error instanceof Error ? error.message : "Unknown error" });
      resetEditorState();
    }
  }, [folderPath, resetEditorState, resolveFilePath]);

  const loadSeriesPicker = useCallback(async () => {
    if (!folderPath) {
      setSeriesPickerState({ status: "error", filePath: "", convertDirPath: "", message: "Folder path is empty" });
      return;
    }

    const filePath = await resolveSeriesListFilePath();
    const convertDirPath = await resolveSeriesImageConvertDir();
    setSeriesPickerState({ status: "loading", filePath, convertDirPath });

    try {
      const fileData = await readFile(filePath);
      const list = new SeriesList(Buffer.from(fileData));

      const sep = getPathSeparatorFromFileUrl(convertDirPath);
      const structurePath = await resolveSeriesImageStructureJsonPath();
      const structRaw = await readFile(structurePath);
      const structText = new TextDecoder().decode(structRaw);
      const structJson = JSON.parse(structText);
      const seriesBaseNameOrder = extractA0253FirstFolderSeriesBaseNameOrder(structJson);

      const toPreviewSrc = (iconFileIndex: number) => {
        const baseName = resolveMappedSeriesBaseName(seriesBaseNameOrder, iconFileIndex);
        if (!baseName) return "/tauri.svg";
        const png = formatSeriesPngFileNameFromBaseName(baseName);
        if (!png) return "/tauri.svg";
        const full = convertDirPath.endsWith(sep) ? `${convertDirPath}${png}` : `${convertDirPath}${sep}${png}`;
        return convertFileSrc(full);
      };

      const items: SeriesIdPickerItem[] = list.SeriesData.map((s) => ({
        id: s.SeriesId,
        iconFileIndex: s.iconFileIndex,
        label: s.unkStr1?.Utf8String || `Series ${s.SeriesId}`,
        previewSrc: toPreviewSrc(s.iconFileIndex),
      })).sort((a, b) => {
        if (a.iconFileIndex !== b.iconFileIndex) return a.iconFileIndex - b.iconFileIndex;
        return a.id - b.id;
      });

      setSeriesPickerState({ status: "ready", filePath, convertDirPath, items });
    } catch (error) {
      console.error(error);
      setSeriesPickerState({
        status: "error",
        filePath,
        convertDirPath,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [folderPath, resolveSeriesImageConvertDir, resolveSeriesImageStructureJsonPath, resolveSeriesListFilePath]);

  const loadCardIconMap = useCallback(async () => {
    if (!folderPath) {
      setCardIconMapState({ status: "error", filePath: "", convertDirPath: "", message: "Folder path is empty" });
      return;
    }

    const filePath = await resolveCardIconStructureJsonPath();
    const convertDirPath = await resolveCardIconConvertDir();
    setCardIconMapState({ status: "loading", filePath, convertDirPath });

    try {
      const raw = await readFile(filePath);
      const text = new TextDecoder().decode(raw);
      const json = JSON.parse(text);
      const items = extractCardIconItems(json);
      const nameOrder = items.map((it) => it.name);
      const pickerItems = items.map((it) => {
        const previewPath = it.name ? buildCardIconPreviewPath(convertDirPath, it.name) : null;
        const previewSrc = previewPath ? convertFileSrc(previewPath) : "/tauri.svg";
        return { index: it.itemIndex, name: it.name, previewSrc };
      });
      setCardIconMapState({ status: "ready", filePath, convertDirPath, nameOrder, pickerItems });
    } catch (error) {
      console.error(error);
      setCardIconMapState({
        status: "error",
        filePath,
        convertDirPath,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [folderPath, resolveCardIconConvertDir, resolveCardIconStructureJsonPath]);

  useEffect(() => {
    if (!isActive) return;
    const key = `${folderPath}::characterlist`;
    if (key === lastLoadedKeyRef.current) return;
    lastLoadedKeyRef.current = key;
    void load();
    void loadSeriesPicker();
    void loadCardIconMap();
  }, [folderPath, isActive, load, loadCardIconMap, loadSeriesPicker]);

  useEffect(() => {
    if (loadState.status !== "ready") return;
    setSelectedIndex((prev) => {
      if (loadState.list.CharacterData.length === 0) return -1;
      if (prev < 0) return prev;
      return Math.min(prev, loadState.list.CharacterData.length - 1);
    });
  }, [loadState]);

  const handleEditorChange = useCallback(
    (next: CharacterListOB) => {
      setLoadState((prev) => {
        if (prev.status !== "ready") return prev;
        return { ...prev, list: next };
      });
      setHasChanges(true);
      onUnsavedChanges?.(true);
    },
    [onUnsavedChanges]
  );

  const handleEditorSelectChange = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  const fileMeta = useMemo(() => {
    if (loadState.status !== "ready") return null;
    return {
      count: loadState.list.CharacterCount,
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

      const sortedRows = [...loadState.list.CharacterData].sort((a, b) => {
        const aIsPositive = a.CharacterId >= 0;
        const bIsPositive = b.CharacterId >= 0;
        if (aIsPositive !== bIsPositive) return aIsPositive ? -1 : 1;
        return a.CharacterId - b.CharacterId;
      });
      const sortedList = Object.assign(Object.create(Object.getPrototypeOf(loadState.list)), loadState.list, {
        CharacterData: sortedRows,
        CharacterCount: sortedRows.length,
      });
      const buffer = buildCharacterListBuffer(sortedList);
      await writeFile(filePath, buffer);
      toast.success("Saved character_list.bin");
      setHasChanges(false);
      onUnsavedChanges?.(false);
      setLoadState((prev) => {
        if (prev.status !== "ready") return prev;
        return { ...prev, list: sortedList };
      });
    } catch (error) {
      console.error(error);
      toast.error("Failed to save character_list.bin");
    }
  }, [loadState, onUnsavedChanges]);

  const handleExportCharaJson = useCallback(async () => {
    if (loadState.status !== "ready") return;
    if (isExporting) return;

    setIsExporting(true);
    try {
      const result = await exportCharaJsonToFile(loadState.list.CharacterData);
      if (!result) return;
      toast.success(`Exported ${result.count} characters`);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to export JSON: ${message}`);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, loadState]);

  const handlePickImportCharaJson = useCallback(async () => {
    if (loadState.status !== "ready") return;
    if (isImporting) return;

    setIsImporting(true);
    try {
      const preview = await pickCharaJsonImportPreview();
      if (!preview) return;

      if (preview.validCount === 0) {
        toast.error("Invalid JSON: no valid entries found");
        return;
      }

      setImportPreview(preview);
      setIsImportDialogOpen(true);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to import JSON: ${message}`);
    } finally {
      setIsImporting(false);
    }
  }, [isImporting, loadState]);

  const handleConfirmImport = useCallback(async () => {
    if (loadState.status !== "ready") return;
    if (!importPreview) return;
    if (isImporting) return;

    setIsImporting(true);
    try {
      const nextList = applyCharaJsonImportToList(loadState.list, importPreview.rows);
      setLoadState((prev) => {
        if (prev.status !== "ready") return prev;
        return { ...prev, list: nextList };
      });
      setHasChanges(true);
      onUnsavedChanges?.(true);
      setEditorResetKey((k) => k + 1);

      setIsImportDialogOpen(false);
      setImportPreview(null);
      toast.success(`Imported ${importPreview.validCount} characters`);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to apply import: ${message}`);
    } finally {
      setIsImporting(false);
    }
  }, [importPreview, isImporting, loadState, onUnsavedChanges]);

  const handleReloadAll = useCallback(() => {
    void load();
    void loadSeriesPicker();
    void loadCardIconMap();
  }, [load, loadCardIconMap, loadSeriesPicker]);

  if (!isActive) {
    return <div className="h-full w-full" />;
  }

  if (loadState.status === "loading") {
    return (
      <div className="h-full w-full">
        <Card className="h-full flex flex-col">
          <CardHeader>
            <CardTitle>Character List</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">Loading character_list.bin...</div>
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
            <CardTitle>Character List</CardTitle>
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
            <Button size="sm" onClick={handleReloadAll} className="inline-flex items-center gap-2">
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
        Select this tab to load character_list.bin
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle>Character List</CardTitle>
              <div className="text-xs text-muted-foreground break-all mt-1">{loadState.filePath}</div>
              {fileMeta && (
                <div className="text-xs text-muted-foreground mt-1">
                  Loaded: {fileMeta.count} characters, {fileMeta.commands} commands
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={handleReloadAll} className="inline-flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Reload
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handlePickImportCharaJson()}
                disabled={isImporting}
                className="inline-flex items-center gap-2"
                title="Import characters from JSON"
              >
                <Upload className="w-4 h-4" />
                Import JSON
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleExportCharaJson()}
                disabled={isExporting || loadState.list.CharacterData.length === 0}
                className="inline-flex items-center gap-2"
                title="Export all characters to JSON"
              >
                <Download className="w-4 h-4" />
                Export JSON
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
          <CharacterEditor
            key={editorResetKey}
            characterListData={loadState.list}
            selectedIndex={selectedIndex}
            seriesIdPickerItems={
              seriesPickerState.status === "ready"
                ? seriesPickerState.items
                : []
            }
            seriesIdPickerLoading={seriesPickerState.status === "loading" || seriesPickerState.status === "idle"}
            seriesIdPickerError={seriesPickerState.status === "error" ? seriesPickerState.message : null}
            cardIconConvertDirPath={cardIconMapState.convertDirPath}
            cardIconNameOrder={cardIconMapState.status === "ready" ? cardIconMapState.nameOrder : []}
            cardIconIndexPickerItems={cardIconMapState.status === "ready" ? cardIconMapState.pickerItems : []}
            cardIconIndexPickerLoading={cardIconMapState.status === "loading" || cardIconMapState.status === "idle"}
            cardIconIndexPickerError={cardIconMapState.status === "error" ? cardIconMapState.message : null}
            onChange={handleEditorChange}
            onSelectChange={handleEditorSelectChange}
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

      <Dialog
        open={isImportDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setIsImportDialogOpen(true);
            return;
          }
          setIsImportDialogOpen(false);
          setImportPreview(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Chara JSON</DialogTitle>
            <DialogDescription>
              {importPreview ? (
                <>
                  <div className="mt-2 space-y-1">
                    <div className="break-all">File: {importPreview.filePath}</div>
                    <div>
                      Total: {importPreview.totalCount} · Valid: {importPreview.validCount} · Invalid: {importPreview.invalidCount}
                      {importPreview.duplicateIds.length > 0 ? ` · Duplicates: ${importPreview.duplicateIds.length}` : ""}
                    </div>
                  </div>
                </>
              ) : (
                <>No file selected</>
              )}
            </DialogDescription>
          </DialogHeader>

          {importPreview && (
            <div className="space-y-2">
              <div className="text-sm font-medium">IDs to import ({importPreview.ids.length})</div>
              <div className="max-h-56 overflow-auto border rounded-md p-2 text-xs font-mono whitespace-pre-wrap">
                {importPreview.ids.slice(0, 500).join(", ")}
                {importPreview.ids.length > 500 ? `\n... and ${importPreview.ids.length - 500} more` : ""}
              </div>
              {importPreview.duplicateIds.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Duplicate IDs detected (will be imported as-is): {importPreview.duplicateIds.slice(0, 100).join(", ")}
                  {importPreview.duplicateIds.length > 100 ? ` ... and ${importPreview.duplicateIds.length - 100} more` : ""}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsImportDialogOpen(false);
                setImportPreview(null);
              }}
              disabled={isImporting}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleConfirmImport()}
              disabled={!importPreview || importPreview.validCount === 0 || isImporting}
              className="inline-flex items-center gap-2"
            >
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}



