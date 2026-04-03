import { useState, useEffect, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { dirname, join, resourceDir } from "@tauri-apps/api/path";
import { FileEdit, FolderOpen, Code, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Command } from "@tauri-apps/plugin-shell";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { exists, readDir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import {
  folderContainsMscScriptFiles,
  getMscConvertLogPath,
  getMscConvertOutputPath,
  getMscRepackOutputPath,
} from "../../utils/mscWorkspaceUtils";

interface FileInfo {
  name: string;
  path: string;
}

interface MscWorkspaceViewProps {
  workspaceRoot: string;
  mscFolderPath: string | null;
  onMscFolderChange?: (path: string | null) => void;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
}

interface FileAction {
  label: string;
  onClick: () => Promise<void>;
  className?: string;
  disabled?: boolean;
}

const FILE_TYPES = [
  { value: "all", label: "All Files" },
  { value: "c", label: ".c" },
  { value: "txt", label: ".txt" },
  { value: "bscex", label: ".bscex" },
  { value: "cscex", label: ".cscex" },
  { value: "dscex", label: ".dscex" },
] as const;

const BUTTON_STYLES = {
  convert: "bg-gray-900 hover:bg-black text-white border-gray-900 shadow-sm",
  edit: "bg-gray-700 hover:bg-gray-800 text-white border-gray-700 shadow-sm",
  replace: "bg-gray-600 hover:bg-gray-700 text-white border-gray-600 shadow-sm",
  repack: "bg-gray-800 hover:bg-gray-900 text-white border-gray-800 shadow-sm",
  view: "bg-gray-500 hover:bg-gray-600 text-white border-gray-500 shadow-sm",
};

function matchesFileType(fileName: string, type: string): boolean {
  const lower = fileName.toLowerCase();
  if (type === "all") return true;
  if (type === "c") return lower.endsWith(".c");
  if (type === "txt") return lower.endsWith(".txt");
  if (type === "bscex") return lower.endsWith(".bscex");
  if (type === "cscex") return lower.endsWith(".cscex");
  if (type === "dscex") return lower.endsWith(".dscex");
  return false;
}

/** MSC pack root scripts that support Replace + Repack in this workspace. */
function isMscCoreScriptCFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower === "0.c" || lower === "1.c" || lower === "2.c";
}

export default function MscWorkspaceView({
  workspaceRoot,
  mscFolderPath,
  onMscFolderChange,
  isActive,
}: MscWorkspaceViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [fileType, setFileType] = useState<string>("all");
  const [localFiles, setLocalFiles] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [processingFile, setProcessingFile] = useState<string | null>(null);
  const [isFolderRepacking, setIsFolderRepacking] = useState(false);
  const [isPickingFolder, setIsPickingFolder] = useState(false);

  const resolveTauriExeDir = useCallback(async () => {
    const resourcePath = await resourceDir();
    const normalized = resourcePath.replace(/\\/g, "/").replace(/\/+$/, "");
    if (normalized.toLowerCase().endsWith("/resources")) {
      return await dirname(resourcePath);
    }
    return resourcePath;
  }, []);

  const resolveExvsMappingPath = useCallback(async () => {
    const exeDir = await resolveTauriExeDir();
    const mappingPath = await join(
      exeDir,
      "tools",
      "mappings",
      "exvs_0xF1EF3B32.native_truth.json",
    );
    if (!(await exists(mappingPath))) {
      throw new Error(`MSC workspace: EXVS mapping file not found: ${mappingPath}`);
    }
    return mappingPath;
  }, [resolveTauriExeDir]);

  const fetchFiles = useCallback(async () => {
    if (!mscFolderPath) return;

    try {
      setIsLoading(true);
      const entries = await readDir(mscFolderPath);
      const filteredEntries: FileInfo[] = [];
      for (const entry of entries) {
        if (!entry.isFile || !entry.name) continue;
        const name = entry.name;
        const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchesSearch || !matchesFileType(name, fileType)) continue;
        filteredEntries.push({
          name,
          path: await join(mscFolderPath, name),
        });
      }

      filteredEntries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      setLocalFiles(filteredEntries);
    } catch (error) {
      console.error("Error reading directory:", error);
      toast.error("Failed to read MSC folder");
    } finally {
      setIsLoading(false);
    }
  }, [mscFolderPath, searchQuery, fileType]);

  useEffect(() => {
    if (isActive && mscFolderPath) {
      void fetchFiles();
    }
  }, [isActive, mscFolderPath, fetchFiles]);

  const handlePickFolder = async () => {
    try {
      setIsPickingFolder(true);
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (!selected || Array.isArray(selected)) {
        return;
      }
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
      const toolPath = "E:\\XB\\解包\\com\\compression.js";
      const normalizedFolderPath = mscFolderPath.replace(/\\/g, "/");
      const folderName = normalizedFolderPath.split("/").filter(Boolean).pop() ?? "";
      const parentDir = normalizedFolderPath.split("/").slice(0, -1).join("/");

      const filePath = `${parentDir}/${folderName}_structure.json`;

      const command = await Command.create(
        "exec-node",
        [toolPath, filePath, "-r", "-com-path", `${parentDir}/`],
        { encoding: "utf-8" },
      ).execute();

      if (command.code !== 0) {
        console.error("Repack Folder failed:", command.stderr);
        toast.error(`Repack Folder failed: ${command.stderr}`);
      } else {
        toast.success("Repack Folder completed successfully");
      }
    } catch (error) {
      console.error("Error during repack folder:", error);
      toast.error("Error during Repack Folder");
    } finally {
      setIsFolderRepacking(false);
    }
  };

  const handleConvertScriptToC = async (file: FileInfo) => {
    try {
      setProcessingFile(file.name);
      const inputPath = file.path;
      const outputPath = getMscConvertOutputPath(inputPath);
      const logPath = getMscConvertLogPath(inputPath);
      const resourcePath = await resourceDir();
      const exvsMappingPath = await resolveExvsMappingPath();

      const command = await Command.create("exec-python", [
        resourcePath + "/tools/mscdec.py",
        inputPath,
        "-o",
        outputPath,
        "-log",
        logPath,
        "--exvsMapping",
        exvsMappingPath,
      ]).execute();

      if (command.code !== 0) {
        toast.error(`Failed to convert ${file.name}: ${command.stderr}`);
      } else {
        toast.success(`Successfully converted ${file.name} to .c`);
        void fetchFiles();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Error converting ${file.name}`);
    } finally {
      setProcessingFile(null);
    }
  };

  const handleReplaceFuncToMain = async (file: FileInfo) => {
    try {
      setProcessingFile(file.name);
      const fileContent = await readTextFile(file.path);
      const replacedContent = fileContent.replace(/func_0/g, "main");
      await writeTextFile(file.path, replacedContent);
      toast.success(`Successfully replaced func_0 to main in ${file.name}`);
    } catch {
      toast.error(`Error replacing in ${file.name}`);
    } finally {
      setProcessingFile(null);
    }
  };

  const handleRepackCToScript = async (file: FileInfo) => {
    try {
      setProcessingFile(file.name);
      const inputPath = file.path;
      const outputPath = getMscRepackOutputPath(inputPath);
      const resourcePath = await resourceDir();
      const exvsMappingPath = await resolveExvsMappingPath();

      const command = await Command.create(
        "exec-python",
        [
          resourcePath + "/tools/msclang.py",
          inputPath,
          "-o",
          outputPath,
          "-i",
          "--exvsMapping",
          exvsMappingPath,
        ],
        { encoding: "utf-8" },
      ).execute();

      if (command.code !== 0) {
        toast.error(`Failed to repack ${file.name}: ${command.stderr}`);
      } else {
        const outputName = outputPath.replace(/^.*[\\/]/, "");
        toast.success(`Successfully repacked ${file.name} to ${outputName}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Error repacking ${file.name}`);
    } finally {
      setProcessingFile(null);
    }
  };

  const handleOpenInCursor = async (file: FileInfo) => {
    try {
      setProcessingFile(file.name);
      const command = await Command.create("exec-cmd", ["/C", "cursor", file.path]).execute();
      if (command.code !== 0) {
        toast.error(`Failed to open ${file.name} in Cursor: ${command.stderr}`);
      }
    } catch {
      toast.error(`Error opening ${file.name} in Cursor`);
    } finally {
      setProcessingFile(null);
    }
  };

  const createFileActions = (file: FileInfo): FileAction[] => {
    const extension = file.name.split(".").pop()?.toLowerCase();

    switch (extension) {
      case "bscex":
      case "cscex":
      case "dscex":
        return [
          {
            label: processingFile === file.name ? "Converting..." : "Convert",
            onClick: () => handleConvertScriptToC(file),
            className: BUTTON_STYLES.convert,
            disabled: processingFile === file.name,
          },
        ];
      case "c": {
        const openCursor: FileAction = {
          label: "Open Cursor",
          onClick: () => handleOpenInCursor(file),
          className: BUTTON_STYLES.edit,
          disabled: processingFile === file.name,
        };
        if (!isMscCoreScriptCFile(file.name)) {
          return [openCursor];
        }
        return [
          openCursor,
          {
            label: "Replace",
            onClick: () => handleReplaceFuncToMain(file),
            className: BUTTON_STYLES.replace,
            disabled: processingFile === file.name,
          },
          {
            label: processingFile === file.name ? "Repacking..." : "Repack",
            onClick: () => handleRepackCToScript(file),
            className: BUTTON_STYLES.repack,
            disabled: processingFile === file.name,
          },
        ];
      }
      case "txt":
        return [
          {
            label: "Open Cursor",
            onClick: () => handleOpenInCursor(file),
            className: BUTTON_STYLES.view,
            disabled: processingFile === file.name,
          },
        ];
      default:
        return [];
    }
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split(".").pop()?.toLowerCase();
    switch (extension) {
      case "c":
        return <Code className="h-4 w-4 text-foreground" />;
      case "txt":
        return <FileEdit className="h-4 w-4 text-muted-foreground" />;
      case "bscex":
      case "cscex":
      case "dscex":
        return <FileEdit className="h-4 w-4 text-foreground" />;
      default:
        return <FileEdit className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (!mscFolderPath) {
    return (
      <div className="flex h-full min-h-48 flex-col items-center justify-center gap-4 px-4 text-center text-muted-foreground">
        <FolderOpen className="h-10 w-10 opacity-50" />
        <div className="max-w-md space-y-2 text-sm">
          <p className="text-foreground font-medium">MSC Workspace</p>
          <p>
            Select a folder in the file tree that contains at least one{" "}
            <code className="rounded bg-muted px-1">.bscex</code>,{" "}
            <code className="rounded bg-muted px-1">.cscex</code>, or{" "}
            <code className="rounded bg-muted px-1">.dscex</code> file, or pick a folder below.
          </p>
          {workspaceRoot ? (
            <p className="text-[11px] text-muted-foreground">Workspace root: {workspaceRoot}</p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void handlePickFolder()}
          disabled={isPickingFolder}
        >
          {isPickingFolder ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Picking…
            </>
          ) : (
            <>
              <FolderOpen className="mr-2 h-4 w-4" />
              Pick folder
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col space-y-4 pb-4">
      <div className="flex flex-col gap-3 shrink-0 border-b pb-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">MSC Workspace</h2>
            <p className="break-all text-[11px] text-muted-foreground" title={mscFolderPath}>
              {mscFolderPath}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handlePickFolder()}
              disabled={isPickingFolder}
            >
              {isPickingFolder ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FolderOpen className="mr-2 h-4 w-4" />
              )}
              Pick folder
            </Button>
            <Button
              type="button"
              onClick={handleRepackFolder}
              disabled={isFolderRepacking}
              size="sm"
            >
              {isFolderRepacking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Repack Folder
            </Button>
          </div>
        </div>

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

      <div className="flex-1 space-y-2 overflow-y-auto pr-2">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-6 w-6 animate-spin" />
            Loading files…
          </div>
        ) : localFiles.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center text-muted-foreground">
            <FolderOpen className="mb-2 h-8 w-8 opacity-50" />
            No files match the current filter
          </div>
        ) : (
          localFiles.map((file, index) => {
            const actions = createFileActions(file);
            return (
              <Card key={`${file.path}-${index}`} className="p-3 transition-colors hover:bg-muted/50">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center space-x-3 overflow-hidden">
                    {getFileIcon(file.name)}
                    <span className="truncate" title={file.name}>
                      {file.name}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center space-x-2">
                    {actions.map((action, actionIndex) => (
                      <Button
                        key={actionIndex}
                        size="sm"
                        className={action.className}
                        onClick={() => void action.onClick()}
                        disabled={action.disabled}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
