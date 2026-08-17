import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";

import type { ShlFileData, ShlRecord } from "./shlIoService";
import { formatModelIdLe, isShlDraftDirty, shlModelTypeLabel } from "./shlEditorUtils";

/** One SHL slot annotated with LE hex + resolved folder name for AI/debug paste. */
export type ShlClipboardRecord = ShlRecord & {
  index: number;
  modelIdLeHex: string;
  modelTypeLabel: string;
  folderName: string | null;
};

export type ShlClipboardExportPayload = {
  kind: "shl";
  filePath: string;
  dirty: boolean;
  /** Structure-JSON model-group names; index == folder_index. */
  modelFolderNames: string[];
  draft: ShlFileData;
  /** Present when base differs from draft (dirty session). */
  base: ShlFileData | null;
  recordsAnnotated: ShlClipboardRecord[];
};

export function buildShlClipboardExportPayload(input: {
  filePath: string;
  draft: ShlFileData;
  base?: ShlFileData | null;
  modelFolderNames?: readonly string[];
}): ShlClipboardExportPayload {
  const modelFolderNames = [...(input.modelFolderNames ?? [])];
  const base = input.base ?? null;
  const dirty = isShlDraftDirty(base, input.draft);
  const recordsAnnotated: ShlClipboardRecord[] = input.draft.records.map((r, index) => {
    const folderIndex = r.folderIndex >>> 0;
    return {
      index,
      modelId: r.modelId >>> 0,
      modelType: r.modelType >>> 0,
      folderIndex,
      unk1: r.unk1 >>> 0,
      slotIndex: r.slotIndex >>> 0,
      modelIdLeHex: formatModelIdLe(r.modelId),
      modelTypeLabel: shlModelTypeLabel(r.modelType),
      folderName:
        folderIndex < modelFolderNames.length ? (modelFolderNames[folderIndex] ?? null) : null,
    };
  });

  return {
    kind: "shl",
    filePath: input.filePath,
    dirty,
    modelFolderNames,
    draft: {
      version: input.draft.version >>> 0,
      reserved08: input.draft.reserved08 >>> 0,
      records: input.draft.records.map((r) => ({
        modelId: r.modelId >>> 0,
        modelType: r.modelType >>> 0,
        folderIndex: r.folderIndex >>> 0,
        unk1: r.unk1 >>> 0,
        slotIndex: r.slotIndex >>> 0,
      })),
      trailingData: [...input.draft.trailingData],
    },
    base: base
      ? {
          version: base.version >>> 0,
          reserved08: base.reserved08 >>> 0,
          records: base.records.map((r) => ({
            modelId: r.modelId >>> 0,
            modelType: r.modelType >>> 0,
            folderIndex: r.folderIndex >>> 0,
            unk1: r.unk1 >>> 0,
            slotIndex: r.slotIndex >>> 0,
          })),
          trailingData: [...base.trailingData],
        }
      : null,
    recordsAnnotated,
  };
}

/**
 * Serialize the live SHL editor draft (plus folder-name resolution) for clipboard export.
 * Intended for pasting into an AI assistant for shell-slot debugging.
 */
export async function copyShlJsonToClipboard(
  payload: ShlClipboardExportPayload,
): Promise<boolean> {
  try {
    await writeText(JSON.stringify(payload, null, 2));
    toast.success("Copied SHL JSON to clipboard");
    return true;
  } catch {
    toast.error("Failed to copy SHL JSON to clipboard");
    return false;
  }
}
