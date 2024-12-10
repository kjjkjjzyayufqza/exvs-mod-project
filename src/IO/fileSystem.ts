import { Resource, invoke } from '@tauri-apps/api/core';

export function IOReadFile(path: string): Promise<string> {
  return invoke("read_file", { path });
}