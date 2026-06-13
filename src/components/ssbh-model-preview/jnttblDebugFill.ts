import type { JnttblEditorDocument } from "./jnttblIoService";

import { crc32IeeeUint32 } from "@/utils/crc32Ieee";

/** @deprecated Use crc32IeeeUint32 from @/utils/crc32Ieee */
export function crc32IeeeU32Utf8String(input: string): number {
  return crc32IeeeUint32(input);
}

function randomSalt(): string {
  return `${crypto.randomUUID()}${Math.random().toString(36).slice(2)}`;
}

export type DebugFillMissingJnttblResult = {
  document: JnttblEditorDocument;
  addedCount: number;
};

/**
 * For each skeleton bone index that does not appear in any entry's bone index,
 * appends one row with hash_id = CRC32(bone_name + random salt) (IEEE u32).
 * Retries salt if the hash collides with an existing hash id in the table.
 */
export function debugFillMissingJnttblEntries(doc: JnttblEditorDocument): DebugFillMissingJnttblResult {
  const names = doc.nusktb.boneNames;
  if (!names || names.length === 0) {
    throw new Error("Load a skeleton (.nusktb) with bone names before using this debug action.");
  }

  const covered = new Set<number>();
  for (const e of doc.entries) {
    covered.add(e.boneIndex >>> 0);
  }

  const missing: number[] = [];
  for (let i = 0; i < names.length; i++) {
    if (!covered.has(i)) {
      missing.push(i);
    }
  }

  if (missing.length === 0) {
    return { document: doc, addedCount: 0 };
  }

  const existingHashes = new Set(doc.entries.map((e) => e.hashId >>> 0));
  const newRows: { hashId: number; boneIndex: number }[] = [];

  for (const boneIndex of missing) {
    const boneName = names[boneIndex] ?? "";
    let hashId = 0;
    let attempts = 0;
    for (;;) {
      attempts += 1;
      if (attempts > 96) {
        throw new Error(
          `Failed to allocate a unique hash id for bone index ${boneIndex} after ${attempts} attempts.`,
        );
      }
      const seed = `${boneName}${randomSalt()}`;
      hashId = crc32IeeeU32Utf8String(seed);
      if (!existingHashes.has(hashId)) {
        existingHashes.add(hashId);
        break;
      }
    }
    newRows.push({ hashId, boneIndex: boneIndex >>> 0 });
  }

  return {
    document: {
      ...doc,
      entries: [...doc.entries, ...newRows],
    },
    addedCount: newRows.length,
  };
}
