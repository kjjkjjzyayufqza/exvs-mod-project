import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FilePathInput } from "@/components/ui/filePathInput";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Archive, Loader2 } from "lucide-react";
import { readTextFile, readDir } from "@tauri-apps/plugin-fs";
import { dirname } from "@tauri-apps/api/path";
import { toast } from "sonner";
import { useConfigStore } from "@/store/configStore";
import { useRepackStore } from "@/store/repackStore";
import { convertSubFileStructureToTreeData } from "@/lib/utils";
import { repackFolderUsingStructure } from "@/utils/repackRunner";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import {
  Fhm2dMetadataSummary,
  basenameFromPath,
  joinPreviewPath,
} from "@/components/fhm2d-metadata";
import { promptAndMigrateFhm2dStructureIfNeeded } from "@/utils/fhm2dStructureMetadata";
import {
  normalizeFhm2dHashName,
  sanitizeFhm2dStructureName,
} from "@/utils/fhm2dStructureMetadata";

interface RepackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const REPACK_MODAL_DIMENSIONS = {
  width: 500,
  height: 500,
  minWidth: 440,
  minHeight: 360,
};

type RepackStructurePreview =
  | {
      structureJsonPath: string;
      name: string;
      hashName: string | null;
      repackOutputPath: string | null;
      missingMetadata: boolean;
    }
  | {
      error: string;
    }
  | null;

