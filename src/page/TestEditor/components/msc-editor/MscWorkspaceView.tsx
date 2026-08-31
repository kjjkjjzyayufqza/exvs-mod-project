import { useState, useEffect, useCallback, useMemo } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { join } from "@tauri-apps/api/path";
import {
  Diff,
  ExternalLink,
  Eye,
  FileCode,
  FileText,
  FolderOpen,
  Hammer,
  Loader2,
  Package,
  Play,
  ShieldCheck,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { exists, readDir, readTextFile } from "@tauri-apps/plugin-fs";
import {
  folderContainsMscScriptFiles,
  getMscConvertLogPath,
  getMscConvertOutputPath,
  getMscRepackOutputPath,
  type MscWorkspaceMode,
} from "../../utils/mscWorkspaceUtils";
import {
  compareByLeadingIndex,
  computeMscSlotStatuses,
  getMscFileRole,
  getMscPackSlotIndexForCFile,
  groupMscFiles,
  isMscRepackableCFile,
  summarizeMscRoundtripReport,
  verifyStateFromReport,
  type MscFileInfo,
  type MscVerifyState,
} from "./mscPipeline";
import { diffTextLines } from "./mscTextDiff";
import {
  getMscAutoRepackFhm2d,
  getMscExternalEditorCommand,
  setMscAutoRepackFhm2d,
  setMscExternalEditorCommand,
} from "./mscEditorSettings";
import { MscPipelineBar } from "./MscPipelineBar";
import { MscFileRow, type MscFileActionDescriptor } from "./MscFileRow";
import { promptAndMigrateFhm2dStructureIfNeeded } from "@/utils/fhm2dStructureMetadata";
import { applyFhm2dStructureMigrationToPack, resolveMigratedFhm2dFolderPath } from "@/utils/fhm2dFolderPathResolution";
import { repackFolderUsingStructureToModFolder } from "@/utils/repackRunner";
import { removeMatchingModVgsht2 } from "../../utils/modVgsht2";
import {
  decompileMscScript,
  openFileInExternalEditor,
  repackMscScript,
  resolveMscActionOverlayForFolder,
  verifyMscRoundtrip,
} from "./mscWorkspaceActions";
import { formatCaughtError } from "@/utils/formatCaughtError";

interface MscWorkspaceViewProps {
  workspaceRoot: string;
  mscFolderPath: string | null;
  onMscFolderChange?: (path: string | null) => void;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  workspaceDefaultPath?: string;
  modFolderPath?: string;
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

type PreviewMode = "content" | "diff";

interface PreviewState {
  file: MscFileInfo;
  content: string;
  mode: PreviewMode;
}

const UNIT_FILE_TYPES = [
  { value: "all", label: "All Files" },
  { value: "c", label: ".c" },
  { value: "resolved", label: "Resolved" },
  { value: "txt", label: ".txt" },
  { value: "bscex", label: ".bscex" },
  { value: "cscex", label: ".cscex" },
  { value: "dscex", label: ".dscex" },
] as const;

const TRADITIONAL_FILE_TYPES = [
  { value: "all", label: "All Files" },
  { value: "bin", label: ".bin" },
  { value: "c", label: ".c" },
  { value: "txt", label: ".txt" },
] as const;

function matchesFileType(fileName: string, type: string): boolean {
  const lower = fileName.toLowerCase();
  if (type === "all") return true;
  if (type === "resolved") return lower.endsWith(".resolved.md");
  return lower.endsWith(`.${type}`);
}

function getFileIcon(fileName: string, mode: MscWorkspaceMode) {
  switch (getMscFileRole(fileName, mode)) {
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
  modFolderPath,
}: MscWorkspaceViewProps) {
  const [workspaceMode, setWorkspaceMode] = useState<MscWorkspaceMode>("unit");
  const [traditionalFolderPath, setTraditionalFolderPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [fileType, setFileType] = useState<string>("all");
  const [allFiles, setAllFiles] = useState<MscFileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [processingFile, setProcessingFile] = useState<string | null>(null);
  const [isFolderRepacking, setIsFolderRepacking] = useState(false);
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const [batch, setBatch] = useState<BatchState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [verifyStates, setVerifyStates] = useState<Record<number, MscVerifyState>>({});
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [decompileSnapshots, setDecompileSnapshots] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [editorCommand, setEditorCommand] = useState<string>(() => getMscExternalEditorCommand());
  const [autoRepackFhm2d, setAutoRepackFhm2dState] = useState(() => getMscAutoRepackFhm2d());

  const activeFolderPath = workspaceMode === "unit" ? mscFolderPath : traditionalFolderPath;
  const fileTypes = workspaceMode === "unit" ? UNIT_FILE_TYPES : TRADITIONAL_FILE_TYPES;

  const isBusy = processingFile !== null || batch !== null || isFolderRepacking;

  const setActiveFolderPath = useCallback(
    (path: string) => {
      if (workspaceMode === "unit") {
        onMscFolderChange?.(path);
      } else {
        setTraditionalFolderPath(path);
      }
    },
    [onMscFolderChange, workspaceMode],
  );

  const setSlotVerifyState = useCallback((slotIndex: number, state: MscVerifyState | null) => {
    setVerifyStates((prev) => {
      const next = { ...prev };
      if (state === null) {
        delete next[slotIndex];
      } else {
        next[slotIndex] = state;
      }
      return next;
    });
  }, []);

  const fetchFiles = useCallback(async () => {
    if (!activeFolderPath) return;
    try {
      setIsLoading(true);
      const entries = await readDir(activeFolderPath);
      const files: MscFileInfo[] = [];
      for (const entry of entries) {
        if (!entry.isFile || !entry.name) continue;
        files.push({ name: entry.name, path: await join(activeFolderPath, entry.name) });
      }
      files.sort(compareByLeadingIndex);
      setAllFiles(files);
    } catch (error) {
      console.error("Error reading directory:", error);
      toast.error("Failed to read MSC folder");
    } finally {
      setIsLoading(false);
    }
  }, [activeFolderPath]);

  useEffect(() => {
    if (isActive && activeFolderPath) {
      void fetchFiles();
    }
  }, [isActive, activeFolderPath, fetchFiles]);

  // Verify results, snapshots, and preview belong to one folder only.
  useEffect(() => {
    setVerifyStates({});
    setPreview(null);
    setDecompileSnapshots(new Map());
  }, [activeFolderPath, workspaceMode]);

  useEffect(() => {
    setFileType("all");
    setSearchQuery("");
  }, [workspaceMode]);

  const filteredFiles = useMemo(
    () =>
      allFiles.filter(
        (file) =>
          file.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
          matchesFileType(file.name, fileType),
      ),
    [allFiles, searchQuery, fileType],
  );

  const groups = useMemo(
    () => groupMscFiles(filteredFiles, workspaceMode),
    [filteredFiles, workspaceMode],
  );
  const slots = useMemo(() => computeMscSlotStatuses(allFiles.map((f) => f.name)), [allFiles]);

  const scriptTargets = useMemo(
    () =>
      allFiles
        .filter((f) => getMscFileRole(f.name, workspaceMode) === "script")
        .sort(compareByLeadingIndex),
    [allFiles, workspaceMode],
  );
  const repackTargets = useMemo(
    () =>
      allFiles
        .filter((f) => isMscRepackableCFile(f.name, workspaceMode))
        .sort(compareByLeadingIndex),
    [allFiles, workspaceMode],
  );

  const handlePickFolder = async () => {
    try {
      setIsPickingFolder(true);
      // Prefer last picked folder (the folder itself), then current MSC path,
      // then workspace MSC route root. Never force-open the parent of the last pick.
      const defaultPath = getDialogDefaultPath(
        workspaceMode === "unit"
          ? DialogLastPathKey.mscWorkspaceFolder
          : DialogLastPathKey.traditionalMscWorkspaceFolder,
        activeFolderPath ?? (workspaceMode === "unit" ? workspaceDefaultPath : workspaceRoot),
      );
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath,
      });
      if (!selected || Array.isArray(selected)) return;
      const ok = await folderContainsMscScriptFiles(selected, workspaceMode);
      if (!ok) {
        toast.error(
          workspaceMode === "unit"
            ? "Selected folder must contain at least one .bscex, .cscex, or .dscex file"
            : "Selected folder must contain at least one .bin file",
        );
        return;
      }
      const dialogKey =
        workspaceMode === "unit"
          ? DialogLastPathKey.mscWorkspaceFolder
          : DialogLastPathKey.traditionalMscWorkspaceFolder;
      rememberDialogSelection(dialogKey, selected, "directory");
      setActiveFolderPath(selected);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setIsPickingFolder(false);
    }
  };

  const handleRepackFolder = useCallback(async () => {
    if (!activeFolderPath) return;
    const resolvedModFolderPath = modFolderPath?.trim();
    if (!resolvedModFolderPath) {
      toast.error("Configure OB Mod path in Config before repacking");
      return;
    }
    try {
      setIsFolderRepacking(true);
      let normalized = await resolveMigratedFhm2dFolderPath(activeFolderPath.replace(/\//g, "\\"));
      const folderName = normalized.split("\\").filter(Boolean).pop() ?? "";
      const parentDir = normalized.split("\\").slice(0, -1).join("\\");
      let structurePath = `${parentDir}\\${folderName}_structure.json`;
      const migration = await promptAndMigrateFhm2dStructureIfNeeded({
        structureJsonPath: structurePath,
        title: "Migrate MSC FHM2D structure",
      });
      if (migration) {
        const migratedPaths = applyFhm2dStructureMigrationToPack(
          {
            folderPath: normalized,
            structureJsonPath: structurePath,
          },
          migration,
        );
        normalized = migratedPaths.folderPath.replace(/\//g, "\\");
        structurePath = migratedPaths.structureJsonPath.replace(/\//g, "\\");
        setActiveFolderPath(normalized);
      }
      const result = await repackFolderUsingStructureToModFolder({
        structurePath,
        inputFolderPath: normalized,
        modFolderPath: resolvedModFolderPath,
      });
      // Game may keep loading same-stem .vgsht2 over the freshly written .fhm2d.
      try {
        const removed = await removeMatchingModVgsht2(
          resolvedModFolderPath,
          result.outputPath,
        );
        if (removed) {
          toast.success(`Repacked to mod: ${result.outputPath}`, {
            description: "Removed matching .vgsht2 (same stem as .fhm2d)",
          });
        } else {
          toast.success(`Repacked to mod: ${result.outputPath}`);
        }
      } catch (removeErr) {
        console.error(
          `Failed to remove matching .vgsht2 beside ${result.outputPath}`,
          removeErr,
        );
        toast.error(
          `Repacked to mod but failed to remove .vgsht2: ${(removeErr as Error).message}`,
        );
      }
    } catch (error) {
      console.error("Error during repack folder:", error);
      toast.error(`Repack Folder failed: ${formatCaughtError(error)}`);
    } finally {
      setIsFolderRepacking(false);
    }
  }, [activeFolderPath, modFolderPath, setActiveFolderPath]);

  /** Decompile one script to raw C/log outputs. Throws on tool failure. */
  const convertScriptCore = useCallback(
    async (file: MscFileInfo): Promise<string> => {
      const inputPath = file.path;
      const outputPath = getMscConvertOutputPath(inputPath, workspaceMode);
      const logPath = getMscConvertLogPath(inputPath, workspaceMode);
      await decompileMscScript({
        inputPath,
        outputPath,
        logPath,
      });

      // Snapshot the freshly decompiled C so later edits can be diffed, and
      // drop any verify verdict that belonged to the previous C content.
      try {
        const decompiledContent = await readTextFile(outputPath);
        setDecompileSnapshots((prev) => new Map(prev).set(outputPath, decompiledContent));
      } catch (snapshotError) {
        toast.warning(
          `Decompiled ${file.name}, but could not snapshot ${outputPath} for diffing: ` +
            (snapshotError instanceof Error ? snapshotError.message : String(snapshotError)),
        );
      }
      const slotIndex = Number.parseInt(file.name, 10);
      if (Number.isInteger(slotIndex)) {
        setSlotVerifyState(slotIndex, null);
      }

      return `${file.name} converted to raw C`;
    },
    [workspaceMode, setSlotVerifyState],
  );

  /** Recompile one C file back to its source pack extension. Throws on tool failure. */
  const repackScriptCore = useCallback(
    async (file: MscFileInfo): Promise<string> => {
      const inputPath = file.path;
      const outputPath = getMscRepackOutputPath(inputPath, workspaceMode);
      await repackMscScript({ inputPath, outputPath });
      // The original script changed, so any previous verify verdict is stale.
      const slotIndex = Number.parseInt(file.name, 10);
      if (Number.isInteger(slotIndex)) {
        setSlotVerifyState(slotIndex, null);
      }
      return `${file.name} to ${outputPath.replace(/^.*[\\/]/, "")}`;
    },
    [workspaceMode, setSlotVerifyState],
  );

  const handleConvertOne = useCallback(
    async (file: MscFileInfo) => {
      try {
        setProcessingFile(file.name);
        toast.success(`Converted ${await convertScriptCore(file)}`);
        await fetchFiles();
      } catch (error) {
        toast.error(`Error converting ${file.name}: ${formatCaughtError(error)}`);
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
        if (autoRepackFhm2d) {
          await handleRepackFolder();
        }
        await fetchFiles();
      } catch (error) {
        toast.error(`Error repacking ${file.name}: ${formatCaughtError(error)}`);
      } finally {
        setProcessingFile(null);
      }
    },
    [autoRepackFhm2d, handleRepackFolder, repackScriptCore, fetchFiles],
  );

  const handleResolveOverlay = useCallback(
    async (file: MscFileInfo) => {
      try {
        setProcessingFile(file.name);
        const scriptFolder = file.path.replace(/[\\/][^\\/]+$/, "");
        const result = await resolveMscActionOverlayForFolder(scriptFolder);
        if (result.status === "skipped") {
          toast.warning(`No stable MSC registry evidence found for ${file.name}`);
        } else {
          const evidenceSummary =
            `${result.actionCount} action(s), ${result.slotCallbackCount} slot callback(s), ` +
            `${result.weaponBindingCount} weapon binding(s), and ${result.resourceBindingCount} resource binding(s)`;
          const message = result.updatedPath
            ? `Updated ${result.updatedPath} with ${result.renamedCallbackCount} callback rename(s) from ${evidenceSummary}`
            : `Found ${evidenceSummary}, but no unresolved func_N callback names needed rewriting`;
          if (result.status === "partial") {
            toast.warning(message);
          } else {
            toast.success(message);
          }
        }
        await fetchFiles();
      } catch (error) {
        toast.error(`Error resolving overlay for ${file.name}: ${formatCaughtError(error)}`);
      } finally {
        setProcessingFile(null);
      }
    },
    [fetchFiles],
  );

  const handleOpenInEditor = useCallback(
    async (file: MscFileInfo) => {
      try {
        setProcessingFile(file.name);
        await openFileInExternalEditor({ filePath: file.path, editorCommand });
      } catch (error) {
        toast.error(`Error opening ${file.name} in editor: ${formatCaughtError(error)}`);
      } finally {
        setProcessingFile(null);
      }
    },
    [editorCommand],
  );

  const handleEditorCommandChange = useCallback((nextCommand: string) => {
    setEditorCommand(nextCommand);
    setMscExternalEditorCommand(nextCommand);
  }, []);

  const handleAutoRepackFhm2dChange = useCallback((enabled: boolean) => {
    setAutoRepackFhm2dState(enabled);
    setMscAutoRepackFhm2d(enabled);
  }, []);

  const handlePreview = useCallback(async (file: MscFileInfo) => {
    try {
      const content = await readTextFile(file.path);
      setPreview({ file, content, mode: "content" });
    } catch (error) {
      toast.error(
        `Failed to preview ${file.name}: ${formatCaughtError(error)}`,
      );
    }
  }, []);

  const handleTogglePreviewMode = useCallback(() => {
    setPreview((prev) => {
      if (!prev) return prev;
      return { ...prev, mode: prev.mode === "content" ? "diff" : "content" };
    });
  }, []);

  const handleVerifyRoundtrip = useCallback(
    async (file: MscFileInfo) => {
      const slotIndex = getMscPackSlotIndexForCFile(file.name);
      try {
        setProcessingFile(file.name);
        setSlotVerifyState(slotIndex, { status: "verifying" });
        const result = await verifyMscRoundtrip({ cFilePath: file.path });
        setSlotVerifyState(slotIndex, verifyStateFromReport(result.report));
        const summary = summarizeMscRoundtripReport(result.report);
        if (result.report.isMatch) {
          toast.success(`Round-trip verify ${file.name}: ${summary}`);
        } else {
          const context = result.report.originalContextHex
            ? ` Original: ${result.report.originalContextHex} | Recompiled: ${result.report.recompiledContextHex ?? "(empty)"}`
            : "";
          toast.warning(`Round-trip verify ${file.name}: ${summary}.${context}`);
        }
      } catch (error) {
        const message = formatCaughtError(error);
        setSlotVerifyState(slotIndex, { status: "error", message });
        toast.error(`Round-trip verify ${file.name} failed: ${message}`);
      } finally {
        setProcessingFile(null);
        await fetchFiles();
      }
    },
    [setSlotVerifyState, fetchFiles],
  );

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
          toast.error(`${file.name}: ${formatCaughtError(error)}`);
        }
        setBatch((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
      }
      setBatch(null);
      if (kind === "repack" && autoRepackFhm2d) {
        if (failures === 0) {
          await handleRepackFolder();
        } else {
          toast.warning("Automatic .fhm2d repack skipped because one or more MSC files failed");
        }
      }
      await fetchFiles();
      const verb = kind === "decompile" ? "Decompiled" : "Repacked";
      if (failures === 0) {
        toast.success(`${verb} ${targets.length} file(s)`);
      } else {
        toast.warning(`${verb} ${targets.length - failures}/${targets.length} file(s), ${failures} failed`);
      }
    },
    [autoRepackFhm2d, convertScriptCore, handleRepackFolder, repackScriptCore, fetchFiles],
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
        const outputPath = getMscConvertOutputPath(file.path, workspaceMode);
        const logPath = getMscConvertLogPath(file.path, workspaceMode);
        const overwrite = await collectExisting([outputPath, logPath]);
        setConfirm({ mode: "convert-one", file, outputPath, logPath, overwrite });
      } catch (error) {
        toast.error(`Failed to prepare convert for ${file.name}: ${formatCaughtError(error)}`);
      }
    },
    [collectExisting, workspaceMode],
  );

  const openDecompileAll = useCallback(async () => {
    const outputs = scriptTargets.flatMap((f) => [
      getMscConvertOutputPath(f.path, workspaceMode),
      getMscConvertLogPath(f.path, workspaceMode),
    ]);
    const overwrite = await collectExisting(outputs);
    setConfirm({ mode: "decompile-all", targets: scriptTargets, overwrite });
  }, [scriptTargets, collectExisting, workspaceMode]);

  const openRepackAll = useCallback(async () => {
    const overwrite = await collectExisting(
      repackTargets.map((f) => getMscRepackOutputPath(f.path, workspaceMode)),
    );
    setConfirm({ mode: "repack-all", targets: repackTargets, overwrite });
  }, [repackTargets, collectExisting, workspaceMode]);

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
      const role = getMscFileRole(file.name, workspaceMode);
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
            key: "preview",
            label: "Preview",
            onClick: () => handlePreview(file),
            variant: "ghost",
            disabled,
            icon: <Eye />,
          },
          {
            key: "open",
            label: "Open",
            onClick: () => handleOpenInEditor(file),
            variant: "ghost",
            disabled,
            icon: <ExternalLink />,
          },
        ];
        if (isMscRepackableCFile(file.name, workspaceMode)) {
          if (workspaceMode === "unit" && file.name.toLowerCase() === "2.c") {
            actions.push({
              key: "resolve-overlay",
              label: working ? "Resolving…" : "Resolve Overlay",
              onClick: () => handleResolveOverlay(file),
              variant: "secondary",
              disabled,
              icon: <Wand2 />,
            });
          }
          if (workspaceMode === "unit") {
            actions.push({
              key: "verify",
              label: working ? "Verifying…" : "Verify",
              onClick: () => handleVerifyRoundtrip(file),
              variant: "outline",
              disabled,
              icon: working ? <Loader2 className="animate-spin" /> : <ShieldCheck />,
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

      if (role === "log" || role === "resolved") {
        return [
          {
            key: "preview",
            label: "Preview",
            onClick: () => handlePreview(file),
            variant: "ghost",
            disabled,
            icon: <Eye />,
          },
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
    [
      processingFile,
      isBusy,
      openConvertOne,
      handlePreview,
      handleOpenInEditor,
      handleResolveOverlay,
      handleVerifyRoundtrip,
      handleRepackOne,
      workspaceMode,
    ],
  );

  const previewSnapshot = preview ? (decompileSnapshots.get(preview.file.path) ?? null) : null;
  const previewSupportsDiff =
    preview !== null && getMscFileRole(preview.file.name, workspaceMode) === "c";
  const previewDiff = useMemo(() => {
    if (!preview || preview.mode !== "diff" || previewSnapshot === null) return null;
    return diffTextLines(previewSnapshot, preview.content);
  }, [preview, previewSnapshot]);

  const workspaceModeTabs = (
    <Tabs
      value={workspaceMode}
      onValueChange={(value) => setWorkspaceMode(value as MscWorkspaceMode)}
      className="shrink-0"
    >
      <TabsList aria-label="MSC workspace type">
        <TabsTrigger value="unit">Unit MSC</TabsTrigger>
        <TabsTrigger value="traditional">Traditional MSC</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  if (!activeFolderPath) {
    return (
      <div className="flex h-full min-h-48 flex-col gap-4 px-4 pb-4">
        {workspaceModeTabs}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center text-muted-foreground">
          <FolderOpen className="size-10 opacity-50" />
          <div className="max-w-md space-y-2 text-sm">
            <p className="font-medium text-foreground">
              {workspaceMode === "unit" ? "Unit MSC Workspace" : "Traditional MSC Workspace"}
            </p>
            {workspaceMode === "unit" ? (
              <p>
                Select a folder containing at least one{" "}
                <code className="rounded bg-muted px-1 font-mono">.bscex</code>,{" "}
                <code className="rounded bg-muted px-1 font-mono">.cscex</code>, or{" "}
                <code className="rounded bg-muted px-1 font-mono">.dscex</code> file.
              </p>
            ) : (
              <p>
                Select a folder containing <code className="rounded bg-muted px-1 font-mono">.bin</code>{" "}
                MSC scripts. Arbitrary file names are supported.
              </p>
            )}
            {workspaceRoot ? (
              <p className="font-mono text-[11px] text-muted-foreground">Workspace root: {workspaceRoot}</p>
            ) : null}
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => void handlePickFolder()} disabled={isPickingFolder}>
            {isPickingFolder ? <Loader2 className="mr-2 animate-spin" /> : <FolderOpen className="mr-2" />}
            {isPickingFolder ? "Picking…" : "Pick folder"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col gap-4 pb-4">
        {workspaceModeTabs}
        <div className="flex shrink-0 flex-col gap-3 border-b pb-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">
                {workspaceMode === "unit" ? "Unit MSC Workspace" : "Traditional MSC Workspace"}
              </h2>
              <p className="break-all font-mono text-[11px] text-muted-foreground" title={activeFolderPath}>
                {activeFolderPath}
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

          {workspaceMode === "unit" ? (
            <MscPipelineBar slots={slots} verifyStates={verifyStates} />
          ) : null}

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

          <div className="flex flex-wrap items-center gap-2">
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
                {fileTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={editorCommand}
              onChange={(e) => handleEditorCommandChange(e.target.value)}
              className="w-[150px] font-mono text-xs"
              placeholder="cursor"
              aria-label="External editor command"
              title="External editor command used by Open (e.g. cursor, code, notepad)"
            />
            <label
              htmlFor="msc-auto-repack-fhm2d"
              className="flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-xs text-muted-foreground"
              title="After compiling C back to MSC, automatically repack the containing FHM2D"
            >
              <Switch
                id="msc-auto-repack-fhm2d"
                checked={autoRepackFhm2d}
                onCheckedChange={handleAutoRepackFhm2dChange}
                disabled={isBusy}
              />
              Auto-repack .fhm2d
            </label>
          </div>
        </div>

        {preview ? (
          <div className="flex max-h-[45%] min-h-0 shrink-0 flex-col overflow-hidden rounded-md border">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <FileCode className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate font-mono text-xs" title={preview.file.path}>
                  {preview.file.name}
                </span>
                {preview.mode === "diff" && previewDiff ? (
                  <span className="shrink-0 font-mono text-[11px] tabular-nums">
                    <span className="text-emerald-600 dark:text-emerald-500">+{previewDiff.addedCount}</span>{" "}
                    <span className="text-destructive">-{previewDiff.removedCount}</span>
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {previewSupportsDiff ? (
                  <Button
                    type="button"
                    variant={preview.mode === "diff" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={handleTogglePreviewMode}
                    disabled={previewSnapshot === null}
                    title={
                      previewSnapshot === null
                        ? "Decompile this script in this session to capture a diff snapshot"
                        : "Toggle diff vs the last-decompiled snapshot"
                    }
                  >
                    <Diff className="mr-1" />
                    Diff
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" size="sm" onClick={() => setPreview(null)} title="Close preview">
                  <X />
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-card">
              {preview.mode === "diff" && previewDiff ? (
                previewDiff.isIdentical ? (
                  <p className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    No changes vs the last-decompiled snapshot.
                  </p>
                ) : (
                  <pre className="py-2 font-mono text-xs leading-5">
                    {previewDiff.lines.map((line, index) => (
                      <div
                        key={index}
                        className={cn(
                          "px-3",
                          line.kind === "added" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                          line.kind === "removed" && "bg-destructive/10 text-destructive",
                        )}
                      >
                        <span className="mr-2 select-none opacity-60">
                          {line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "}
                        </span>
                        {line.text}
                      </div>
                    ))}
                  </pre>
                )
              ) : (
                <pre className="whitespace-pre px-3 py-2 font-mono text-xs leading-5">{preview.content}</pre>
              )}
            </div>
          </div>
        ) : null}

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
                      icon={getFileIcon(file.name, workspaceMode)}
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
