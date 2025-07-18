import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { exists, mkdir, readTextFile } from "@tauri-apps/plugin-fs";
import { resourceDir, dirname, basename, join } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";

const CONVERT_DIR_NAME = ".\\__convert";

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
  parseNutexbInfo: (output: string) => { nutexbInfo: Partial<NutexbFooter>; imageFormat: string };
  getFileInfos: (file: FileInfo) => Promise<FileInfo>;
  setSelectedFile: (file: FileInfo | null) => void;
  resetConversion: () => void;
  convertFile: (file: FileInfo) => Promise<void>;
  setSelectedFormat: (format: ImageFormat) => void;
  setHasMipmaps: (hasMipmaps: boolean) => void;
  replaceTexture: () => Promise<void>;
  cacheFile: (file: FileInfo) => Promise<{ nutexbInfo: Partial<NutexbFooter>; imageFormat: string; outputPath: string } | null>;
  convertImageToNutexb: (imagePath: string, outputPath: string, nutexbName: string) => Promise<void>;
}

const resourcePath = await resourceDir();
const toolPath = resourcePath + "/tools/ultimate_tex_cli.exe";

export const useNutexbStore = create<NutexbStore>((set, get) => ({
  selectedFile: null,
  nutexbData: null,
  isConverting: false,
  error: null,
  previewImagePath: null,
  selectedFormat: "BC7RgbaUnorm",
  hasMipmaps: true,

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
        const command = `${toolPath} ${filePath} --info`;
        const result = await invoke("exec_shell_command", { command });

        if (typeof result !== "string") {
          throw new Error("Invalid command result");
        }

        const { nutexbInfo } = get().parseNutexbInfo(result);
        resolve({ ...file, ...nutexbInfo });
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

      // Check if the tool exists
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

      const outputFileName = file.name.replace(".nutexb", "_convert.png");
      const outputPath = await join(convertDirPath, outputFileName);

      // Execute command
      const commandPromise = invoke("exec_shell_command", {
        command: `${toolPath} ${file.path} ${outputPath}`,
      });

      // Race between command execution and timeout
      const result = await Promise.race([commandPromise, new Promise((_, reject) => setTimeout(() => reject(new Error("Command execution timed out")), 10000))]);

      if (typeof result === "string") {
        const { nutexbInfo, imageFormat } = get().parseNutexbInfo(result);
        console.log("Nutexb Info:", nutexbInfo);
        // Verify output file exists
        const outputExists = await exists(outputPath);
        if (!outputExists) {
          throw new Error("Output PNG file not found after command execution");
        }
        console.log("Output Path:", outputPath);
        set({
          nutexbData: {
            footer: nutexbInfo as NutexbFooter,
            imageFormat,
          },
          previewImagePath: outputPath,
          selectedFormat: imageFormat.replace(/"/g, "") as ImageFormat,
          hasMipmaps: (nutexbInfo.mipmap_count || 0) > 1,
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
      console.log("nutexbData.footer.string:", nutexbData.footer.string);
      // Build command with format and mipmaps options
      let command = `${toolPath} ${imageFile} ${outputPath} --format ${selectedFormat} --nutexb-name=${nutexbData.footer.string}`;
      if (!hasMipmaps) {
        command += " --no-mipmaps";
      }
      console.log("Command:", command);
      // Execute command
      const result = await invoke("exec_shell_command", { command });
      if (typeof result === "string") {
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

      // Check if the tool exists
      const toolExists = await exists(toolPath);
      if (!toolExists) {
        console.error(`Tool not found for caching: ${toolPath}`);
        return null;
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
          console.error(`Failed to create convert directory for caching: ${error}`);
          return null;
        }
      }

      const outputFileName = file.name.replace(".nutexb", "_convert.png");
      const outputPath = await join(convertDirPath, outputFileName);

      // Execute command to generate the preview
      const commandPromise = invoke("exec_shell_command", {
        command: `${toolPath} ${file.path} ${outputPath}`,
      });

      // Race between command execution and timeout (use a shorter timeout for caching)
      const result = await Promise.race([commandPromise, new Promise((_, reject) => setTimeout(() => reject(new Error("Caching timed out")), 5000))]);
      if (typeof result === "string") {
        // Verify output file exists
        const { nutexbInfo } = get().parseNutexbInfo(result);
        const outputExists = await exists(outputPath);
        if (!outputExists) {
          console.error("Output PNG file not found after caching");
          return null;
        }
        return {
          nutexbInfo: nutexbInfo,
          imageFormat: nutexbInfo.image_format || "",
          outputPath,
        };
      } else {
        console.error("Invalid command result during caching");
        return null;
      }
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

      // Check if the tool exists
      const toolExists = await exists(toolPath);
      if (!toolExists) {
        throw new Error(`Tool not found: ${toolPath}`);
      }

      // Build command with format and mipmaps options
      let command = `${toolPath} ${imagePath} ${outputPath} --format ${selectedFormat} --nutexb-name=${nutexbName}`;
      if (!hasMipmaps) {
        command += " --no-mipmaps";
      }

      console.log("Converting image to nutexb:", command);
      
      // Execute command with timeout
      const commandPromise = invoke("exec_shell_command", { command });
      const result = await Promise.race([
        commandPromise, 
        new Promise((_, reject) => setTimeout(() => reject(new Error("Conversion timed out")), 15000))
      ]);

      if (typeof result === "string") {
        // Verify output file exists
        const outputExists = await exists(outputPath);
        if (!outputExists) {
          throw new Error("Output nutexb file not found after conversion");
        }
        console.log("Image to nutexb conversion successful");
      } else {
        throw new Error("Invalid command result during conversion");
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
}));
