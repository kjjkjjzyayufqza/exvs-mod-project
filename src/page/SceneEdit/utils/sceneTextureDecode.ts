import { invoke } from "@tauri-apps/api/core";
import {
  getOrDecodeNutexbRgba,
  type NutexbRgbaData,
} from "@/components/ssbh-model-preview/nutexbPreviewCache";
import { getMemoryNutexbPreviewIdentity } from "@/components/ssbh-model-preview/fhm2dMemoryPreviewService";

export type SceneTextureSourceKind = "disk" | "memory";

export interface SceneTextureDecodeContext {
  sessionId: string | null;
  sourceKind: SceneTextureSourceKind;
  maxDimension: number | null;
}

export async function resolveSceneNutexbVersionId(
  path: string,
  ctx: SceneTextureDecodeContext,
): Promise<string> {
  if (ctx.sourceKind === "memory" && ctx.sessionId) {
    const identity = await getMemoryNutexbPreviewIdentity({
      sessionId: ctx.sessionId,
      virtualPath: path,
    });
    return `nutexb|${identity.nutexbSize}|${(identity.crc32 >>> 0).toString(16).padStart(8, "0")}@${ctx.maxDimension ?? "full"}`;
  }
  const identity = await invoke<{ nutexbSize: number; crc32: number }>(
    "nutexb_preview_file_identity",
    { path },
  );
  return `nutexb|${identity.nutexbSize}|${(identity.crc32 >>> 0).toString(16).padStart(8, "0")}@${ctx.maxDimension ?? "full"}`;
}

export async function decodeSceneNutexbRgba(
  path: string,
  ctx: SceneTextureDecodeContext,
): Promise<NutexbRgbaData> {
  const versionId = await resolveSceneNutexbVersionId(path, ctx);
  const decodeFn =
    ctx.sourceKind === "memory" && ctx.sessionId
      ? () =>
          invoke<ArrayBuffer | Uint8Array>("fhm2d_memory_nutexb_rgba_bytes", {
            sessionId: ctx.sessionId,
            virtualPath: path,
            maxDimension: ctx.maxDimension ?? undefined,
          })
      : () =>
          invoke<ArrayBuffer | Uint8Array>("nutexb_rgba_bytes", {
            inputPath: path,
            maxDimension: ctx.maxDimension ?? undefined,
          });
  return getOrDecodeNutexbRgba(versionId, decodeFn);
}