async function findStructureJsonForFolder(inputFolderPath: string): Promise<string | null> {
  const parentDir = await dirname(inputFolderPath);
  const entries = await readDir(parentDir);
  const jsonFiles = entries.filter((entry) => entry.isFile && entry.name?.toLowerCase().endsWith(".json"));
  if (jsonFiles.length === 0) return null;

  const folderName = basenameFromPath(inputFolderPath);
  const folderNameLower = folderName.toLowerCase();
  const matchedJsonFiles = jsonFiles.filter((entry) => {
    if (!entry.name || !folderNameLower) return false;
    const nameLower = entry.name.toLowerCase();
    return nameLower === `${folderNameLower}.json` || nameLower === `${folderNameLower}_structure.json`;
  });
  const otherJsonFiles = jsonFiles.filter((entry) => !matchedJsonFiles.includes(entry));

  for (const jsonFile of [...matchedJsonFiles, ...otherJsonFiles]) {
    if (!jsonFile.name) continue;
    const filePath = `${parentDir}/${jsonFile.name}`;
    try {
      const parsedData = JSON.parse(await readTextFile(filePath));
      if (parsedData.SubFileStructure && Array.isArray(parsedData.SubFileStructure)) {
        return filePath;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export default function RepackModal({ isOpen, onClose }: RepackModalProps) {
  const { repackInputPath } = useConfigStore();
  const { exportProjectData } = useRepackStore();
  const [isRepacking, setIsRepacking] = useState(false);
  const [structurePreview, setStructurePreview] = useState<RepackStructurePreview>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const inputPath = repackInputPath?.trim();
    setStructurePreview(null);
    setIsPreviewLoading(false);
    if (!isOpen || !inputPath) return () => {
      cancelled = true;
    };

    setIsPreviewLoading(true);
    void (async () => {
      try {
        const structureJsonPath = await findStructureJsonForFolder(inputPath);
        if (!structureJsonPath) {
          if (!cancelled) setStructurePreview({ error: "No structure JSON with SubFileStructure was found beside this folder." });
          return;
        }
        const parentDir = await dirname(inputPath);
        const raw = await readTextFile(structureJsonPath);
        const parsed = JSON.parse(raw) as { Name?: unknown; HashName?: unknown };
        const name = typeof parsed.Name === "string"
          ? sanitizeFhm2dStructureName(parsed.Name)
          : sanitizeFhm2dStructureName(basenameFromPath(inputPath));
        const hashName = typeof parsed.HashName === "string"
          ? normalizeFhm2dHashName(parsed.HashName)
          : null;
        if (!cancelled) {
          setStructurePreview({
            structureJsonPath,
            name,
            hashName,
            repackOutputPath: hashName ? joinPreviewPath(parentDir, `${hashName}.fhm2d`) : null,
            missingMetadata: typeof parsed.Name !== "string" || !hashName,
          });
        }
      } catch (error) {
        if (!cancelled) setStructurePreview({ error: String(error) });
      } finally {
        if (!cancelled) setIsPreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, repackInputPath]);

  // Handle import operation
  const handleRepack = async () => {
    try {
      // Validate input path
      if (!repackInputPath || repackInputPath.trim() === "") {
        toast.error("Please select an input folder first");
        return;
      }

      setIsRepacking(true);

      // Get parent directory of the selected folder
      const parentDir = await dirname(repackInputPath);

      // Read directory contents to find JSON files in parent directory
      const entries = await readDir(parentDir);
      const jsonFiles = entries.filter(entry => entry.isFile && entry.name?.toLowerCase().endsWith('.json'));

      if (jsonFiles.length === 0) {
        toast.error("No JSON files found in the parent directory");
        setIsRepacking(false);
        return;
      }

      // Determine project folder name and try to match corresponding JSON file
      const pathSegments = repackInputPath.split(/[/\\]/).filter(Boolean);
      const folderName = pathSegments[pathSegments.length - 1];
      const folderNameLower = folderName ? folderName.toLowerCase() : "";

      // Reorder JSON files so that files matching the folder name come first:
      // e.g. "0xDFD38C70" -> "0xDFD38C70_structure.json" or "0xDFD38C70.json"
      const matchedJsonFiles = jsonFiles.filter((entry) => {
        if (!entry.name || !folderNameLower) return false;
        const nameLower = entry.name.toLowerCase();
        return (
          nameLower === `${folderNameLower}.json` ||
          nameLower === `${folderNameLower}_structure.json`
        );
      });
      const otherJsonFiles = jsonFiles.filter(
        (entry) => !matchedJsonFiles.includes(entry)
      );
      const orderedJsonFiles = [...matchedJsonFiles, ...otherJsonFiles];

      // Default to the first JSON file in the ordered list
      let selectedJsonFile = orderedJsonFiles[0];

      // Try to find a file that actually contains the expected project structure,
      // checking the folder-name-matched files first
      for (const jsonFile of orderedJsonFiles) {
        try {
          const filePath = `${parentDir}/${jsonFile.name}`;
          const jsonContent = await readTextFile(filePath);
          const parsedData = JSON.parse(jsonContent);

          // Check if it has the expected structure
          if (parsedData.SubFileStructure && Array.isArray(parsedData.SubFileStructure)) {
            selectedJsonFile = jsonFile;
            break;
          }
        } catch (error) {
          // Continue to next file
          continue;
        }
      }

      let jsonFilePath = `${parentDir}/${selectedJsonFile.name}`;
      let inputFolderPath = repackInputPath;
      const metadataMigration = await promptAndMigrateFhm2dStructureIfNeeded({
        structureJsonPath: jsonFilePath,
      });
      if (metadataMigration) {
        jsonFilePath = metadataMigration.structureJsonPath;
        inputFolderPath = metadataMigration.rootPath ?? inputFolderPath;
      }

      // Read and import the JSON file content directly
      const jsonContent = await readTextFile(jsonFilePath);
      const parsedData = JSON.parse(jsonContent);
      console.log(jsonFilePath);
      let convertedData: any[] = [];
      let successMessage = "";

      // Only use SubFileStructure for importing tree structure
      if (parsedData.SubFileStructure && Array.isArray(parsedData.SubFileStructure)) {
        // Validate required fields
        if (parsedData.Magic === undefined || parsedData.Magic === null) {
          throw new Error('Missing required field: Magic');
        }
        if (parsedData.Fhm2dTotalCount === undefined || parsedData.Fhm2dTotalCount === null) {
          throw new Error('Missing required field: Fhm2dTotalCount');
        }
        if (parsedData.UnkCount === undefined || parsedData.UnkCount === null) {
          throw new Error('Missing required field: UnkCount');
        }
        if (!parsedData.SubFileData || !Array.isArray(parsedData.SubFileData)) {
          throw new Error('Missing or invalid SubFileData array');
        }

        // Store complete project data
        const { setCompleteProjectData, setTreeData } = useRepackStore.getState();
        setCompleteProjectData({
          Name: typeof parsedData.Name === "string" ? parsedData.Name : undefined,
          HashName: typeof parsedData.HashName === "string" ? parsedData.HashName : undefined,
          Magic: parsedData.Magic,
          Fhm2dTotalCount: parsedData.Fhm2dTotalCount,
          UnkCount: parsedData.UnkCount,
          SubFileData: parsedData.SubFileData,
          SubFileStructure: parsedData.SubFileStructure,
          SubFileParseStructure: parsedData.SubFileParseStructure
        });

        // Convert SubFileStructure to tree format
        convertedData = convertSubFileStructureToTreeData(
          parsedData.SubFileStructure,
          parsedData.SubFileData || []
        );
        successMessage = "Successfully imported tree structure from SubFileStructure";
      }
      // Fallback: Check if it's a direct tree structure array
      else if (Array.isArray(parsedData)) {
        convertedData = parsedData;
        successMessage = "Successfully imported tree structure from direct array";
      }
      else {
        toast.error("No valid SubFileStructure found in the selected file");
        setIsRepacking(false);
        return;
      }

      // Update tree data if conversion was successful
      if (convertedData.length > 0) {
        const { setTreeData, setSelectedItem } = useRepackStore.getState();
        setTreeData(convertedData);
        setSelectedItem(null);

        try {
          await repackFolderUsingStructure({
            structurePath: jsonFilePath,
            inputFolderPath,
          });
          toast.success(successMessage + "\nRepacked from: " + jsonFilePath);
        } catch (repackError) {
          console.error("Error during repack:", repackError);
          toast.error(
            "Error during repack: " + (repackError as Error).message
          );
        }
      } else {
        toast.error("No valid tree data found in the selected file");
      }
    } catch (error) {
      console.error("Error during import:", error);
      toast.error("Failed to import: " + (error as Error).message);
    } finally {
      setIsRepacking(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AppRndModalShell
      titleId="repack-modal-title"
      title="Repack"
      subtitle="Rebuild a folder using its structure JSON"
      headerIcon={<Archive className="h-5 w-5 text-primary" />}
      dimensions={REPACK_MODAL_DIMENSIONS}
      storageKey="app.rnd-size.repack"
      onClose={onClose}
      closeDisabled={isRepacking}
    >
            <div className="space-y-4 p-6">
              <div className="space-y-2">
                <Label htmlFor="repack-folder">Input Folder</Label>
                <FilePathInput
                  id="repack-folder"
                  type="text"
                  placeholder="Click to select input folder..."
                  value={repackInputPath}
                  readOnly
                  storeKey="repackInputPath"
                  picker={{
                    kind: "folder",
                    multiple: false,
                  }}
                  className="cursor-pointer"
                />
                <p className="text-xs text-muted-foreground">
                  Select the folder containing the files to repack
                </p>
              </div>

              {isPreviewLoading ? (
                <div className="flex items-start gap-2 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                  Reading sibling structure JSON...
                </div>
              ) : structurePreview && "error" in structurePreview ? (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {structurePreview.error}
                </div>
              ) : structurePreview ? (
                <div className="space-y-2">
                  <Fhm2dMetadataSummary
                    compact
                    name={structurePreview.name}
                    hashName={structurePreview.hashName}
                    folderPath={repackInputPath}
                    structureJsonPath={structurePreview.structureJsonPath}
                    repackOutputPath={structurePreview.repackOutputPath}
                  />
                  {structurePreview.missingMetadata ? (
                    <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-100">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      This structure will ask for migration before repack so Name and HashName are written first.
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleRepack}
                  disabled={isRepacking || isPreviewLoading || !repackInputPath}
                >
                  {isRepacking ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Archive className="mr-2 h-4 w-4" />
                  )}
                  {isRepacking ? "Repacking..." : "Repack"}
                </Button>
              </div>
            </div>
    </AppRndModalShell>
  );
}
