import { create } from 'zustand';
import { invoke } from "@tauri-apps/api/core";
import { exists, mkdir, readTextFile } from "@tauri-apps/plugin-fs";
import { resourceDir, dirname, join } from "@tauri-apps/api/path";

const CONVERT_DIR_NAME = "__convert";

export interface FileInfo {
  name: string;
  path: string;
}

interface TextureInfo {
  param_id: string;
  data: string;
}

interface MaterialEntry {
  material_label: string;
  textures: TextureInfo[];
}

export interface NumatbData {
  major_version: number;
  minor_version: number;
  entries: MaterialEntry[];
}

interface NumatbStore {
  selectedFile: FileInfo | null;
  numatbData: NumatbData | null;
  isConverting: boolean;
  error: string | null;
  setSelectedFile: (file: FileInfo | null) => void;
  resetConversion: () => void;
  convertFile: (file: FileInfo) => Promise<void>;
}

export const useNumatbStore = create<NumatbStore>((set) => ({
  selectedFile: null,
  numatbData: null,
  isConverting: false,
  error: null,
  
  setSelectedFile: (file) => set({ selectedFile: file }),
  
  resetConversion: () => set({
    selectedFile: null,
    isConverting: false,
    error: null,
    numatbData: null
  }),

  convertFile: async (file) => {
    if (!file.name.endsWith('.numatb')) return;

    set({
      selectedFile: file,
      isConverting: true,
      numatbData: null,
      error: null
    });

    try {
      // Check if input file exists
      const inputFileExists = await exists(file.path);
      if (!inputFileExists) {
        throw new Error(`Input file not found: ${file.path}`);
      }

      const resourcePath = await resourceDir();
      // Check if the tool exists
      const toolPath = resourcePath + '/tools/ssbh_data_json.exe';
      const toolExists = await exists(toolPath);
      if (!toolExists) {
        throw new Error(`Tool not found: ${toolPath}`);
      }

      // Prepare output directory and file path
      const dirPath = await dirname(file.path);
      const convertDirPath = await join(dirPath, CONVERT_DIR_NAME);
      
      // Create convert directory if it doesn't exist
      const convertExists = await exists(convertDirPath);
      if (!convertExists) {
        try {
          await mkdir(convertDirPath, { recursive: true });
        } catch (error) {
          throw new Error(`Failed to create convert directory: ${error}`);
        }
      }
      
      const outputFileName = file.name.replace('.numatb', '_convert.json');
      const outputPath = await join(convertDirPath, outputFileName);
      
      // Execute command with a timeout
      const commandPromise = invoke('exec_shell_command', { 
        command: `${toolPath} ${file.path} ${outputPath}`,
      });
      
      // Race between command execution and timeout
      const result = await Promise.race([
        commandPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Command execution timed out")), 5000)
        )
      ]);

      if (typeof result === 'string') {
        // Wait a brief moment for the command to complete its I/O
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify output file exists before trying to read it
        const outputExists = await exists(outputPath);
        if (!outputExists) {
          throw new Error("Output file not found after command execution");
        }
        
        // Read and parse output file
        const jsonContent = await readTextFile(outputPath);
        const data = JSON.parse(jsonContent) as NumatbData;
        
        set({ numatbData: data });
      } else {
        throw new Error("Invalid command result");
      }
      console.log("Conversion successful");
    } catch (error) {
      let errorMessage = "Unknown error occurred";
      if (error instanceof Error) {
        // Map specific error cases to user-friendly messages
        if (error.message.includes("timed out")) {
          errorMessage = "Command took too long to complete";
        } else if (error.message.includes("not found")) {
          errorMessage = "Required file or tool not found";
        } else if (error.message.includes("Invalid command result")) {
          errorMessage = "Command returned unexpected result";
        } else {
          errorMessage = error.message;
        }
      }
      
      console.error("Error in execution:", error);
      set({ error: errorMessage });
    } finally {
      set({ isConverting: false });
    }
  }
}));
