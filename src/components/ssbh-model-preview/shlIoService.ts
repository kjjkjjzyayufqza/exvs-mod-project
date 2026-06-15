import { invoke } from "@tauri-apps/api/core";

/** One model slot in a `shell_*.shl` (SHLL) control bin. Mirrors Rust `format::shl::ShlRecord`. */
export type ShlRecord = {
  /** Proprietary name-hash of the model folder name. */
  modelId: number;
  /** 0 main body (required), 1 ?, 2 assist, 3 part. */
  modelType: number;
  /** Index into the structure-JSON model folder order. */
  folderIndex: number;
  unk1: number;
  slotIndex: number;
};

/** Parsed `shell_*.shl` file. Mirrors Rust `format::shl::ShlFile` (source raw is backend-only). */
export type ShlFileData = {
  version: number;
  reserved08: number;
  records: ShlRecord[];
  /** Trailing bytes after the last record (empty in all samples), preserved verbatim. */
  trailingData: number[];
};

export async function shlReadFile(filePath: string): Promise<ShlFileData> {
  const data = await invoke<ShlFileData>("parse_shl_file", { path: filePath });
  return {
    version: data.version >>> 0,
    reserved08: data.reserved08 >>> 0,
    records: (data.records ?? []).map((r) => ({
      modelId: r.modelId >>> 0,
      modelType: r.modelType >>> 0,
      folderIndex: r.folderIndex >>> 0,
      unk1: r.unk1 >>> 0,
      slotIndex: r.slotIndex >>> 0,
    })),
    trailingData: data.trailingData ?? [],
  };
}

export async function shlWriteFile(payload: {
  filePath: string;
  file: ShlFileData;
}): Promise<void> {
  await invoke("build_shl_file", {
    fileJson: {
      version: payload.file.version >>> 0,
      reserved08: payload.file.reserved08 >>> 0,
      records: payload.file.records.map((r) => ({
        modelId: r.modelId >>> 0,
        modelType: r.modelType >>> 0,
        folderIndex: r.folderIndex >>> 0,
        unk1: r.unk1 >>> 0,
        slotIndex: r.slotIndex >>> 0,
      })),
      trailingData: payload.file.trailingData ?? [],
    },
    outputPath: payload.filePath,
  });
}
