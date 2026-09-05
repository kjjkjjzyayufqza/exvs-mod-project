import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { exists } from "@tauri-apps/plugin-fs";
import { ArrowDown, ArrowUp, ChevronDown, FolderOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  isValidMotionHexId,
  listNuanmbFilesInDirectory,
  moveArrayItem,
  normalizeMotionUnk1Input,
  normalizeMotionUnk2Input,
  previewAddMotionFileTarget,
  previewAddMotionFolderTargets,
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
  /** Structure LE 8-digit hex (int32 storage bytes). */
  unk1: string;
  /** Structure LE 8-digit hex. */
  unk2: string;
  parentFolderId: string;
  /** Overwrite existing target .nuanmb and same-name structure item when true. */
  replaceExisting: boolean;
};

export type AddMotionFolderParams = {
  mode: "folder";
  sourceDir: string;
  folderName: string;
  /** Folder unk1 — structure LE action id. */
  actionId: string;
  unk3: number;
  parentFolderId: string;
  clips: MotionBundleClipInput[];
  /** Overwrite existing disk files and same-name structure folder when true. */
  replaceExisting: boolean;
};

export type AddMotionParams = AddMotionFileParams | AddMotionFolderParams;

type ClipDraft = {
  sourcePath: string;
  name: string;
  modelId: string;
};

type TargetPreviewRow = {
  path: string;
  kind: "file" | "folder";
  exists: boolean;
  label: string;
};

type MotionFolderAddDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy?: boolean;
  folders: MotionFolderNode[];
  defaultParentFolderId: string;
  motionRoot: string;
  rootName: string;
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
    // New homemade clips: model/channel id must be set in the UI (do not invent 00000000).
    modelId: "",
  }));
}

function isFilledHexId(raw: string): boolean {
  return isValidMotionHexId(raw);
}

/** Parse UI hex as structure LE storage (never BE / MSC-swapped). */
function parseLeHex(raw: string, fieldName: string): string {
  try {
    if (fieldName.toLowerCase().includes("unk2") || fieldName.toLowerCase().includes("model")) {
      return normalizeMotionUnk2Input(raw);
    }
    return normalizeMotionUnk1Input(raw);
  } catch {
    throw new Error(`${fieldName} must be an 8-digit LE hex id (optional 0x prefix)`);
  }
}

