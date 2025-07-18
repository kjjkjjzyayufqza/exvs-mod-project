import { create } from 'zustand';
import { invoke } from "@tauri-apps/api/core";
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { resourceDir, dirname, join } from "@tauri-apps/api/path";

export const CONVERT_DIR_NAME = "__convert";

export interface FileInfo {
  name: string;
  path: string;
}

// Updated type definitions to match the new JSON structure
interface AttributeData {
  Boolean?: number;
  Float?: number;
  Float1?: number;
  String1?: string;
  Vector4?: {
    x: number;
    y: number;
    z: number;
    w: number;
  };
  Sampler?: {
    wraps: string;
    wrapt: string;
    wrapr: string;
    min_filter: string;
    mag_filter: string;
    texture_filtering_type: string;
    border_color: {
      r: number;
      g: number;
      b: number;
      a: number;
    };
    unk11: number;
    unk12: number;
    lod_bias: number;
    max_anisotropy: string;
  };
  Unk7?: {
    r: number;
    g: number;
    b: number;
    a: number;
  };
}

interface MaterialAttribute {
  param_id: string;
  param: {
    data: AttributeData;
  };
}

interface MaterialEntry {
  material_label: string;
  attributes: MaterialAttribute[];
  shader_label: string;
}

export interface NumatbData {
  Matl: {
    V16: {
      entries: MaterialEntry[];
    };
  };
}

interface NumatbStore {
  selectedFile: FileInfo | null;
  numatbData: NumatbData | null;
  isConverting: boolean;
  isSaving: boolean;
  error: string | null;
  setSelectedFile: (file: FileInfo | null) => void;
  resetConversion: () => void;
  convertFile: (file: FileInfo) => Promise<void>;
  updateTextureAttribute: (materialIndex: number, attributeIndex: number, newValue: string) => void;
  saveFile: () => Promise<void>;
}

export const useNumatbStore = create<NumatbStore>((set, get) => ({
  selectedFile: null,
  numatbData: null,
  isConverting: false,
  isSaving: false,
  error: null,
  
  setSelectedFile: (file) => set({ selectedFile: file }),
  
  resetConversion: () => set({
    selectedFile: null,
    isConverting: false,
    isSaving: false,
    error: null,
    numatbData: null
  }),

  updateTextureAttribute: (materialIndex: number, attributeIndex: number, newValue: string) => {
    const state = get();
    if (!state.numatbData) return;

    const newData = { ...state.numatbData };
    if (newData.Matl?.V16?.entries?.[materialIndex]?.attributes?.[attributeIndex]) {
      newData.Matl.V16.entries[materialIndex].attributes[attributeIndex].param.data.String1 = newValue;
      set({ numatbData: newData });
    }
  },

  saveFile: async () => {
    const state = get();
    if (!state.selectedFile || !state.numatbData) return;

    set({ isSaving: true, error: null });

    try {
      const resourcePath = await resourceDir();
      const toolPath = resourcePath + '/tools/ssbh_lib_json.exe';
      const toolExists = await exists(toolPath);
      if (!toolExists) {
        throw new Error(`Tool not found: ${toolPath}`);
      }

      // Create temporary JSON file
      const dirPath = await dirname(state.selectedFile.path);
      const convertDirPath = await join(dirPath, CONVERT_DIR_NAME);
      
      const convertExists = await exists(convertDirPath);
      if (!convertExists) {
        await mkdir(convertDirPath, { recursive: true });
      }
      
      const tempJsonPath = await join(convertDirPath, state.selectedFile.name.replace('.numatb', '_temp.json'));
      
      // Write JSON data
      await writeTextFile(tempJsonPath, JSON.stringify(state.numatbData, null, 2));
      
      // Convert back to .numatb
      const outputPath = state.selectedFile.path;
      const commandPromise = invoke('exec_shell_command', { 
        command: `${toolPath} ${tempJsonPath} ${outputPath}`,
      });
      
      const result = await Promise.race([
        commandPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Command execution timed out")), 10000)
        )
      ]);

      if (typeof result === 'string') {
        console.log("Save successful");
      } else {
        throw new Error("Invalid command result");
      }
    } catch (error) {
      let errorMessage = "Unknown error occurred";
      if (error instanceof Error) {
        if (error.message.includes("timed out")) {
          errorMessage = "Save operation took too long to complete";
        } else if (error.message.includes("not found")) {
          errorMessage = "Required tool not found";
        } else {
          errorMessage = error.message;
        }
      }
      
      console.error("Error saving file:", error);
      set({ error: errorMessage });
    } finally {
      set({ isSaving: false });
    }
  },

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
      // Updated tool path to use ssbh_lib_json.exe
      const toolPath = resourcePath + '/tools/ssbh_lib_json.exe';
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
      
      const outputFileName = file.name.replace('.numatb', '.json');
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
