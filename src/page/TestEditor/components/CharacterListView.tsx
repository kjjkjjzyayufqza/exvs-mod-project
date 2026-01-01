import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { Buffer } from "buffer";
import { toast } from "sonner";
import { RefreshCw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CharacterListOB, buildCharacterListBuffer } from "@/models/characterListOB";
import { CharacterEditor } from "./character-list/CharacterEditor";

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

export default function CharacterListView({ folderPath, isActive, onUnsavedChanges }: CharacterListViewProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [hasChanges, setHasChanges] = useState(false);
  const lastLoadedKeyRef = useRef<string>("");

  const resolveFilePath = useCallback(async () => {
    return await join(folderPath, "0xDFD38C70", "character_list.bin");
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

  useEffect(() => {
    if (!isActive) return;
    const key = `${folderPath}::characterlist`;
    if (key === lastLoadedKeyRef.current) return;
    lastLoadedKeyRef.current = key;
    void load();
  }, [folderPath, isActive, load]);

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

      const buffer = buildCharacterListBuffer(loadState.list);
      await writeFile(filePath, buffer);
      toast.success("Saved character_list.bin");
      setHasChanges(false);
      onUnsavedChanges?.(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save character_list.bin");
    }
  }, [loadState, onUnsavedChanges]);

  if (!isActive) {
    return <div className="h-full w-full" />;
  }

  if (loadState.status === "loading") {
    return (
      <div className="h-full w-full p-2">
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
      <div className="h-full w-full p-4">
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
        Select this tab to load character_list.bin
      </div>
    );
  }

  return (
    <div className="h-full w-full p-2">
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
              <Button size="sm" variant="outline" onClick={() => void load()} className="inline-flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Reload
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
          <CharacterEditor characterListData={loadState.list} onChange={handleEditorChange} />
        </CardContent>
      </Card>
    </div>
  );
}



