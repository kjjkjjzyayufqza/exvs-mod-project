import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderOpen, Loader2, Plus, ImageIcon, Bug } from "lucide-react";
import { readDir, readFile, exists, writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { FileList } from "./components/FileList";
import { FileTypeDialog } from "./components/FileTypeDialog";
import { CONVERT_DIR_NAME, FileInfo as NumatbFileInfo, useNumatbStore } from "../../store/numatbStore";
import { FileInfo as NutexbFileInfo } from "../../store/nutexbStore";
import { useNutexbStore } from "../../store/nutexbStore";
import { Button } from "../../components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { resourceDir, dirname, join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { findNutexbString } from "../../module/commonFunc";
import { Command } from '@tauri-apps/plugin-shell';
import { promptAndMigrateFhm2dStructureIfNeeded } from "@/utils/fhm2dStructureMetadata";


// Extend FileInfo to include possible properties
interface ExtendedFileInfo extends NumatbFileInfo, NutexbFileInfo {
  previewPath?: string | null;
  string?: string;  // Make string property optional
}

type FileInfo = ExtendedFileInfo;

export default function FilesEdit() {
  const [folderPath, setFolderPath] = useState("");
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 });
  const [handleDebugRepack, setHandleDebugRepack] = useState(false);
  const [isConvertingNutexb, setIsConvertingNutexb] = useState(false);
  const [isBatchReplacing, setIsBatchReplacing] = useState(false);
  const [isDebuggingNumatb, setIsDebuggingNumatb] = useState(false);

  const convertNumatbFile = useNumatbStore((e) => e.convertFile);
  const resetNumatbConversion = useNumatbStore((e) => e.resetConversion);

  const convertNutexbFile = useNutexbStore((e) => e.convertFile);
  const resetNutexbConversion = useNutexbStore((e) => e.resetConversion);

  const getNutexbFileInfos = useNutexbStore((e) => e.getFileInfos);
  const batchGetNutexbFileInfos = useNutexbStore((e) => e.batchGetFileInfos);
  const cacheNutexbFile = useNutexbStore((e) => e.cacheFile);

  const convertFile = (file: FileInfo) => {
    if (file.name.endsWith('.numatb')) {
      convertNumatbFile(file);
    } else if (file.name.endsWith('.nutexb')) {
      convertNutexbFile(file);
    }
  };

  const resetConversion = () => {
    resetNumatbConversion();
    resetNutexbConversion();
  };

  const checkExistingPreview = async (file: FileInfo, folderPath: string) => {
    try {
      const convertDirPath = await join(folderPath, CONVERT_DIR_NAME);
      const outputFileName = file.name.replace(".nutexb", "_convert.png");
      const previewPath = await join(convertDirPath, outputFileName);

      const previewExists = await exists(previewPath);
      if (previewExists) {
        return previewPath;
      }
    } catch (e) {
      console.error("Error checking existing preview:", e);
    }
    return null;
  };

  const handleFileTypeSelect = async (fileType: string) => {
    console.log("File creation completed for type:", fileType);

    // Refresh the file list after successful file creation
    if (folderPath) {
      setIsLoading(true);
      setLoadingProgress({ current: 0, total: 0 });
      
      try {
        const entries = await readDir(folderPath);
        const filteredEntries: any[] = entries
          .filter((entry) => entry.isFile)
          .filter((entry) => {
            // remove "__convert" folder and files
            if (entry.name === CONVERT_DIR_NAME) {
              return false;
            } else {
              return true;
            }
          })
          .map(entry => ({
            name: entry.name || "",
            path: folderPath + "/" + entry.name
          })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

        // PHASE 1: Immediately show basic file list
        setFiles(filteredEntries);
        setIsLoading(false);
        
        // PHASE 2: Load nutexb details in background
        const nutexbFiles = filteredEntries.filter(file => file.name.endsWith('.nutexb'));
        
        if (nutexbFiles.length > 0) {
          console.log(`Background refreshing ${nutexbFiles.length} nutexb files...`);
          setLoadingProgress({ current: 0, total: nutexbFiles.length });
          
          const startTime = performance.now();
          const batchSize = 10;
          const batches = [];
          
          for (let i = 0; i < nutexbFiles.length; i += batchSize) {
            const batch = nutexbFiles.slice(i, i + batchSize);
            batches.push(batch);
          }
          
          let processedCount = 0;
          
          for (const batch of batches) {
            try {
              // Use batch processing for better performance
              const batchResults = await batchGetNutexbFileInfos(batch);
              
              // Process preview checks in parallel
              const previewPromises = batch.map(async (file, index) => {
                const info = batchResults[index];
                if (info?.string) {
                  file.string = info.string;
                }
                
                try {
                  const existingPreview = await checkExistingPreview(file, folderPath);
                  if (existingPreview) {
                    file.previewPath = existingPreview;
                  }
                } catch (e) {
                  console.error(`Error checking preview for ${file.name}:`, e);
                }

                // Keep existing previewPath if available from previous state
                const existingFile = files.find(f => f.name === file.name);
                if (existingFile?.previewPath && !file.previewPath) {
                  file.previewPath = existingFile.previewPath;
                }
                
                processedCount++;
                setLoadingProgress({ current: processedCount, total: nutexbFiles.length });
                
                return file;
              });
              
              await Promise.all(previewPromises);
              
              // Update UI progressively
              setFiles(currentFiles => [...currentFiles]);
            } catch (e) {
              console.error(`Error processing batch:`, e);
              // Continue with individual processing as fallback
              for (const file of batch) {
                try {
                  const info = await getNutexbFileInfos(file);
                  file.string = info.string;
                  
                  const existingPreview = await checkExistingPreview(file, folderPath);
                  if (existingPreview) {
                    file.previewPath = existingPreview;
                  }
                } catch (fileError) {
                  console.error(`Error processing ${file.name}:`, fileError);
                }
                
                processedCount++;
                setLoadingProgress({ current: processedCount, total: nutexbFiles.length });
              }
              
              setFiles(currentFiles => [...currentFiles]);
            }
          }
          
          const endTime = performance.now();
          console.log(`Background nutexb refresh completed in ${(endTime - startTime).toFixed(2)} ms`);
          setLoadingProgress({ current: 0, total: 0 });
        }
      } catch (error) {
        console.error("Error refreshing directory:", error);
        setIsLoading(false);
        setLoadingProgress({ current: 0, total: 0 });
      }
    }
  };

  const handleFolderSelect = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
    });

    if (selected && !Array.isArray(selected)) {
      setFolderPath(selected);
      setIsLoading(true);
      
      try {
        const entries = await readDir(selected);
        const filteredEntries: any[] = entries
          .filter((entry) => entry.isFile)
          .filter((entry) => {
            // remove "__convert" folder and files
            if (entry.name === CONVERT_DIR_NAME) {
              return false;
            } else {
              return true;
            }
          })
          .map(entry => ({
            name: entry.name || "",
            path: selected + "/" + entry.name
          })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

        // PHASE 1: Immediately show basic file list to user
        setFiles(filteredEntries);
        setIsLoading(false); // User can see files immediately
        
        // PHASE 2: Load nutexb details in background (non-blocking)
        const nutexbFiles = filteredEntries.filter(file => file.name.endsWith('.nutexb'));
        
        if (nutexbFiles.length > 0) {
          console.log(`Loading ${nutexbFiles.length} nutexb files in background...`);
          const startTime = performance.now();
          
          // Process in batches to avoid overwhelming the system
          const batchSize = 10;
          const batches = [];
          
          for (let i = 0; i < nutexbFiles.length; i += batchSize) {
            const batch = nutexbFiles.slice(i, i + batchSize);
            batches.push(batch);
          }
          
          // Process batches with progressive updates using optimized batch processing
          for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            
            try {
              // Use batch processing for better performance
              const batchResults = await batchGetNutexbFileInfos(batch);
              
              // Process preview checks in parallel
              const previewPromises = batch.map(async (file, index) => {
                const info = batchResults[index];
                if (info?.string) {
                  file.string = info.string;
                }
                
                try {
                  const existingPreview = await checkExistingPreview(file, selected);
                  if (existingPreview) {
                    file.previewPath = existingPreview;
                  }
                } catch (e) {
                  console.error(`Error checking preview for ${file.name}:`, e);
                }
                
                return file;
              });
              
              await Promise.all(previewPromises);
            } catch (e) {
              console.error(`Error processing batch ${batchIndex + 1}:`, e);
              // Fallback to individual processing
              for (const file of batch) {
                try {
                  const info = await getNutexbFileInfos(file);
                  file.string = info.string;
                  
                  const existingPreview = await checkExistingPreview(file, selected);
                  if (existingPreview) {
                    file.previewPath = existingPreview;
                  }
                } catch (fileError) {
                  console.error(`Error processing ${file.name}:`, fileError);
                }
              }
            }
            
            // Update progress and UI
            const processedSoFar = (batchIndex + 1) * batchSize;
            const currentProgress = Math.min(processedSoFar, nutexbFiles.length);
            setLoadingProgress({ current: currentProgress, total: nutexbFiles.length });
            
            // Update UI progressively after each batch
            setFiles(currentFiles => [...currentFiles]);
            
            console.log(`Batch ${batchIndex + 1}/${batches.length} completed (${currentProgress}/${nutexbFiles.length} files)`);
          }
          
          const endTime = performance.now();
          console.log(`Background nutexb processing completed in ${(endTime - startTime).toFixed(2)} ms`);
          setLoadingProgress({ current: 0, total: 0 });
        }
        
      } catch (error) {
        console.error("Error reading directory:", error);
        setIsLoading(false);
      }
    }
  };

  const handleConvertAllNutexb = async () => {
    setIsConvertingNutexb(true);
    try {
      const nutexbFiles = files.filter(file => file.name.endsWith('.nutexb'));
      const updatedFiles = [...files];

      for (const file of nutexbFiles) {
        try {
          const cache = await cacheNutexbFile(file);
          if (cache) {
            const index = updatedFiles.findIndex(f => f.name === file.name);
            if (index !== -1) {
              updatedFiles[index] = {
                ...updatedFiles[index],
                previewPath: cache.outputPath,
                string: cache.nutexbInfo.string || updatedFiles[index].string
              };
            }
          }
        } catch (e) {
          console.error("Error converting Nutexb file:", file.name, e);
        }
      }

      setFiles(updatedFiles);
    } catch (error) {
      console.error("Error during batch conversion:", error);
    } finally {
      setIsConvertingNutexb(false);
    }
  };

  const handleTestRepack = async () => {
    try {
      setHandleDebugRepack(true);
      let normalized = folderPath.replace(/\//g, "\\");
      let structurePath = normalized + "_structure.json";
      const migration = await promptAndMigrateFhm2dStructureIfNeeded({
        structureJsonPath: structurePath,
        title: "Migrate FilesEdit FHM2D structure",
      });
      if (migration) {
        normalized = (migration.rootPath ?? normalized).replace(/\//g, "\\");
        structurePath = migration.structureJsonPath.replace(/\//g, "\\");
        setFolderPath(normalized);
      }
      const parentDir = normalized.split("\\").slice(0, -1).join("\\");
      const folderName = normalized.split("\\").pop() ?? "";
      const outputPath = `${parentDir}\\${folderName}.fhm2d`;

      await invoke("repack_fhm2d", {
        structureJsonPath: structurePath,
        outputPath,
        atomicWrite: true,
      });
      console.log("Repack completed");
    } catch (error) {
      console.error("Error during repack:", error);
    } finally {
      setHandleDebugRepack(false);
    }
  }

  const handleBatchReplaceNutexb = async () => {
    try {

      // Get all nutexb files
      const nutexbFiles = files.filter(file =>
        // file.string?.includes('_roughness') || file.string?.includes('_normal')
        // file.string?.includes('_roughness')
        file.name.includes('nutexb')
      );

      if (nutexbFiles.length === 0) {
        console.log("No nutexb files found");
        return;
      }

      // Open file dialog to select replacement image
      const imageFile = await open({
        multiple: false,
        filters: [
          {
            name: "Image Files",
            extensions: ["png", "jpg", "jpeg", "bmp", "gif", "webp", "tiff", "tif"],
          },
        ],
      });

      if (!imageFile || Array.isArray(imageFile)) {
        return;
      }

      setIsBatchReplacing(true);


      console.log(`Starting batch replacement for ${nutexbFiles.length} nutexb files with image: ${imageFile}`);

      // Get tool path
      const resourcePath = await resourceDir();
      const toolPath = resourcePath + "/tools/ultimate_tex_cli.exe";

      // Check if the tool exists
      const toolExists = await exists(toolPath);
      if (!toolExists) {
        throw new Error(`Tool not found: ${toolPath}`);
      }

      // Process each nutexb file
      for (const file of nutexbFiles) {
        try {
          console.log(`Processing ${file.name}...`);

          // First convert the file to get nutexb data with format information
          await convertNutexbFile(file);

          // Get the converted nutexb data to access format and mipmap info
          const nutexbData = useNutexbStore.getState().nutexbData;
          if (!nutexbData) {
            console.error(`No nutexb data available for ${file.name}, skipping...`);
            continue;
          }

          const selectedFormat = nutexbData.imageFormat.replace(/"/g, "");
          const hasMipmaps = (nutexbData.footer.mipmap_count || 0) > 1;
          const nutexbString = nutexbData.footer.string;

          // Build command to replace texture while preserving properties
          let command = `${toolPath} ${imageFile} ${file.path} --format ${selectedFormat} --nutexb-name=${nutexbString}`;
          if (!hasMipmaps) {
            command += " --no-mipmaps";
          }

          console.log(`Executing command: ${command}`);

          // Execute command with timeout
          const commandPromise = invoke("exec_shell_command", { command });
          const result = await Promise.race([
            commandPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Replacement timed out for ${file.name}`)), 15000))
          ]);

          if (typeof result === "string") {
            console.log(`Successfully replaced ${file.name}`);
          } else {
            console.error(`Failed to replace ${file.name}: Invalid command result`);
          }
        } catch (error) {
          console.error(`Error replacing ${file.name}:`, error);
        }
      }

      console.log("Batch replacement completed");

      // Refresh the file list to update previews
      if (folderPath) {
        setIsLoading(true);
        try {
          // Clear existing previews and re-scan
          const updatedFiles = files.map(file => ({
            ...file,
            previewPath: undefined
          }));
          setFiles(updatedFiles);

          // Trigger re-conversion of nutexb files for new previews
          setTimeout(async () => {
            await handleConvertAllNutexb();
          }, 1000);
        } catch (error) {
          console.error("Error refreshing after batch replacement:", error);
        } finally {
          setIsLoading(false);
        }
      }

    } catch (error) {
      console.error("Error during batch replacement:", error);
    } finally {
      setIsBatchReplacing(false);
    }
  };

  const handleDebugNumatb = async () => {
    try {
      setIsDebuggingNumatb(true);

      // Get all numatb files
      const numatbFiles = files.filter(file => file.name.endsWith('.numatb'));

      if (numatbFiles.length === 0) {
        console.log("No numatb files found");
        return;
      }

      console.log(`Starting debug processing for ${numatbFiles.length} numatb files`);

      // Get tool path
      const resourcePath = await resourceDir();
      const toolPath = resourcePath + "/tools/ssbh_data_json.exe";

      // Check if the tool exists
      const toolExists = await exists(toolPath);
      if (!toolExists) {
        throw new Error(`Tool not found: ${toolPath}`);
      }
      // Process each numatb file
      for (const file of numatbFiles) {
        console.log(`Processing ${file.name}...`);

        const baseName = file.name.replace('.numatb', '');
        const jsonPath = await join(folderPath, `${baseName}.json`);

        // Step 1: Convert numatb to json
        console.log(`Converting ${file.name} to JSON...`);
        const convertToJsonCommand = await invoke('exec_shell_command', {
          command: `${toolPath} ${file.path} ${jsonPath}`
        });

        if (typeof convertToJsonCommand !== "string") {
          console.error(`Failed to convert ${file.name} to JSON:`, convertToJsonCommand);
          continue;
        }

        // Step 2: Read and modify JSON file
        console.log(`Modifying JSON file for ${file.name}...`);
        const jsonBuffer = await readTextFile(jsonPath);
        const jsonContent = JSON.parse(jsonBuffer);
        jsonContent.minor_version = 6;
        for (const entry of jsonContent.entries) {
          //处理第一个numatb
          // 颜色出现不对或者白色才把DiffuseMap换成BaseColorMap，仅限第一个numatb
          // check is first numatb
          if (entry.shader_label == "") {
            entry.textures.forEach((texture: any) => {
              // 跳过_sky的DiffuseMap， skydome必须用DiffuseMap
              if (texture.param_id == "DiffuseMap" && !texture.data.includes("_sky")) {
                texture.param_id = "BaseColorMap";
              }
            });
          }

          //只做第二个有shader_label的numatb
          if (entry.shader_label != "") {
            switch (entry.shader_label) {
              // case "FeRendererMovable": // --保留
              //   entry.shader_label = "FeStandard";
              //   break;
              // case "FeRendererStatic": // --保留
              //   entry.shader_label = "FeStandard";
              //   break;
              case "FeRendererMovableVertexColor":
                entry.shader_label = "vstgStandard_VertexColor"; // 这个一定要换，不然有些贴图变白
                break;
              case "FeRendererMovableBlend2MultiUV":
                // entry.shader_label = "vstgStandard_Blend2VC_MultiUV_VC";  // 不知道是哪个
                // vstgStandard_Blend2VC_MultiUV_VC_LSMap
                entry.shader_label = "vstgStandard_MultiUV_LightAndShadowMap"; //应该是这个
                break;
                // case "FeRendererMovableMultiUVVertexColorAO":
                //   entry.shader_label = "";
                // case "vsngTransparentReflectionMultiUV_BeforeEffect":
                //   entry.shader_label = "";
                // break;
              // case "vsngTransparent_BeforeEffect": // 比如水面，透明贴图 --保留
              //   break
              // debug
              // case "FeStandard":
              //   entry.shader_label = "FeRendererMovable";
              //   break;
              default:
                break;
            }
            entry.textures.forEach((texture: any) => {
              // _sky 保留DiffuseMap
              if (texture.param_id == "DiffuseMap" && !texture.data.includes("_sky")) {
                texture.param_id = "BaseColorMap";
              }
            });
          }

        }

        // Write modified JSON back
        await writeTextFile(jsonPath, JSON.stringify(jsonContent, null, 2));

        // Step 3: Convert json back to numatb
        console.log(`Converting JSON back to numatb for ${file.name}...`);
        const convertToNumatbCommand = await invoke('exec_shell_command', {
          command: `${toolPath} ${jsonPath} ${file.path}`
        });

        if (typeof convertToNumatbCommand !== "string") {
          console.error(`Failed to convert JSON back to numatb for ${file.name}:`, convertToNumatbCommand);
          continue;
        }
      }
      console.log("Numatb debug processing completed");
    } catch (error) {
      console.error("Error during numatb debug processing:", error);
    } finally {
      setIsDebuggingNumatb(false);
    }
  };

  const handleBatchReplaceNutexb_With_Optimize = async () => {
    try {

      // Get all nutexb files
      const nutexbFiles = files.filter(file =>
        file.string?.includes('_roughness') || file.string?.includes('_normal')
      );

      if (nutexbFiles.length === 0) {
        console.log("No nutexb files found");
        return;
      }

      setIsBatchReplacing(true);

      console.log(`Starting batch replacement for ${nutexbFiles.length} nutexb files`);

      // Get tool paths
      const resourcePath = await resourceDir();
      const ultimateTexPath = resourcePath + "/tools/ultimate_tex_cli.exe";
      const pngquantPath = resourcePath + "/tools/pngquant.exe";

      // Check if tools exist
      const ultimateTexExists = await exists(ultimateTexPath);
      const pngquantExists = await exists(pngquantPath);

      if (!ultimateTexExists) {
        throw new Error(`Tool not found: ${ultimateTexPath}`);
      }

      if (!pngquantExists) {
        throw new Error(`Tool not found: ${pngquantPath}`);
      }

      // Process each nutexb file
      for (const file of nutexbFiles) {
        console.log(`Processing ${file.name}...`);

        // Step 1: Convert nutexb to png
        const cache = await cacheNutexbFile(file);
        if (!cache || !cache.outputPath) {
          console.error(`Failed to convert ${file.name} to PNG, skipping...`);
          throw new Error(`Failed to convert ${file.name} to PNG, skipping...`);
        }

        const pngPath = cache.outputPath;
        console.log(`Converted ${file.name} to PNG: ${pngPath}`);

        // Step 2: Optimize png using pngquant.exe
        const optimizedPath = pngPath.replace('.png', '_test.png');

        // Use Command API for better Windows encoding support
        const pngquantCommand = Command.create('exec-cmd', [
          "/c",
          pngquantPath,
          '--quality=0-1',
          '--output', optimizedPath,
          pngPath,
          "--speed=1",
          "--force"
        ], { encoding: 'utf-8' });

        const pngquantResult = await pngquantCommand.execute();
        if (pngquantResult.code !== 0) {
          console.error(`Failed to optimize PNG for ${file.name}:`, pngquantResult.stderr);
          throw new Error(`Failed to optimize PNG for ${file.name}:`);
        }
        console.log(`Successfully optimized PNG: ${optimizedPath}`);

        // Step 3: Get nutexb data for format information
        await convertNutexbFile(file);
        const nutexbData = useNutexbStore.getState().nutexbData;

        if (!nutexbData) {
          console.error(`No nutexb data available for ${file.name}, skipping...`);
          throw new Error(`No nutexb data available for ${file.name}, skipping...`);
        }

        const selectedFormat = nutexbData.imageFormat.replace(/"/g, "");
        const hasMipmaps = (nutexbData.footer.mipmap_count || 0) > 1;
        const nutexbString = nutexbData.footer.string;

        // Step 4: Replace nutexb with optimized png using ultimate_tex_cli.exe
        const replaceArgs = [optimizedPath, file.path, '--format', selectedFormat, '--nutexb-name=' + nutexbString];
        if (!hasMipmaps) {
          replaceArgs.push('--no-mipmaps');
        }

        // Use Command API for better Windows encoding support
        const replaceCommand = Command.create('exec-cmd', [
          "/c",
          ultimateTexPath,
          ...replaceArgs
        ], { encoding: 'utf-8' });

        console.log(`Replacing nutexb with optimized PNG: ${ultimateTexPath} ${replaceArgs.join(' ')}`);

        // Execute replacement command with timeout
        const replacePromise = replaceCommand.execute();
        const replaceResult = await Promise.race([
          replacePromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Replacement timed out for ${file.name}`)), 15000))
        ]);

        if (replaceResult && typeof replaceResult === 'object' && 'code' in replaceResult) {
          const result = replaceResult as { code: number; stderr?: string };
          if (result.code === 0) {
            console.log(`Successfully replaced ${file.name} with optimized PNG`);
          } else {
            console.error(`Failed to replace ${file.name}:`, result.stderr || 'Unknown error');
          }
        } else {
          console.error(`Failed to replace ${file.name}: Invalid command result`);
        }

      }

      console.log("Batch replacement completed");

      // Refresh the file list to update previews
      if (folderPath) {
        setIsLoading(true);
        try {
          // Clear existing previews and re-scan
          const updatedFiles = files.map(file => ({
            ...file,
            previewPath: undefined
          }));
          setFiles(updatedFiles);

          // Trigger re-conversion of nutexb files for new previews
          setTimeout(async () => {
            await handleConvertAllNutexb();
          }, 1000);
        } catch (error) {
          console.error("Error refreshing after batch replacement:", error);
        } finally {
          setIsLoading(false);
        }
      }

    } catch (error) {
      console.error("Error during batch replacement:", error);
    } finally {
      setIsBatchReplacing(false);
    }
  };

  const [isDebuggingReadJsonFiles, setIsDebuggingReadJsonFiles] = useState(false);
  const [isDebugToolsOpen, setIsDebugToolsOpen] = useState(false);
  const handleDebugReadJsonFiles = async () => {
    try {
      setIsDebuggingReadJsonFiles(true);

      // Get all numatb files
      const jsonFiles = files.filter(file => file.name.endsWith('.json'));

      if (jsonFiles.length === 0) {
        console.log("No json files found");
        return;
      }
      const newSet = new Set<string>();

      // Process each numatb file
      for (const file of jsonFiles) {

        const baseName = file.name.replace('.json', '');
        const jsonPath = await join(folderPath, `${baseName}.json`);
        // Step 2: Read and modify JSON file
        const jsonBuffer = await readTextFile(jsonPath);
        const jsonContent = JSON.parse(jsonBuffer);
        jsonContent.minor_version = 6;
        for (const entry of jsonContent.entries) {
          //只做第二个有shader_label的numatb
          if (entry.shader_label != "") {
            // console.log("Find, ", jsonPath);
            newSet.add(entry.shader_label);
            // if textures.param_id is DiffuseMap, log the jsonPath
            entry.textures.forEach((texture: any) => {
              if (texture.param_id == "DiffuseMap") {
                console.log("Find DiffuseMap, ", jsonPath);
                console.log(texture.data);
              }
            });
          }

        }
      }
      console.log(newSet);
    } catch (error) {
    } finally {
      setIsDebuggingReadJsonFiles(false);
    }
  };

  return (
    <div className="h-full">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight mb-4">Files Editor</h2>
        <div className="max-w-xl">
          <Label htmlFor="folder-input" className="text-sm font-medium mb-2 block text-muted-foreground">
            Select Folder
          </Label>
          <div className="relative">
            <FolderOpen className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
            <Input
              id="folder-input"
              value={folderPath}
              onClick={handleFolderSelect}
              readOnly
              placeholder="Click to select folder"
              className="pl-10 cursor-pointer hover:bg-muted/50 transition-colors"
            />
          </div>
        </div>
      </div>
      <div className="mb-4 flex gap-2">
        <Button onClick={handleTestRepack} disabled={handleDebugRepack} size="sm">
          {handleDebugRepack && <Loader2 className="animate-spin" />}
          Repack
        </Button>
        <Button
          onClick={handleConvertAllNutexb}
          disabled={isConvertingNutexb || files.filter(f => f.name.endsWith('.nutexb')).length === 0}
          size="sm"
          variant="outline"
        >
          {isConvertingNutexb && <Loader2 className="animate-spin mr-2" />}
          <ImageIcon className="h-4 w-4 mr-2" />
          Convert Nutexb to PNG
        </Button>
      </div>
      <div className="mb-4">
        <Collapsible open={isDebugToolsOpen} onOpenChange={setIsDebugToolsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-start p-2 h-auto">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Bug className="h-4 w-4" />
                Debug Tools
                <ChevronDown className={`h-4 w-4 transition-transform ${isDebugToolsOpen ? 'rotate-180' : ''}`} />
              </div>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2">
            <div className="flex gap-2 flex-wrap p-2 pt-0">
              <Button
                onClick={handleBatchReplaceNutexb}
                disabled={isBatchReplacing || files.filter(f => f.name.endsWith('.nutexb')).length === 0}
                size="sm"
                variant="destructive"
              >
                {isBatchReplacing && <Loader2 className="animate-spin mr-2" />}
                <Bug className="h-4 w-4 mr-2" />
                Debug Replace All Nutexb with selected image
              </Button>
              <Button
                onClick={handleBatchReplaceNutexb_With_Optimize}
                disabled={isBatchReplacing || files.filter(f => f.name.endsWith('.nutexb')).length === 0}
                size="sm"
                variant="destructive"
              >
                {isBatchReplacing && <Loader2 className="animate-spin mr-2" />}
                <Bug className="h-4 w-4 mr-2" />
                Debug Auto Replace Normal and Roughness Nutexb
              </Button>
              <Button
                onClick={handleDebugNumatb}
                disabled={isDebuggingNumatb || files.filter(f => f.name.endsWith('.numatb')).length === 0}
                size="sm"
              >
                {isDebuggingNumatb && <Loader2 className="animate-spin mr-2" />}
                <Bug className="h-4 w-4 mr-2" />
                Debug Numatb Files
              </Button>
              <Button
                onClick={handleDebugReadJsonFiles}
                disabled={isDebuggingReadJsonFiles}
                size="sm"
              >
                {isDebuggingReadJsonFiles && <Loader2 className="animate-spin mr-2" />}
                <Bug className="h-4 w-4 mr-2" />
                Debug Read Json Files
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div className="grid grid-cols-2 gap-6 flex-1">
        <div className="col-span-2 bg-card rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-foreground">Files</h3>
              {loadingProgress.total > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading nutexb files: {loadingProgress.current}/{loadingProgress.total}</span>
                  <div className="w-32 bg-secondary rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(loadingProgress.current / loadingProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            <FileTypeDialog
              onFileTypeSelect={handleFileTypeSelect}
              currentDirectory={folderPath}
            >
              <Button size="sm" variant="outline" className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add File
              </Button>
            </FileTypeDialog>
          </div>
          <FileList
            files={files}
            isLoading={isLoading}
            folderPath={folderPath}
            onFileSelect={convertFile}
            resetConversion={resetConversion}
          />
        </div>
      </div>
    </div>
  );
}
