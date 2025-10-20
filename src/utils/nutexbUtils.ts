import { readFile } from "@tauri-apps/plugin-fs";

/**
 * Read the real texture name from a nutexb file's binary data
 * @param filePath Path to the nutexb file
 * @returns Promise<string> The texture name
 * @throws Error if the file format is invalid or texture name cannot be read
 */
export async function readNutexbTextureName(filePath: string): Promise<string> {
  try {
    // Read the entire file as binary data
    const fileData = await readFile(filePath);
    const fileSize = fileData.length;

    // Calculate offset: fileSize - 0x70
    const nameOffset = fileSize - 0x70;

    if (nameOffset < 0 || nameOffset + 4 > fileSize) {
      throw new Error("Invalid file size or format");
    }

    // Check for "46XT" prefix (0x34, 0x36, 0x58, 0x54)
    const prefix = fileData.slice(nameOffset, nameOffset + 4);
    if (prefix[0] !== 0x34 || prefix[1] !== 0x36 || prefix[2] !== 0x58 || prefix[3] !== 0x54) {
      throw new Error("Invalid nutexb format: missing 46XT prefix");
    }

    // Read string starting from nameOffset + 4 until null terminator (0x00)
    const stringStart = nameOffset + 4;
    let stringEnd = stringStart;

    while (stringEnd < fileSize && fileData[stringEnd] !== 0x00) {
      stringEnd++;
    }

    if (stringEnd === stringStart) {
      throw new Error("Empty texture name");
    }

    // Convert bytes to string
    const nameBytes = fileData.slice(stringStart, stringEnd);
    const textureName = new TextDecoder('utf-8').decode(nameBytes);

    return textureName;
  } catch (error) {
    console.error("Error reading nutexb texture name:", error);
    throw error;
  }
}