export function MotionFolderAddDialog({
  open: dialogOpen,
  onOpenChange,
  busy = false,
  folders,
  defaultParentFolderId,
  motionRoot,
  rootName,
  onAdd,
}: MotionFolderAddDialogProps) {
  const { t } = useTranslation("test-motion-add");
  const [mode, setMode] = useState<AddMotionMode>("file");
  const [sourcePath, setSourcePath] = useState("");
  const [sourceDir, setSourceDir] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderNameTouched, setFolderNameTouched] = useState(false);
  const [unk1, setUnk1] = useState("");
  const [unk2, setUnk2] = useState("00000000");
  const [actionId, setActionId] = useState("");
  const [unk3, setUnk3] = useState("2");
  const [parentFolderId, setParentFolderId] = useState(defaultParentFolderId);
  const [clips, setClips] = useState<ClipDraft[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [targetPreview, setTargetPreview] = useState<TargetPreviewRow[]>([]);
  const [structureConflict, setStructureConflict] = useState<string | null>(null);
  const [targetCheckError, setTargetCheckError] = useState<string | null>(null);
  const [checkingTargets, setCheckingTargets] = useState(false);

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
    setUnk1("");
    setUnk2("00000000");
    setActionId("");
    setUnk3("2");
    setParentFolderId(defaultParentFolderId);
    setClips([]);
    setScanError(null);
    setScanning(false);
    setAdvancedOpen(true);
    setReplaceExisting(false);
    setTargetPreview([]);
    setStructureConflict(null);
    setTargetCheckError(null);
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
        setScanError(t("errors.noClips"));
        return;
      }
      setClips(defaultClipsFromPaths(paths));
    } catch (error) {
      setClips([]);
      setScanError(error instanceof Error ? error.message : String(error));
    } finally {
      setScanning(false);
    }
  }, [t]);

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

  const moveClip = useCallback((index: number, direction: "up" | "down") => {
    setClips((prev) => moveArrayItem(prev, index, direction));
  }, []);

  // Preview output paths and whether they already exist on disk / in structure.
  useEffect(() => {
    if (!dialogOpen || !parentFolder || !motionRoot.trim() || !rootName.trim()) {
      setTargetPreview([]);
      setStructureConflict(null);
      setTargetCheckError(null);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setCheckingTargets(true);
      setTargetCheckError(null);
      try {
        const rows: TargetPreviewRow[] = [];
        let structureNote: string | null = null;

        if (mode === "file") {
          if (!name.trim()) {
            if (!cancelled) {
              setTargetPreview([]);
              setStructureConflict(null);
            }
            return;
          }
          const targetPath = previewAddMotionFileTarget({
            motionRoot,
            rootName,
            parentFolder,
            name,
          });
          const fileExists = await exists(targetPath);
          const structureHit = parentFolder.children.some(
            (child) => child.kind === "item" && child.name === name.trim().replace(/\.nuanmb$/i, ""),
          );
          if (structureHit) {
            structureNote = t("warnings.itemExists", { name: name.trim() });
          }
          rows.push({
            path: targetPath,
            kind: "file",
            exists: fileExists,
            label: fileExists ? t("status.exists") : t("status.new"),
          });
        } else {
          if (!folderName.trim() || clips.length === 0) {
            if (!cancelled) {
              setTargetPreview([]);
              setStructureConflict(null);
            }
            return;
          }
          const preview = previewAddMotionFolderTargets({
            motionRoot,
            rootName,
            parentFolder,
            folderName,
            clipNames: clips.map((clip) => clip.name),
          });
          if (preview.existingStructureFolder) {
            structureNote = t("warnings.folderExists", { name: folderName.trim() });
          }
          const folderExists = await exists(preview.folderPath);
          rows.push({
            path: preview.folderPath,
            kind: "folder",
            exists: folderExists,
            label: folderExists ? t("status.exists") : t("status.new"),
          });
          for (const filePath of preview.filePaths) {
            const fileExists = await exists(filePath);
            rows.push({
              path: filePath,
              kind: "file",
              exists: fileExists,
              label: fileExists ? t("status.exists") : t("status.new"),
            });
          }
        }

        if (!cancelled) {
          setTargetPreview(rows);
          setStructureConflict(structureNote);
          // Clear stale replace when conflicts disappear.
          if (
            !structureNote &&
            rows.every((row) => !row.exists)
          ) {
            setReplaceExisting(false);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setTargetPreview([]);
          setStructureConflict(null);
          setTargetCheckError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) setCheckingTargets(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    clips,
    dialogOpen,
    folderName,
    mode,
    motionRoot,
    name,
    parentFolder,
    rootName,
    t,
  ]);

  const hasExistingTargets = useMemo(
    () => Boolean(structureConflict) || targetPreview.some((row) => row.exists),
    [structureConflict, targetPreview],
  );

  const canSubmit = useMemo(() => {
    if (busy || !parentFolderId || checkingTargets) return false;
    if (hasExistingTargets && !replaceExisting) return false;
    if (mode === "file") {
      return Boolean(sourcePath.trim() && name.trim() && isFilledHexId(unk1) && isFilledHexId(unk2));
    }
    if (!sourceDir.trim() || !folderName.trim() || clips.length === 0 || scanning || scanError) {
      return false;
    }
    if (!isFilledHexId(actionId)) return false;
    const parsedUnk3 = Number.parseInt(unk3.trim(), 10);
    if (!Number.isInteger(parsedUnk3) || parsedUnk3 < 0) return false;
    return clips.every((clip) => clip.name.trim().length > 0 && isFilledHexId(clip.modelId));
  }, [
    actionId,
    busy,
    checkingTargets,
    clips,
    folderName,
    hasExistingTargets,
    mode,
    name,
    parentFolderId,
    replaceExisting,
    scanError,
    scanning,
    sourceDir,
    sourcePath,
    unk1,
    unk2,
    unk3,
  ]);

  const handleAdd = useCallback(async () => {
    if (mode === "file") {
      await onAdd({
        mode: "file",
        sourcePath,
        name,
        unk1: parseLeHex(unk1, "unk1"),
        unk2: parseLeHex(unk2, "unk2"),
        parentFolderId,
        replaceExisting,
      });
    } else {
      const parsedUnk3 = Number.parseInt(unk3.trim(), 10);
      await onAdd({
        mode: "folder",
        sourceDir,
        folderName,
        actionId: parseLeHex(actionId, "action id"),
        unk3: Number.isFinite(parsedUnk3) ? parsedUnk3 : 2,
        parentFolderId,
        clips: clips.map((clip) => ({
          sourcePath: clip.sourcePath,
          name: clip.name,
          modelId: parseLeHex(clip.modelId, `model id for ${clip.name}`),
        })),
        replaceExisting,
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
    replaceExisting,
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
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {mode === "file"
              ? t("help.fileDescription")
              : t("help.folderDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">{t("fields.addMode")}</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={mode === "file" ? "default" : "outline"}
                onClick={() => setMode("file")}
              >
                {t("actions.single")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "folder" ? "default" : "outline"}
                onClick={() => setMode("folder")}
              >
                {t("actions.folder")}
              </Button>
            </div>
          </div>

          {mode === "file" ? (
            <div className="grid gap-1.5">
              <Label className="text-xs">{t("fields.sourceFile")}</Label>
              <div className="flex gap-2">
                <FilePathInput
                  value={sourcePath}
                  onChange={(event) => setSourceAndMaybeName(event.target.value)}
                  className="font-mono text-xs"
                />
                <Button type="button" variant="outline" onClick={() => void pickSourceFile()}>
                  <FolderOpen className="h-4 w-4" />
                  {t("actions.browse")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label className="text-xs">{t("fields.sourceFolder")}</Label>
              <div className="flex gap-2">
                <FilePathInput
                  value={sourceDir}
                  onChange={(event) => void scanSourceDir(event.target.value)}
                  className="font-mono text-xs"
                />
                <Button type="button" variant="outline" onClick={() => void pickSourceDir()}>
                  <FolderOpen className="h-4 w-4" />
                  {t("actions.browse")}
                </Button>
              </div>
              {scanning ? <p className="text-[11px] text-muted-foreground">{t("status.scanning")}</p> : null}
              {scanError ? <p className="text-[11px] text-destructive">{scanError}</p> : null}
              {!scanning && !scanError && clips.length > 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  {t("help.foundClips", { count: clips.length })}
                </p>
              ) : null}
            </div>
          )}

          {mode === "file" ? (
            <div className="grid gap-1.5">
              <Label className="text-xs">{t("fields.name")}</Label>
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
              <Label className="text-xs">{t("fields.bundleName")}</Label>
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
                {t("help.suggestedName", { name: suggestedFolderName })}
              </p>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label className="text-xs">{t("fields.parentFolder")}</Label>
            <select
              value={parentFolderId}
              onChange={(event) => setParentFolderId(event.target.value)}
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
              <span>{mode === "file" ? t("sections.actionMetadata") : t("sections.clipMetadata")}</span>
              <ChevronDown
                className={advancedOpen ? "h-4 w-4 rotate-180 transition-transform" : "h-4 w-4 transition-transform"}
              />
            </button>
            {advancedOpen ? (
              <div className="grid gap-3 border-t p-3">
                <p className="text-[11px] text-muted-foreground">
                  {t("help.hexIds", { example: "a621fd5e" })}
                </p>
                {mode === "file" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">{t("fields.actionId")}</Label>
                      <Input
                        value={unk1}
                        onChange={(event) => setUnk1(event.target.value)}
                        className="font-mono text-xs"
                        placeholder={t("placeholders.actionId")}
                      />
                      {unk1.trim() && !isFilledHexId(unk1) ? (
                        <p className="text-[11px] text-destructive">{t("errors.hex")}</p>
                      ) : null}
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">{t("fields.unk2")}</Label>
                      <Input
                        value={unk2}
                        onChange={(event) => setUnk2(event.target.value)}
                        className="font-mono text-xs"
                        placeholder={t("placeholders.unk2")}
                      />
                      {unk2.trim() && !isFilledHexId(unk2) ? (
                        <p className="text-[11px] text-destructive">{t("errors.hex")}</p>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid gap-1.5">
                        <Label className="text-xs">{t("fields.folderActionId")}</Label>
                        <Input
                          value={actionId}
                          onChange={(event) => setActionId(event.target.value)}
                          className="font-mono text-xs"
                          placeholder={t("placeholders.actionId")}
                        />
                        {actionId.trim() && !isFilledHexId(actionId) ? (
                          <p className="text-[11px] text-destructive">{t("errors.hex")}</p>
                        ) : null}
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">{t("fields.groupKind")}</Label>
                        <Input
                          value={unk3}
                          onChange={(event) => setUnk3(event.target.value)}
                          className="font-mono text-xs"
                          placeholder={t("placeholders.groupKind")}
                        />
                      </div>
                    </div>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {t("help.clipOrder")}
                    </p>
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs">{t("fields.clips", { count: clips.length })}</Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!sourceDir.trim() || scanning}
                          onClick={() => void scanSourceDir(sourceDir)}
                        >
                          {t("actions.rescan")}
                        </Button>
                      </div>
                      {clips.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">{t("help.selectSource")}</p>
                      ) : (
                        <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border bg-background p-2">
                          {clips.map((clip, index) => (
                            <div
                              key={`${clip.sourcePath}-${index}`}
                              className="grid gap-2 rounded-md border border-border/60 p-2 sm:grid-cols-[auto_1fr_8.5rem_auto]"
                            >
                              <div className="flex items-start pt-5">
                                <span className="w-6 text-center font-mono text-[10px] tabular-nums text-muted-foreground">
                                  #{index + 1}
                                </span>
                              </div>
                              <div className="grid gap-1">
                                <Label className="text-[10px] text-muted-foreground">{t("fields.clipName")}</Label>
                                <Input
                                  value={clip.name}
                                  onChange={(event) => updateClip(index, { name: event.target.value })}
                                  className="font-mono text-xs"
                                />
                                <p
                                  className="truncate font-mono text-[10px] text-muted-foreground"
                                  title={clip.sourcePath}
                                >
                                  {clip.sourcePath}
                                </p>
                              </div>
                              <div className="grid gap-1">
                                <Label className="text-[10px] text-muted-foreground">{t("fields.modelId")}</Label>
                                <Input
                                  value={clip.modelId}
                                  onChange={(event) => updateClip(index, { modelId: event.target.value })}
                                  className="font-mono text-xs"
                                  placeholder={t("placeholders.hex8")}
                                />
                                {clip.modelId.trim() && !isFilledHexId(clip.modelId) ? (
                                  <p className="text-[10px] text-destructive">{t("errors.hexRequired")}</p>
                                ) : null}
                              </div>
                              <div className="flex items-start gap-0.5 pt-5">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  disabled={index === 0}
                                  onClick={() => moveClip(index, "up")}
                                  title={t("actions.moveUp")}
                                  aria-label={t("actions.moveClipUp", { count: index + 1 })}
                                >
                                  <ArrowUp className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  disabled={index === clips.length - 1}
                                  onClick={() => moveClip(index, "down")}
                                  title={t("actions.moveDown")}
                                  aria-label={t("actions.moveClipDown", { count: index + 1 })}
                                >
                                  <ArrowDown className="h-3.5 w-3.5" />
                                </Button>
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

          <div className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-xs font-medium">{t("sections.outputTargets")}</h4>
              {checkingTargets ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t("status.checking")}
                </span>
              ) : null}
            </div>
            {targetCheckError ? <p className="mb-2 text-[11px] text-destructive">{targetCheckError}</p> : null}
            {structureConflict ? (
              <p className="mb-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-900 dark:text-amber-100">
                {structureConflict}
              </p>
            ) : null}
            {targetPreview.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                {t("help.fillPreview")}
              </p>
            ) : (
              <ul className="max-h-40 space-y-1 overflow-y-auto font-mono text-[10px]">
                {targetPreview.map((row) => (
                  <li
                    key={`${row.kind}:${row.path}`}
                    className={
                      row.exists
                        ? "rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-950 dark:text-amber-50"
                        : "rounded border border-border/50 bg-muted/20 px-2 py-1 text-muted-foreground"
                    }
                  >
                    <span className="mr-2 uppercase tracking-wide">
                      {row.kind === "file" ? t("fields.sourceFile") : t("fields.sourceFolder")}
                    </span>
                    <span className={row.exists ? "font-semibold" : ""}>{row.label}</span>
                    <div className="break-all">{row.path}</div>
                  </li>
                ))}
              </ul>
            )}
            {hasExistingTargets ? (
              <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-[11px]">
                <Checkbox
                  checked={replaceExisting}
                  onCheckedChange={(value) => setReplaceExisting(value === true)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium text-foreground">{t("actions.replaceExisting")}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    {t("help.replaceExisting")}
                  </span>
                </span>
              </label>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("actions.cancel")}
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={() => void handleAdd()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {hasExistingTargets && replaceExisting
              ? mode === "file"
                ? t("actions.replaceMotion")
                : t("actions.replaceFolder")
              : mode === "file"
                ? t("actions.addMotion")
                : t("actions.addFolder")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
