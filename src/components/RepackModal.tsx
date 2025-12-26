import { useState, useRef } from "react";
import Draggable from "react-draggable";
import { Button } from "@/components/ui/button";
import { FilePathInput } from "@/components/ui/filePathInput";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile, readDir } from "@tauri-apps/plugin-fs";
import { dirname } from "@tauri-apps/api/path";
import { toast } from "sonner";
import { Command } from "@tauri-apps/plugin-shell";
import { useConfigStore } from "@/store/configStore";
import { useRepackStore } from "@/store/repackStore";
import { convertSubFileStructureToTreeData } from "@/lib/utils";

interface RepackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RepackModal({ isOpen, onClose }: RepackModalProps) {
  const { repackInputPath, setRepackInputPath } = useConfigStore();
  const { exportProjectData } = useRepackStore();
  const [isRepacking, setIsRepacking] = useState(false);
  const nodeRef = useRef(null);

  // Handle folder selection
  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: true,
      });

      if (selected) {
        await setRepackInputPath(selected as string);
      }
    } catch (error) {
      console.error("Error selecting folder:", error);
      toast.error("Failed to select folder: " + (error as Error).message);
    }
  };

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

      const jsonFilePath = `${parentDir}/${selectedJsonFile.name}`;

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

        // Run external repack tool similar to Files Editor
        try {
          const toolPath = "E:\\XB\\解包\\com\\compression.js";
          const normalizedJsonFilePath = jsonFilePath.replace(/\//g, "\\");
          const normalizedInputPath = repackInputPath.replace(/\//g, "\\");
          const comPath =
            normalizedInputPath.split("\\").slice(0, -1).join("\\") + "\\";

          const command = await Command.create(
            "exec-node",
            [toolPath, normalizedJsonFilePath, "-r", "-com-path", comPath],
            { encoding: "utf-8" }
          ).execute();

          if (command.code !== 0) {
            console.error("Repack failed:", command.stderr);
            toast.error(
              "Repack failed: " + (command.stderr || "Unknown error")
            );
          } else {
            console.log("Repack completed");
            toast.success(successMessage + "\nRepacked from: " + jsonFilePath);
          }
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
    <div className="fixed left-0 right-0 bottom-0 top-10 z-40 pointer-events-none flex items-center justify-center">
      <Draggable
        nodeRef={nodeRef}
        handle=".drag-handle"
        bounds="parent"
        defaultPosition={{ x: 0, y: 0 }}
      >
        <div
          ref={nodeRef}
          className="pointer-events-auto"
          style={{ width: "500px" }}
        >
          <div className="bg-background border border-border rounded-lg shadow-2xl">
            {/* Title bar - draggable area */}
            <div className="drag-handle flex items-center justify-between px-4 py-3 border-b border-border cursor-move bg-muted/50">
              <h2 className="text-lg font-semibold">Repack</h2>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="repack-folder">Input Folder</Label>
                <FilePathInput
                  id="repack-folder"
                  type="text"
                  placeholder="Click to select input folder..."
                  value={repackInputPath}
                  readOnly
                  onClick={handleSelectFolder}
                  className="cursor-pointer"
                />
                <p className="text-xs text-muted-foreground">
                  Select the folder containing the files to repack
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleRepack}
                  disabled={isRepacking || !repackInputPath}
                >
                  {isRepacking ? "Repacking..." : "Repack"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Draggable>
    </div>
  );
}

