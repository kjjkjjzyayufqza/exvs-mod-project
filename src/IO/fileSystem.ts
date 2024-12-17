import { Resource, invoke } from '@tauri-apps/api/core';
import { readFile } from '@tauri-apps/plugin-fs';

export function IOReadFile(path: string): Promise<ArrayBuffer> {
  return invoke("read_file", { path });
}