import { useState, useEffect, useCallback, useMemo } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { dirname, join, resourceDir } from "@tauri-apps/api/path";
import {
  ExternalLink,
  FileCode,
  FileText,
  FolderOpen,
  Hammer,
  Loader2,
  Package,
  Play,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Command } from "@tauri-apps/plugin-shell";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { exists, readDir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import {
  folderContainsMscScriptFiles,
  getMscConvertLogPath,
  getMscConvertOutputPath,
  getMscRepackOutputPath,
} from "../../utils/mscWorkspaceUtils";
import { renameScript2CallbacksByActionMask } from "../../utils/mscActionRename";
import {
  compareByLeadingIndex,
  computeMscSlotStatuses,
  getMscFileRole,
  groupMscFiles,
  isMscPackScriptCFile,
  type MscFileInfo,
} from "./mscPipeline";
import { MscPipelineBar } from "./MscPipelineBar";
import { MscFileRow, type MscFileActionDescriptor } from "./MscFileRow";

interface MscWorkspaceViewProps {
  workspaceRoot: string;
  mscFolderPath: string | null;
  onMscFolderChange?: (path: string | null) => void;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  workspaceDefaultPath?: string;
}

type BatchKind = "decompile" | "repack";

interface BatchState {
  kind: BatchKind;
  total: number;
  done: number;
}

type ConfirmState =
  | { mode: "convert-one"; file: MscFileInfo; outputPath: string; logPath: string; overwrite: string[] }
  | { mode: "decompile-all"; targets: MscFileInfo[]; overwrite: string[] }
  | { mode: "repack-all"; targets: MscFileInfo[]; overwrite: string[] };

const FILE_TYPES = [
  { value: "all", label: "All Files" },
  { value: "c", label: ".c" },
  { value: "txt", label: ".txt" },
  { value: "bscex", label: ".bscex" },
  { value: "cscex", label: ".cscex" },
  { value: "dscex", label: ".dscex" },
] as const;

const EXVS_MAPPING_FILE_ID_PATTERN = /^0x[0-9a-fA-F]{8}$/;

function getMscScriptFileIdFromFolderPath(folderPath: string | null): string | null {
  if (!folderPath) return null;
  const normalizedPath = folderPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const folderName = normalizedPath.split("/").pop();
  if (!folderName || !EXVS_MAPPING_FILE_ID_PATTERN.test(folderName)) return null;
  return `0x${folderName.slice(2).toUpperCase()}`;
}

function buildOptionalExvsMappingArgs(mappingPath: string | null): string[] {
  // --exvsMapping is still an experimental native-truth symbol/relocation layer.
  // Most MSC repacks can compile without it, so a missing per-script mapping must not block repack.
  return mappingPath ? ["--exvsMapping", mappingPath] : [];
}

function matchesFileType(fileName: string, type: string): boolean {
  const lower = fileName.toLowerCase();
  if (type === "all") return true;
  return lower.endsWith(`.${type}`);
}

function getFileIcon(fileName: string) {
  switch (getMscFileRole(fileName)) {
    case "c":
      return <FileCode className="size-4 text-foreground" />;
    case "log":
      return <FileText className="size-4 text-muted-foreground" />;
    case "script":
      return <Package className="size-4 text-foreground" />;
    default:
      return <FileText className="size-4 text-muted-foreground" />;
  }
}

export default function MscWorkspaceView({
  workspaceRoot,
  mscFolderPath,
  onMscFolderChange,
  isActive,
  workspaceDefaultPath,
}: MscWorkspaceViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [fileType, setFileType] = useState<string>("all");
  const [allFiles, setAllFiles] = useState<MscFileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [processingFile, setProcessingFile] = useState<string | null>(null);
  const [isFolderRepacking, setIsFolderRepacking] = useState(false);
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const [batch, setBatch] = useState<BatchState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const isBusy = processingFile !== null || batch !== null || isFolderRepacking;

  const resolveTauriExeDir = useCallback(async () => {
    const resourcePath = await resourceDir();
    const normalized = resourcePath.replace(/\\/g, "/").replace(/\/+$/, "");
    if (normalized.toLowerCase().endsWith("/resources")) {
      return await dirname(resourcePath);
    }
    return resourcePath;
  }, []);

  const resolveOptionalExvsMappingPath = useCallback(async () => {
    const scriptFileId = getMscScriptFileIdFromFolderPath(mscFolderPath);
    if (!scriptFileId) return null;

    const resourcePath = await resourceDir();
    const exeDir = await resolveTauriExeDir();
    const mappingFileName = `exvs_${scriptFileId}.native_truth.json`;
    const candidatePaths = [
      await join(resourcePath, "tools", "mappings", mappingFileName),
      await join(exeDir, "tools", "mappings", mappingFileName),
      await join(resourcePath, "tools", mappingFileName),
      await join(exeDir, "tools", mappingFileName),
    ];

    for (const mappingPath of Array.from(new Set(candidatePaths))) {
      if (await exists(mappingPath)) return mappingPath;
    }

    return null;
  }, [mscFolderPath, resolveTauriExeDir]);

  const fetchFiles = useCallback(async () => {
    if (!mscFolderPath) return;
    try {
      setIsLoading(true);
      const entries = await readDir(mscFolderPath);
      const files: MscFileInfo[] = [];
      for (const entry of entries) {
        if (!entry.isFile || !entry.name) continue;
        files.push({ name: entry.name, path: await join(mscFolderPath, entry.name) });
      }
      files.sort(compareByLeadingIndex);
      setAllFiles(files);
    } catch (error) {
      console.error("Error reading directory:", error);
      toast.error("Failed to read MSC folder");
    } finally {
      setIsLoading(false);
    }
  }, [mscFolderPath]);

  useEffect(() => {
    if (isActive && mscFolderPath) {
      void fetchFiles();
    }
  }, [isActive, mscFolderPath, fetchFiles]);

  const filteredFiles = useMemo(
    () =>
      allFiles.filter(
        (file) =>
          file.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
          matchesFileType(file.name, fileType),
      ),
    [allFiles, searchQuery, fileType],
  );

  const groups = useMemo(() => groupMscFiles(filteredFiles), [filteredFiles]);
  const slots = useMemo(() => computeMscSlotStatuses(allFiles.map((f) => f.name)), [allFiles]);

  const scriptTargets = useMemo(
    () => allFiles.filter((f) => getMscFileRole(f.name) === "script").sort(compareByLeadingIndex),
    [allFiles],
  );
  const repackTargets = useMemo(
    () => allFiles.filter((f) => isMscPackScriptCFile(f.name)).sort(compareByLeadingIndex),
    [allFiles],
  );

  const handlePickFolder = async () => {
    try {
      setIsPickingFolder(true);
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: workspaceDefaultPath,
      });
      if (!selected || Array.isArray(selected)) return;
      const ok = await folderContainsMscScriptFiles(selected);
      if (!ok) {
        toast.error("Selected folder must contain at least one .bscex, .cscex, or .dscex file");
        return;
      }
      onMscFolderChange?.(selected);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setIsPickingFolder(false);
    }
  };

  const handleRepackFolder = async () => {
    if (!mscFolderPath) return;
    try {
      setIsFolderRepacking(true);
      const normalized = mscFolderPath.replace(/\//g, "\\");
      const folderName = normalized.split("\\").filter(Boolean).pop() ?? "";
      const parentDir = normalized.split("\\").slice(0, -1).join("\\");
      const structurePath = `${parentDir}\\${folderName}_structure.json`;
      const outputPath = `${parentDir}\\${folderName}.fhm2d`;
      await invoke("repack_fhm2d", { structureJsonPath: structurePath, outputPath, atomicWrite: true });
      toast.success("Repack Folder completed successfully");
    } catch (error) {
      console.error("Error during repack folder:", error);
      toast.error(`Repack Folder failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsFolderRepacking(false);
    }
  };

  /** Decompile one script; 2.dscex also gets action-rename + func_0 -> main post pass. Throws on tool failure. */
  const convertScriptCore = useCallback(
    async (file: MscFileInfo): Promise<string> => {
      const inputPath = file.path;
      const outputPath = getMscConvertOutputPath(inputPath);
      const logPath = getMscConvertLogPath(inputPath);
      const resourcePath = await resourceDir();
      const exvsMappingPath = await resolveOptionalExvsMappingPath();

      const command = await Command.create("exec-python", [
        resourcePath + "/tools/mscdec.py",
        inputPath,
        "-o",
        outputPath,
        "-log",
        logPath,
        ...buildOptionalExvsMappingArgs(exvsMappingPath),
      ]).execute();

      if (command.code !== 0) {
        throw new Error(command.stderr || `mscdec failed for ${file.name}`);
      }

      const cContent = await readTextFile(outputPath);
      const baseName = file.name.split(".")[0].toLowerCase();

      if (baseName === "2") {
        const scriptFolder = await dirname(file.path);
        const script0Path = await join(scriptFolder, "0.c");
        if (await exists(script0Path)) {
          try {
            const script0Content = await readTextFile(script0Path);
            const result = renameScript2CallbacksByActionMask(script0Content, cContent);
            const normalized = result.updatedScript2.replace(/func_0/g, "main");
            await writeTextFile(outputPath, normalized);
            return `${file.name}: ${result.renamedCallbackCount} callbacks renamed, func_0 to main`;
          } catch (renameError) {
            const normalized = cContent.replace(/func_0/g, "main");
            await writeTextFile(outputPath, normalized);
            const reason = renameError instanceof Error ? renameError.message : String(renameError);
            return `${file.name}: func_0 to main (action rename skipped: ${reason})`;
          }
        }
        const normalized = cContent.replace(/func_0/g, "main");
        await writeTextFile(outputPath, normalized);
        return `${file.name}: func_0 to main (0.c missing, action rename skipped)`;
      }

      return `${file.name} converted to C`;
    },
    [resolveOptionalExvsMappingPath],
  );

  /** Recompile one C file back to its source pack extension. Throws on tool failure. */
  const repackScriptCore = useCallback(
    async (file: MscFileInfo): Promise<string> => {
      const inputPath = file.path;
      const outputPath = getMscRepackOutputPath(inputPath);
      const resourcePath = await resourceDir();
      const exvsMappingPath = await resolveOptionalExvsMappingPath();

      const command = await Command.create(
        "exec-python",
        [
          resourcePath + "/tools/msclang.py",
          inputPath,
          "-o",
          outputPath,
          "-i",
          ...buildOptionalExvsMappingArgs(exvsMappingPath),
        ],
        { encoding: "utf-8" },
      ).execute();

      if (command.code !== 0) {
        throw new Error(command.stderr || `msclang failed for ${file.name}`);
      }
      return `${file.name} to ${outputPath.replace(/^.*[\\/]/, "")}`;
    },
    [resolveOptionalExvsMappingPath],
  );

  const handleConvertOne = useCallback(
    async (file: MscFileInfo) => {
      try {
        setProcessingFile(file.name);
        toast.success(`Converted ${await convertScriptCore(file)}`);
        await fetchFiles();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Error converting ${file.name}`);
      } finally {
        setProcessingFile(null);
      }
    },
    [convertScriptCore, fetchFiles],
  );

  const handleRepackOne = useCallback(
    async (file: MscFileInfo) => {
      try {
        setProcessingFile(file.name);
        toast.success(`Repacked ${await repackScriptCore(file)}`);
        await fetchFiles();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Error repacking ${file.name}`);
      } finally {
        setProcessingFile(null);
      }
    },
    [repackScriptCore, fetchFiles],
  );

  const handleRenameActions = useCallback(
    async (file: MscFileInfo) => {
      try {
        setProcessingFile(file.name);
        const scriptFolder = await dirname(file.path);
        const script0Path = await join(scriptFolder, "0.c");
        if (!(await exists(script0Path))) {
          toast.error("MSC workspace: 0.c not found, cannot rename actions");
          return;
        }
        const script0Content = await readTextFile(script0Path);
        const script2Content = await readTextFile(file.path);
        const result = renameScript2CallbacksByActionMask(script0Content, script2Content);
        const normalized = result.updatedScript2.replace(/func_0/g, "main");
        await writeTextFile(file.path, normalized);
        toast.success(
          `Renamed ${result.renamedCallbackCount} callbacks, updated ${result.bindingCommentCount} bindings, func_0 to main in ${file.name}`,
        );
        await fetchFiles();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Error renaming actions in ${file.name}`);
      } finally {
        setProcessingFile(null);
      }
    },
    [fetchFiles],
  );

  const handleOpenInEditor = useCallback(async (file: MscFileInfo) => {
    try {
      setProcessingFile(file.name);
      const command = await Command.create("exec-cmd", ["/C", "cursor", file.path]).execute();
      if (command.code !== 0) {
        toast.error(`Failed to open ${file.name} in editor: ${command.stderr}`);
      }
    } catch {
      toast.error(`Error opening ${file.name} in editor`);
    } finally {
      setProcessingFile(null);
    }
  }, []);

  const runBatch = useCallback(
    async (kind: BatchKind, targets: MscFileInfo[]) => {
      if (targets.length === 0) return;
      setBatch({ kind, total: targets.length, done: 0 });
      let failures = 0;
      for (const file of targets) {
        try {
          await (kind === "decompile" ? convertScriptCore(file) : repackScriptCore(file));
        } catch (error) {
          failures += 1;
          toast.error(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
        setBatch((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
      }
      setBatch(null);
      await fetchFiles();
      const verb = kind === "decompile" ? "Decompiled" : "Repacked";
      if (failures === 0) {
        toast.success(`${verb} ${targets.length} file(s)`);
      } else {
        toast.warning(`${verb} ${targets.length - failures}/${targets.length} file(s), ${failures} failed`);
      }
    },
    [convertScriptCore, repackScriptCore, fetchFiles],
  );

  const collectExisting = useCallback(async (paths: string[]): Promise<string[]> => {
    const present: string[] = [];
    for (const path of paths) {
      if (await exists(path)) present.push(path);
    }
    return present;
  }, []);

  const openConvertOne = useCallback(
    async (file: MscFileInfo) => {
      try {
        const outputPath = getMscConvertOutputPath(file.path);
        const logPath = getMscConvertLogPath(file.path);
        const overwrite = await collectExisting([outputPath, logPath]);
        setConfirm({ mode: "convert-one", file, outputPath, logPath, overwrite });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Failed to prepare convert for ${file.name}`);
      }
    },
    [collectExisting],
  );

  const openDecompileAll = useCallback(async () => {
    const outputs = scriptTargets.flatMap((f) => [getMscConvertOutputPath(f.path), getMscConvertLogPath(f.path)]);
    const overwrite = await collectExisting(outputs);
    setConfirm({ mode: "decompile-all", targets: scriptTargets, overwrite });
  }, [scriptTargets, collectExisting]);

  const openRepackAll = useCallback(async () => {
    const overwrite = await collectExisting(repackTargets.map((f) => getMscRepackOutputPath(f.path)));
    setConfirm({ mode: "repack-all", targets: repackTargets, overwrite });
  }, [repackTargets, collectExisting]);

  const handleConfirm = useCallback(async () => {
    if (!confirm) return;
    const current = confirm;
    setConfirm(null);
    if (current.mode === "convert-one") {
      await handleConvertOne(current.file);
    } else if (current.mode === "decompile-all") {
      await runBatch("decompile", current.targets);
    } else {
      await runBatch("repack", current.targets);
    }
  }, [confirm, handleConvertOne, runBatch]);

  const createFileActions = useCallback(
    (file: MscFileInfo): MscFileActionDescriptor[] => {
      const role = getMscFileRole(file.name);
      const working = processingFile === file.name;
      const disabled = isBusy;

      if (role === "script") {
        return [
          {
            key: "convert",
            label: working ? "Converting…" : "Convert",
            onClick: () => openConvertOne(file),
            variant: "default",
            disabled,
            icon: working ? <Loader2 className="animate-spin" /> : <Play />,
          },
        ];
      }

      if (role === "c") {
        const actions: MscFileActionDescriptor[] = [
          {
            key: "open",
            label: "Open",
            onClick: () => handleOpenInEditor(file),
            variant: "ghost",
            disabled,
            icon: <ExternalLink />,
          },
        ];
        if (isMscPackScriptCFile(file.name)) {
          if (file.name.toLowerCase() === "2.c") {
            actions.push({
              key: "rename",
              label: working ? "Renaming…" : "Rename Actions",
              onClick: () => handleRenameActions(file),
              variant: "secondary",
              disabled,
              icon: <Wand2 />,
            });
          }
          actions.push({
            key: "repack",
            label: working ? "Repacking…" : "Repack",
            onClick: () => handleRepackOne(file),
            variant: "default",
            disabled,
            icon: working ? <Loader2 className="animate-spin" /> : <Hammer />,
          });
        }
        return actions;
      }

      if (role === "log") {
        return [
          {
            key: "open",
            label: "Open",
            onClick: () => handleOpenInEditor(file),
            variant: "ghost",
            disabled,
            icon: <ExternalLink />,
          },
        ];
      }

      return [];
    },
    [processingFile, isBusy, openConvertOne, handleOpenInEditor, handleRenameActions, handleRepackOne],
  );

  if (!mscFolderPath) {
    return (
      <div className="flex h-full min-h-48 flex-col items-center justify-center gap-4 px-4 text-center text-muted-foreground">
        <FolderOpen className="size-10 opacity-50" />
        <div className="max-w-md space-y-2 text-sm">
          <p className="font-medium text-foreground">MSC Workspace</p>
          <p>
            Select a folder containing at least one{" "}
            <code className="rounded bg-muted px-1 font-mono">.bscex</code>,{" "}
            <code className="rounded bg-muted px-1 font-mono">.cscex</code>, or{" "}
            <code className="rounded bg-muted px-1 font-mono">.dscex</code> file.
          </p>
          {workspaceRoot ? (
            <p className="font-mono text-[11px] text-muted-foreground">Workspace root: {workspaceRoot}</p>
          ) : null}
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => void handlePickFolder()} disabled={isPickingFolder}>
          {isPickingFolder ? <Loader2 className="mr-2 animate-spin" /> : <FolderOpen className="mr-2" />}
          {isPickingFolder ? "Picking…" : "Pick folder"}
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col gap-4 pb-4">
        <div className="flex shrink-0 flex-col gap-3 border-b pb-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">MSC Workspace</h2>
              <p className="break-all font-mono text-[11px] text-muted-foreground" title={mscFolderPath}>
                {mscFolderPath}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void handlePickFolder()} disabled={isPickingFolder || isBusy}>
                {isPickingFolder ? <Loader2 className="mr-2 animate-spin" /> : <FolderOpen className="mr-2" />}
                Pick folder
              </Button>
              <Button type="button" size="sm" onClick={() => void openDecompileAll()} disabled={isBusy || scriptTargets.length === 0}>
                <Play className="mr-2" />
                Decompile All
              </Button>
              <Button type="button" size="sm" onClick={() => void openRepackAll()} disabled={isBusy || repackTargets.length === 0}>
                <Hammer className="mr-2" />
                Repack All
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => void handleRepackFolder()} disabled={isBusy}>
                {isFolderRepacking ? <Loader2 className="mr-2 animate-spin" /> : <Package className="mr-2" />}
                Repack .fhm2d
              </Button>
            </div>
          </div>

          <MscPipelineBar slots={slots} />

          {batch ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {batch.kind === "decompile" ? "Decompiling" : "Repacking"} {batch.done}/{batch.total}
                </span>
                <span className="font-mono tabular-nums">{Math.round((batch.done / batch.total) * 100)}%</span>
              </div>
              <Progress value={(batch.done / batch.total) * 100} />
            </div>
          ) : null}

          <div className="flex gap-2">
            <Input
              placeholder="Search files in this folder…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <Select value={fileType} onValueChange={setFileType}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="File type" />
              </SelectTrigger>
              <SelectContent>
                {FILE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto pr-2">
          {isLoading && allFiles.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-11 w-full rounded-md" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center text-muted-foreground">
              <FolderOpen className="mb-2 size-8 opacity-50" />
              No files match the current filter
            </div>
          ) : (
            groups.map((group) => (
              <section key={group.role} className="space-y-1.5">
                <div className="flex items-center gap-2 px-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h3>
                  <span className="font-mono text-[11px] text-muted-foreground/70">{group.files.length}</span>
                </div>
                <div className="divide-y rounded-md border">
                  {group.files.map((file) => (
                    <MscFileRow
                      key={file.path}
                      name={file.name}
                      icon={getFileIcon(file.name)}
                      actions={createFileActions(file)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(next) => !next && !isBusy && setConfirm(null)}>
        <AlertDialogContent className="max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.mode === "convert-one"
                ? "Convert to C"
                : confirm?.mode === "decompile-all"
                  ? "Decompile all scripts"
                  : "Repack all C files"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                {confirm?.mode === "convert-one" ? (
                  <>
                    <p>
                      Convert{" "}
                      <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">{confirm.file.name}</code>{" "}
                      to C source now?
                    </p>
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">Output targets</p>
                      <p>
                        <code className="rounded bg-muted px-1 py-0.5 font-mono">{confirm.outputPath}</code>
                      </p>
                      <p>
                        <code className="rounded bg-muted px-1 py-0.5 font-mono">{confirm.logPath}</code>
                      </p>
                    </div>
                  </>
                ) : confirm ? (
                  <p>
                    {confirm.mode === "decompile-all" ? "Decompile" : "Repack"}{" "}
                    <span className="font-medium text-foreground">{confirm.targets.length}</span> file(s):{" "}
                    <span className="font-mono text-foreground">
                      {confirm.targets.map((t) => t.name).join(", ")}
                    </span>
                    .
                  </p>
                ) : null}

                {confirm && confirm.overwrite.length > 0 ? (
                  <div className="space-y-1">
                    <p className="font-medium text-amber-600 dark:text-amber-500">
                      Existing files that will be overwritten
                    </p>
                    {confirm.overwrite.map((path) => (
                      <p key={path}>
                        <code className="rounded bg-muted px-1 py-0.5 font-mono">{path}</code>
                      </p>
                    ))}
                  </div>
                ) : (
                  <p>No existing output files will be overwritten.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBusy}>Cancel</AlertDialogCancel>
            <Button type="button" onClick={() => void handleConfirm()} disabled={isBusy}>
              {confirm && confirm.overwrite.length > 0 ? "Overwrite and continue" : "Continue"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
