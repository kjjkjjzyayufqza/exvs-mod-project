import { invoke } from "@tauri-apps/api/core";
import { Fhm2d_type_format } from "@/models/fhm2d";
import type {
  CreateFhm2dMemorySessionParams,
  Fhm2dMemorySessionSummary,
  Fhm2dPreviewCandidate,
  MemoryRenameImpact,
} from "./fhm2dMemoryPreviewTypes";
import type { SsbhModelPreviewBundle } from "./types";

export async function createFhm2dMemorySession(
  params: CreateFhm2dMemorySessionParams,
): Promise<Fhm2dMemorySessionSummary> {
  return invoke<Fhm2dMemorySessionSummary>("create_fhm2d_memory_session_from_path", {
    sourcePath: params.sourcePath,
    format: params.format,
  });
}

export async function renameFhm2dMemoryEntry(params: {
  sessionId: string;
  entryId: string;
  nextName?: string;
  nextVirtualPath?: string;
}): Promise<MemoryRenameImpact> {
  return invoke<MemoryRenameImpact>("rename_fhm2d_memory_entry", params);
}

export async function listFhm2dMemoryPreviewCandidates(sessionId: string): Promise<Fhm2dPreviewCandidate[]> {
  return invoke<Fhm2dPreviewCandidate[]>("list_fhm2d_memory_preview_candidates", { sessionId });
}

export async function buildSsbhPreviewBundleFromMemory(params: {
  sessionId: string;
  modlVirtualPath: string;
}): Promise<SsbhModelPreviewBundle> {
  return invoke<SsbhModelPreviewBundle>("build_ssbh_preview_bundle_from_memory", params);
}

export async function disposeFhm2dMemorySession(sessionId: string): Promise<void> {
  await invoke("dispose_fhm2d_memory_session", { sessionId });
}

export async function getMemoryNutexbPreviewIdentity(params: {
  sessionId: string;
  virtualPath: string;
}): Promise<{ nutexbSize: number; crc32: number }> {
  return invoke("fhm2d_memory_nutexb_preview_identity", params);
}

export async function getMemoryNutexbPngBytes(params: {
  sessionId: string;
  virtualPath: string;
}): Promise<ArrayBuffer | Uint8Array> {
  return invoke<ArrayBuffer | Uint8Array>("fhm2d_memory_nutexb_png_bytes", params);
}

export function defaultFhm2dMemoryFormat(): Fhm2d_type_format {
  return Fhm2d_type_format.fhm2d_character;
}
