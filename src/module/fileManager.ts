import { writeBinaryFile, BaseDirectory } from "@tauri-apps/api/fs";
import { Buffer } from "buffer";
// Write a binary file to the `$APPDATA/avatar.png` path

export const createBinaryFile = async (path: string, data: Buffer) => {
  writeBinaryFile(path, data, {})
    .then((e) => {
      console.log("save done");
    })
    .catch((err) => {
      console.log("save error", err);
    });
};
