import { create } from 'zustand';
import { invoke } from "@tauri-apps/api/core";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { resourceDir } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import { dirname, basename } from "@tauri-apps/api/path";

export interface FileInfo {
  name: string;
  path: string;
}

export interface NutexbFooter {
  string: string;
  width: number;
  height: number;
  depth: number;
  image_format: string;
  mipmap_count: number;
  layer_count: number;
  data_size: number;
}

export interface NutexbData {
  footer: NutexbFooter;
  imageFormat: string;
}

export type ImageFormat = 
  | "R8Unorm"
  | "Rgba8Unorm"
  | "Rgba8UnormSrgb"
  | "Rgba32Float"
  | "Bgra8Unorm"
  | "Bgra8UnormSrgb"
  | "BC1RgbaUnorm"
  | "BC1RgbaUnormSrgb"
  | "BC2RgbaUnorm"
  | "BC2RgbaUnormSrgb"
  | "BC3RgbaUnorm"
  | "BC3RgbaUnormSrgb"
  | "BC4RUnorm"
  | "BC4RSnorm"
  | "BC5RgUnorm"
  | "BC5RgSnorm"
  | "BC6hRgbUfloat"
  | "BC6hRgbSfloat"
  | "BC7RgbaUnorm"
  | "BC7RgbaUnormSrgb";

interface NutexbStore {
  selectedFile: FileInfo | null;
  nutexbData: NutexbData | null;
  isConverting: boolean;
  error: string | null;
  previewImagePath: string | null;
  selectedFormat: ImageFormat;
  hasMipmaps: boolean;
  setSelectedFile: (file: FileInfo | null) => void;
  resetConversion: () => void;
  convertFile: (file: FileInfo) => Promise<void>;
  setSelectedFormat: (format: ImageFormat) => void;
  setHasMipmaps: (hasMipmaps: boolean) => void;
  replaceTexture: () => Promise<void>;
}

export const useNutexbStore = create<NutexbStore>((set, get) => ({
  selectedFile: null,
  nutexbData: null,
  isConverting: false,
  error: null,
  previewImagePath: null,
  selectedFormat: "BC7RgbaUnorm",
  hasMipmaps: true,
  
  setSelectedFile: (file) => set({ selectedFile: file }),
  
  resetConversion: () => set({
    selectedFile: null,
    isConverting: false,
    error: null,
    nutexbData: null,
    previewImagePath: null
  }),

  setSelectedFormat: (format) => set({ selectedFormat: format }),
  
  setHasMipmaps: (hasMipmaps) => set({ hasMipmaps }),

  convertFile: async (file) => {
    if (!file.name.endsWith('.nutexb')) return;

    set({
      selectedFile: file,
      isConverting: true,
      nutexbData: null,
      error: null,
      previewImagePath: null
    });

    try {
      // Check if input file exists
      const inputFileExists = await exists(file.path);
      if (!inputFileExists) {
        throw new Error(`Input file not found: ${file.path}`);
      }

      const resourcePath = await resourceDir();
      // Check if the tool exists
      const toolPath = resourcePath + '/tools/ultimate_tex_cli.exe';
      const toolExists = await exists(toolPath);
      if (!toolExists) {
        throw new Error(`Tool not found: ${toolPath}`);
      }

      // Prepare output file path
      const outputFileName = file.name.replace('.nutexb', '_convert.png');
      const outputPath = file.path.replace(file.name, outputFileName);
      
      // Execute command
      const commandPromise = invoke('exec_shell_command', { 
        command: `${toolPath} ${file.path} ${outputPath}`,
      });
      
      // Race between command execution and timeout
      const result = await Promise.race([
        commandPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Command execution timed out")), 10000)
        )
      ]);

      if (typeof result === 'string') {
        // Parse the command output to extract nutexb information
        const lines = result.split('\n');
        const nutexbInfo: Partial<NutexbFooter> = {};
        let imageFormat = "";
        
        for (const line of lines) {
          if (line.includes("Name:")) {
            nutexbInfo.string = line.split("Name:")[1].trim();
          } else if (line.includes("Dimensions:")) {
            const dimensions = line.split("Dimensions:")[1].trim().split("x");
            nutexbInfo.width = parseInt(dimensions[0]);
            nutexbInfo.height = parseInt(dimensions[1]);
            nutexbInfo.depth = parseInt(dimensions[2]);
          } else if (line.includes("NutexbFormat:")) {
            nutexbInfo.image_format = line.split("NutexbFormat:")[1].trim();
          } else if (line.includes("Format:")) {
            imageFormat = line.split("Format:")[1].trim();
          } else if (line.includes("Mipmap Count:")) {
            nutexbInfo.mipmap_count = parseInt(line.split("Mipmap Count:")[1].trim());
          } else if (line.includes("Layer Count:")) {
            nutexbInfo.layer_count = parseInt(line.split("Layer Count:")[1].trim());
          } else if (line.includes("Data Size:")) {
            const sizeText = line.split("Data Size:")[1].trim();
            nutexbInfo.data_size = parseInt(sizeText.split(" ")[0]);
          }
        }
        console.log("Nutexb Info:", nutexbInfo);
        // Verify output file exists
        const outputExists = await exists(outputPath);
        if (!outputExists) {
          throw new Error("Output PNG file not found after command execution");
        }
        
        set({ 
          nutexbData: { 
            footer: nutexbInfo as NutexbFooter,
            imageFormat
          },
          previewImagePath: outputPath,
          selectedFormat: imageFormat.replace(/"/g, '') as ImageFormat,
          hasMipmaps: (nutexbInfo.mipmap_count || 0) > 1
        });
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
  },

  replaceTexture: async () => {
    const { selectedFile, selectedFormat, hasMipmaps } = get();
    
    if (!selectedFile) {
      set({ error: "No file selected" });
      return;
    }

    try {
      set({ isConverting: true, error: null });

      // Open file dialog to select any image
      const imageFile = await open({
        multiple: false,
        filters: [{
          name: 'Image Files',
          extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp', 'tiff', 'tif']
        }]
      });

      if (!imageFile || Array.isArray(imageFile)) {
        set({ isConverting: false });
        return;
      }

      const resourcePath = await resourceDir();
      const toolPath = resourcePath + '/tools/ultimate_tex_cli.exe';
      
      // Get the directory of the original nutexb file
      const fileDir = await dirname(selectedFile.path);
      const nutexbData = get().nutexbData;
      if (!nutexbData) {
        throw new Error("No nutexb data available");
      }

      // Construct the output path to overwrite the original file
      const outputPath = selectedFile.path;
      console.log("nutexbData.footer.string:", nutexbData.footer.string);
      // Build command with format and mipmaps options
      let command = `${toolPath} ${imageFile} ${outputPath} --format ${selectedFormat} --nutexb-name=${nutexbData.footer.string}`;
      if (!hasMipmaps) {
        command += " --no-mipmaps";
      }
      console.log("Command:", command);
      // Execute command
      const result = await invoke('exec_shell_command', { command });
      if (typeof result === 'string') {
        // After successful replacement, reload the file to update the UI
        await get().convertFile(selectedFile);
      } else {
        throw new Error("Failed to replace texture");
      }
    } catch (error) {
      console.error("Error in texture replacement:", error);
      let errorMessage = "Failed to replace texture";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      set({ error: errorMessage });
    } finally {
      set({ isConverting: false });
    }
  }
}));
