import { useCallback, useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ChevronDown, FolderOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilePathInput } from "@/components/ui/filePathInput";
import {
  listNuanmbFilesInDirectory,
  sourcePathToMotionName,
  suggestNextMotionBundleFolderName,
  type MotionBundleClipInput,
  type MotionFolderNode,
} from "@/services/motionFolder/motionFolderService";

export type AddMotionMode = "file" | "folder";

export type AddMotionFileParams = {
  mode: "file";
  sourcePath: string;
  name: string;
  unk1: string;
  unk2: string;
  parentFolderId: string;
};

export type AddMotionFolderParams = {
  mode: "folder";
  sourceDir: string;
  folderName: string;
  actionId: string;
  unk3: number;
  parentFolderId: string;
  clips: MotionBundleClipInput[];
};

export type AddMotionParams = AddMotionFileParams | AddMotionFolderParams;

type ClipDraft = {
  sourcePath: string;
  name: string;
  modelId: string;
};

type MotionFolderAddDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy?: boolean;
  folders: MotionFolderNode[];
  defaultParentFolderId: string;
  onAdd: (params: AddMotionParams) => Promise<void>;
};

function defaultClipsFromPaths(paths: string[]): ClipDraft[] {
  return paths.map((sourcePath) => ({
    sourcePath,
    name: (() => {
      try {
        return sourcePathToMotionName(sourcePath);
      } catch {
        return "";
      }
    })(),
    modelId: "00000000",
  }));
}

