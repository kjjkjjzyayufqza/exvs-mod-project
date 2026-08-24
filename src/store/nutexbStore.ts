import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { exists, mkdir } from "@tauri-apps/plugin-fs";
import { dirname, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { readNutexbTextureName } from "../utils/nutexbUtils";

const CONVERT_DIR_NAME = "__convert";

type NutexbInfoDto = {
  name: string;
  width: number;
  height: number;
  depth: number;
  imageFormat: string;
  mipmapCount: number;
  layerCount: number;
  dataSize: number;
  isSwizzled: boolean;
};

function footerFromNutexbInfo(info: NutexbInfoDto): NutexbFooter {
  return {
    string: info.name,
    width: info.width,
    height: info.height,
    depth: info.depth,
    image_format: info.imageFormat,
    mipmap_count: info.mipmapCount,
    layer_count: info.layerCount,
    data_size: info.dataSize,
  };
}

export interface FileInfo extends Partial<NutexbFooter> {
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
  fileInfoCache: Map<string, { info: FileInfo; timestamp: number; fileSize: number }>;
  toolExistsCache: { exists: boolean; timestamp: number } | null;
  readNutexbTextureName: (filePath: string) => Promise<string>;
  parseNutexbInfo: (output: string) => { nutexbInfo: Partial<NutexbFooter>; imageFormat: string };
  getFileInfos: (file: FileInfo) => Promise<FileInfo>;
  batchGetFileInfos: (files: FileInfo[]) => Promise<FileInfo[]>;
  setSelectedFile: (file: FileInfo | null) => void;
  resetConversion: () => void;
  convertFile: (file: FileInfo) => Promise<void>;
  setSelectedFormat: (format: ImageFormat) => void;
  setHasMipmaps: (hasMipmaps: boolean) => void;
  replaceTexture: () => Promise<void>;
  cacheFile: (file: FileInfo) => Promise<{ nutexbInfo: Partial<NutexbFooter>; imageFormat: string; outputPath: string } | null>;
  convertImageToNutexb: (imagePath: string, outputPath: string, nutexbName: string) => Promise<void>;
  convertImageToNutexbInternal: (imagePath: string, outputPath: string, nutexbName: string) => Promise<void>;
  clearCache: () => void;
  checkToolExists: () => Promise<boolean>;
}

export const useNutexbStore = create<NutexbStore>((set, get) => ({
  selectedFile: null,
  nutexbData: null,
  isConverting: false,
  error: null,
  previewImagePath: null,
  selectedFormat: "BC7RgbaUnorm",
  hasMipmaps: true,
  fileInfoCache: new Map(),
  toolExistsCache: null,

  // Helper function to read texture name from nutexb file binary data
  readNutexbTextureName: readNutexbTextureName,

  // Helper function to parse nutexb information from command output
  parseNutexbInfo: (output: string): { nutexbInfo: Partial<NutexbFooter>; imageFormat: string } => {
    const lines = output.split("\n");
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

    return { nutexbInfo, imageFormat };
  },

  getFileInfos: async (file): Promise<FileInfo> => {
    return new Promise(async (resolve, reject) => {
      try {
        const filePath = file.path;
        
        // Always fetch fresh data - no time-based caching
        // (Cache is only used for duplicate requests within the same batch)

        const info = await invoke<NutexbInfoDto>("nutexb_read_info", { inputPath: filePath });
        const nutexbInfo = footerFromNutexbInfo(info);
        const fileInfo = { ...file, ...nutexbInfo };
        
        // Store result without time-based caching (only for deduplication within same batch)
        const cache = get().fileInfoCache;
        cache.set(filePath, {
          info: fileInfo,
          timestamp: Date.now(),
          fileSize: 0
        });
        
        resolve(fileInfo);
      } catch (error) {
        console.error("Error getting file info:", error);
        reject(`Failed to get file info: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    });
  },

  setSelectedFile: (file) => set({ selectedFile: file }),

  resetConversion: () =>
    set({
      selectedFile: null,
      isConverting: false,
      error: null,
      nutexbData: null,
      previewImagePath: null,
    }),

  setSelectedFormat: (format) => set({ selectedFormat: format }),

  setHasMipmaps: (hasMipmaps) => set({ hasMipmaps }),

  convertFile: async (file) => {
    if (!file.name.endsWith(".nutexb")) return;

    set({
      selectedFile: file,
      isConverting: true,
      nutexbData: null,
      error: null,
      previewImagePath: null,
    });

    try {
      // Check if input file exists
      const inputFileExists = await exists(file.path);
      if (!inputFileExists) {
        throw new Error(`Input file not found: ${file.path}`);
      }

      const info = await invoke<NutexbInfoDto>("nutexb_read_info", { inputPath: file.path });
      const textureName = info.name || (await get().readNutexbTextureName(file.path));
      const dirPath = await dirname(file.path);
      const convertDirPath = await join(dirPath, CONVERT_DIR_NAME);
      if (!(await exists(convertDirPath))) {
        await mkdir(convertDirPath, { recursive: true });
      }
      const outputPath = await join(convertDirPath, `${textureName}.png`);
      await invoke("nutexb_export_png", { inputPath: file.path, outputPath });
      const footer = footerFromNutexbInfo(info);
      set({
        nutexbData: {
          footer,
          imageFormat: info.imageFormat,
        },
        previewImagePath: outputPath,
        selectedFormat: info.imageFormat.replace(/"/g, "") as ImageFormat,
        hasMipmaps: (info.mipmapCount || 0) > 1,
      });
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
        filters: [
          {
            name: "Image Files",
            extensions: ["png", "jpg", "jpeg", "bmp", "gif", "webp", "tiff", "tif"],
          },
        ],
      });

      if (!imageFile || Array.isArray(imageFile)) {
        set({ isConverting: false });
        return;
      }

      // Get the directory of the original nutexb file
      const nutexbData = get().nutexbData;
      if (!nutexbData) {
        throw new Error("No nutexb data available");
      }

      // Construct the output path to overwrite the original file
      const outputPath = selectedFile.path;
      await invoke("image_to_nutexb", {
        imagePath: imageFile,
        outputNutexbPath: outputPath,
        nutexbName: nutexbData.footer.string,
        ddsFormat: selectedFormat,
        generateMipmaps: hasMipmaps,
      });
      await get().convertFile(selectedFile);
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
  },

  cacheFile: async (file) => {
    if (!file.name.endsWith(".nutexb")) return null;

    try {
      // Check if input file exists
      const inputFileExists = await exists(file.path);
      if (!inputFileExists) {
        console.error(`Input file not found for caching: ${file.path}`);
        return null;
      }

      const info = await invoke<NutexbInfoDto>("nutexb_read_info", { inputPath: file.path });
      const textureName = info.name || (await get().readNutexbTextureName(file.path));
      const dirPath = await dirname(file.path);
      const convertDirPath = await join(dirPath, CONVERT_DIR_NAME);
      if (!(await exists(convertDirPath))) {
        await mkdir(convertDirPath, { recursive: true });
      }
      const outputPath = await join(convertDirPath, `${textureName}.png`);
      await invoke("nutexb_export_png", { inputPath: file.path, outputPath });
      const nutexbInfo = footerFromNutexbInfo(info);
      return {
        nutexbInfo,
        imageFormat: info.imageFormat,
        outputPath,
      };
    } catch (error) {
      console.error("Error during texture caching:", error);
      return null;
    }
  },

  convertImageToNutexb: async (imagePath, outputPath, nutexbName) => {
    const { selectedFormat, hasMipmaps } = get();

    try {
      set({ isConverting: true, error: null });

      // Check if image file exists
      const imageExists = await exists(imagePath);
      if (!imageExists) {
        throw new Error(`Image file not found: ${imagePath}`);
      }

      await invoke("image_to_nutexb", {
        imagePath,
        outputNutexbPath: outputPath,
        nutexbName,
        ddsFormat: selectedFormat,
        generateMipmaps: hasMipmaps,
      });
      if (!(await exists(outputPath))) {
        throw new Error("Output nutexb file not found after conversion");
      }
    } catch (error) {
      console.error("Error in image to nutexb conversion:", error);
      let errorMessage = "Failed to convert image to nutexb";
      if (error instanceof Error) {
        if (error.message.includes("timed out")) {
          errorMessage = "Conversion took too long to complete";
        } else if (error.message.includes("not found")) {
          errorMessage = "Required file or tool not found";
        } else {
          errorMessage = error.message;
        }
      }
      set({ error: errorMessage });
      throw error;
    } finally {
      set({ isConverting: false });
    }
  },

  convertImageToNutexbInternal: async (imagePath, outputPath, nutexbName) => {
    const { selectedFormat, hasMipmaps } = get();

    try {
      // Check if image file exists
      const imageExists = await exists(imagePath);
      if (!imageExists) {
        throw new Error(`Image file not found: ${imagePath}`);
      }

      await invoke("image_to_nutexb", {
        imagePath,
        outputNutexbPath: outputPath,
        nutexbName,
        ddsFormat: selectedFormat,
        generateMipmaps: hasMipmaps,
      });
      if (!(await exists(outputPath))) {
        throw new Error("Output nutexb file not found after conversion");
      }
    } catch (error) {
      console.error("Error in image to nutexb conversion (internal):", error);
      throw error;
    }
  },

  checkToolExists: async (): Promise<boolean> => {
    set({ toolExistsCache: { exists: true, timestamp: Date.now() } });
    return true;
  },

  batchGetFileInfos: async (files: FileInfo[]): Promise<FileInfo[]> => {
    const results: FileInfo[] = [];
    const cache = get().fileInfoCache;
    cache.clear();
    
    // Process all files fresh (no time-based caching)
    console.log(`Processing ${files.length} files (fresh read)`);
    
    for (const file of files) {
      try {
        const info = await get().getFileInfos(file);
        results.push(info);
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        // Add file without extra info if processing fails
        results.push(file);
      }
    }
    
    return results;
  },

  clearCache: () => {
    set({
      fileInfoCache: new Map(),
      toolExistsCache: null
    });
  },
}));
