import { invoke } from "@tauri-apps/api/core";

export type JnttblEntryRow = {
  hashId: number;
  boneIndex: number;
};

export type JnttblNusktbProbe = {
  mayaPath: string;
  plainPath: string;
  autoLoadedPath: string | null;
  nusktbFound: boolean;
  boneNames: string[] | null;
  loadError: string | null;
};

export type JnttblReadResult = {
  version: number;
  boneCount: number;
  flag: number;
  byteLength: number;
  entries: JnttblEntryRow[];
  hexDump: string;
  nusktb: JnttblNusktbProbe;
};

export type JnttblEditorDocument = JnttblReadResult & {
  nusktbPathOverride: string | null;
};

export async function jnttblReadFile(filePath: string): Promise<JnttblReadResult> {
  return invoke<JnttblReadResult>("jnttbl_read_file", { filePath });
}

export async function jnttblWriteFile(payload: {
  filePath: string;
  version: number;
  boneCount: number;
  flag: number;
  entries: JnttblEntryRow[];
}): Promise<void> {
  await invoke("jnttbl_write_file", {
    payload: {
      filePath: payload.filePath,
      version: payload.version,
      boneCount: payload.boneCount,
      flag: payload.flag,
      entries: payload.entries.map((e) => ({
        hashId: e.hashId >>> 0,
        boneIndex: e.boneIndex >>> 0,
      })),
    },
  });
}

export async function ssbhReadNusktbBoneNames(filePath: string): Promise<string[]> {
  return invoke<string[]>("ssbh_read_nusktb_bone_names", { filePath });
}