export function MotionFolderAddDialog({
  open: dialogOpen,
  onOpenChange,
  busy = false,
  folders,
  defaultParentFolderId,
  onAdd,
}: MotionFolderAddDialogProps) {
  const [mode, setMode] = useState<AddMotionMode>("file");
  const [sourcePath, setSourcePath] = useState("");
  const [sourceDir, setSourceDir] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderNameTouched, setFolderNameTouched] = useState(false);
  const [unk1, setUnk1] = useState("00000000");
  const [unk2, setUnk2] = useState("00000000");
  const [actionId, setActionId] = useState("00000000");
  const [unk3, setUnk3] = useState("2");
  const [parentFolderId, setParentFolderId] = useState(defaultParentFolderId);
  const [clips, setClips] = useState<ClipDraft[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(true);

  const parentFolder = useMemo(
    () => folders.find((folder) => folder.id === parentFolderId) ?? null,
    [folders, parentFolderId],
  );

  const suggestedFolderName = useMemo(
    () => (parentFolder ? suggestNextMotionBundleFolderName(parentFolder) : "0"),
    [parentFolder],
  );

  useEffect(() => {
    if (!dialogOpen) return;
    setMode("file");
    setSourcePath("");
    setSourceDir("");
    setName("");
    setNameTouched(false);
    setFolderName("");
    setFolderNameTouched(false);
    setUnk1("00000000");
    setUnk2("00000000");
    setActionId("00000000");
    setUnk3("2");
    setParentFolderId(defaultParentFolderId);
    setClips([]);
    setScanError(null);
    setScanning(false);
    setAdvancedOpen(true);
  }, [defaultParentFolderId, dialogOpen]);

  useEffect(() => {
    if (!dialogOpen || mode !== "folder" || folderNameTouched) return;
    setFolderName(suggestedFolderName);
  }, [dialogOpen, folderNameTouched, mode, suggestedFolderName]);

  const setSourceAndMaybeName = useCallback(
    (nextPath: string) => {
      setSourcePath(nextPath);
      if (nameTouched) return;
      if (!nextPath.trim()) {
        setName("");
        return;
      }
      try {
        setName(sourcePathToMotionName(nextPath));
      } catch {
        setName("");
      }
    },
    [nameTouched],
  );

  const scanSourceDir = useCallback(async (dir: string) => {
    const trimmed = dir.trim();
    setSourceDir(trimmed);
    setScanError(null);
    if (!trimmed) {
      setClips([]);
      return;
    }
    setScanning(true);
    try {
      const paths = await listNuanmbFilesInDirectory(trimmed);
      if (paths.length === 0) {
        setClips([]);
        setScanError("No .nuanmb files found in this folder");
        return;
      }
      setClips(defaultClipsFromPaths(paths));
    } catch (error) {
      setClips([]);
      setScanError(error instanceof Error ? error.message : String(error));
    } finally {
      setScanning(false);
    }
  }, []);

  const pickSourceFile = useCallback(async () => {
    const selected = await open({
      directory: false,
      multiple: false,
      filters: [{ name: "Motion", extensions: ["nuanmb"] }],
    });
    if (typeof selected !== "string") return;
    setSourceAndMaybeName(selected);
  }, [setSourceAndMaybeName]);

  const pickSourceDir = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
    });
    if (typeof selected !== "string") return;
    await scanSourceDir(selected);
  }, [scanSourceDir]);

  const updateClip = useCallback((index: number, patch: Partial<ClipDraft>) => {
    setClips((prev) => prev.map((clip, i) => (i === index ? { ...clip, ...patch } : clip)));
  }, []);

  const canSubmit = useMemo(() => {
    if (busy || !parentFolderId) return false;
    if (mode === "file") {
      return Boolean(sourcePath.trim() && name.trim());
    }
    return Boolean(sourceDir.trim() && folderName.trim() && clips.length > 0 && !scanning && !scanError);
  }, [busy, clips.length, folderName, mode, name, parentFolderId, scanError, scanning, sourceDir, sourcePath]);

  const handleAdd = useCallback(async () => {
    if (mode === "file") {
      await onAdd({
        mode: "file",
        sourcePath,
        name,
        unk1,
        unk2,
        parentFolderId,
      });
    } else {
      const parsedUnk3 = Number.parseInt(unk3.trim(), 10);
      await onAdd({
        mode: "folder",
        sourceDir,
        folderName,
        actionId,
        unk3: Number.isFinite(parsedUnk3) ? parsedUnk3 : 2,
        parentFolderId,
        clips: clips.map((clip) => ({
          sourcePath: clip.sourcePath,
          name: clip.name,
          modelId: clip.modelId,
        })),
      });
    }
    onOpenChange(false);
  }, [
    actionId,
    clips,
    folderName,
    mode,
    name,
    onAdd,
    onOpenChange,
    parentFolderId,
    sourceDir,
    sourcePath,
    unk1,
    unk2,
    unk3,
  ]);

  return (
    <Dialog open={dialogOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add motion</DialogTitle>
          <DialogDescription>
            {mode === "file"
              ? "Import one .nuanmb as a single-action item (item unk1 = action id) and update structure JSON."
              : "Import a folder of .nuanmb clips as one action (folder unk1 = action id; each item unk2 = model id) and update structure JSON."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Add mode</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={mode === "file" ? "default" : "outline"}
                onClick={() => setMode("file")}
              >
                Single .nuanmb
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "folder" ? "default" : "outline"}
                onClick={() => setMode("folder")}
              >
                Folder bundle
              </Button>
            </div>
          </div>

          {mode === "file" ? (
            <div className="grid gap-1.5">
              <Label className="text-xs">Source .nuanmb</Label>
              <div className="flex gap-2">
                <FilePathInput
                  value={sourcePath}
                  onChange={(event) => setSourceAndMaybeName(event.target.value)}
                  className="font-mono text-xs"
                />
                <Button type="button" variant="outline" onClick={() => void pickSourceFile()}>
                  <FolderOpen className="h-4 w-4" />
                  Browse
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label className="text-xs">Source folder (contains .nuanmb clips)</Label>
              <div className="flex gap-2">
                <FilePathInput
                  value={sourceDir}
                  onChange={(event) => void scanSourceDir(event.target.value)}
                  className="font-mono text-xs"
                />
                <Button type="button" variant="outline" onClick={() => void pickSourceDir()}>
                  <FolderOpen className="h-4 w-4" />
                  Browse
                </Button>
              </div>
              {scanning ? <p className="text-[11px] text-muted-foreground">Scanning…</p> : null}
              {scanError ? <p className="text-[11px] text-destructive">{scanError}</p> : null}
            </div>
          )}

          {mode === "file" ? (
            <div className="grid gap-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                value={name}
                onChange={(event) => {
                  setNameTouched(true);
                  setName(event.target.value);
                }}
                className="font-mono text-xs"
              />
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label className="text-xs">Bundle folder name (disk / structure)</Label>
              <Input
                value={folderName}
                onChange={(event) => {
                  setFolderNameTouched(true);
                  setFolderName(event.target.value);
                }}
                className="font-mono text-xs"
                placeholder={suggestedFolderName}
              />
              <p className="text-[11px] text-muted-foreground">
                Game packs usually use sequential numbers under the parent (suggested: {suggestedFolderName}).
              </p>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label className="text-xs">Parent folder</Label>
            <select
              value={parentFolderId}
              onChange={(event) => {
                setParentFolderId(event.target.value);
                if (mode === "folder" && !folderNameTouched) {
                  // suggested name updates via effect
                }
              }}
              className="h-9 rounded-md border bg-background px-3 text-xs"
            >
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.pathSegments.join("\\") || folder.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-md border bg-muted/20">
            <button
              type="button"
              onClick={() => setAdvancedOpen((value) => !value)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium hover:bg-muted/40"
            >
              <span>{mode === "file" ? "Advanced metadata" : "Action / clip metadata"}</span>
              <ChevronDown className={advancedOpen ? "h-4 w-4 rotate-180 transition-transform" : "h-4 w-4 transition-transform"} />
            </button>
            {advancedOpen ? (
              <div className="grid gap-3 border-t p-3">
                {mode === "file" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">unk1 (likely ID)</Label>
                      <Input
                        value={unk1}
                        onChange={(event) => setUnk1(event.target.value)}
                        className="font-mono text-xs"
                        placeholder="00000000"
                        title="Action / motion id for a single-file item (8-digit hex LE)"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">unk2</Label>
                      <Input
                        value={unk2}
                        onChange={(event) => setUnk2(event.target.value)}
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Folder unk1 (action ID)</Label>
                        <Input
                          value={actionId}
                          onChange={(event) => setActionId(event.target.value)}
                          className="font-mono text-xs"
                          placeholder="00000000"
                          title="Action / motion id on the bundle folder (8-digit hex LE)"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Folder unk3 (group kind)</Label>
                        <Input
                          value={unk3}
                          onChange={(event) => setUnk3(event.target.value)}
                          className="font-mono text-xs"
                          placeholder="2"
                          title="Common value is 2 for multi-clip action folders"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Child clips always use item unk1 = 00000000. Set each item unk2 to the model / channel id.
                    </p>
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs">Clips ({clips.length})</Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!sourceDir.trim() || scanning}
                          onClick={() => void scanSourceDir(sourceDir)}
                        >
                          Rescan
                        </Button>
                      </div>
                      {clips.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">Select a source folder with .nuanmb files.</p>
                      ) : (
                        <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border bg-background p-2">
                          {clips.map((clip, index) => (
                            <div
                              key={`${clip.sourcePath}-${index}`}
                              className="grid gap-2 rounded-md border border-border/60 p-2 sm:grid-cols-[1fr_8.5rem]"
                            >
                              <div className="grid gap-1">
                                <Label className="text-[10px] text-muted-foreground">Clip name</Label>
                                <Input
                                  value={clip.name}
                                  onChange={(event) => updateClip(index, { name: event.target.value })}
                                  className="font-mono text-xs"
                                />
                                <p className="truncate font-mono text-[10px] text-muted-foreground" title={clip.sourcePath}>
                                  {clip.sourcePath}
                                </p>
                              </div>
                              <div className="grid gap-1">
                                <Label className="text-[10px] text-muted-foreground">unk2 (model ID)</Label>
                                <Input
                                  value={clip.modelId}
                                  onChange={(event) => updateClip(index, { modelId: event.target.value })}
                                  className="font-mono text-xs"
                                  placeholder="00000000"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={() => void handleAdd()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {mode === "file" ? "Add motion" : "Add folder bundle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
