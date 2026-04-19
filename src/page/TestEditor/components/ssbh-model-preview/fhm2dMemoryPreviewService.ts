import { invoke } from "@tauri-apps/api/core";
import { Fhm2d_type_format } from "@/models/fhm2d";
import type {
  CharacterIdMemoryPreviewResponse,
  CreateFhm2dMemorySessionParams,
  Fhm2dMemorySessionSummary,
  Fhm2dPreviewCandidate,
  MemoryRenameImpact,
  PreviewCollectionSnapshot,
  PreviewCollectionSourceItem,
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

export async function listCharacterIdMemoryPreviewRows(params: {
  workspaceRoot: string;
  obDplCachePath: string;
  query?: string;
}): Promise<CharacterIdMemoryPreviewResponse> {
  return invoke<CharacterIdMemoryPreviewResponse>("character_id_memory_preview_rows", {
    workspaceRoot: params.workspaceRoot,
    obDplCachePath: params.obDplCachePath,
    query: params.query,
  });
}

export async function replacePreviewCollectionItems(
  items: PreviewCollectionSourceItem[],
): Promise<PreviewCollectionSnapshot> {
  return invoke<PreviewCollectionSnapshot>("preview_collection_replace_from_bundles", { items });
}

export async function appendPreviewCollectionItems(
  items: PreviewCollectionSourceItem[],
): Promise<PreviewCollectionSnapshot> {
  return invoke<PreviewCollectionSnapshot>("preview_collection_append_from_bundles", { items });
}

export async function getPreviewCollectionSnapshot(): Promise<PreviewCollectionSnapshot> {
  return invoke<PreviewCollectionSnapshot>("preview_collection_snapshot");
}

export async function setPreviewCollectionQuery(query: string): Promise<PreviewCollectionSnapshot> {
  return invoke<PreviewCollectionSnapshot>("preview_collection_set_query", { query });
}

export async function togglePreviewCollectionItemVisibility(id: string): Promise<PreviewCollectionSnapshot> {
  return invoke<PreviewCollectionSnapshot>("preview_collection_toggle_item_visibility", { id });
}

export async function toggleAllPreviewCollectionVisibility(): Promise<PreviewCollectionSnapshot> {
  return invoke<PreviewCollectionSnapshot>("preview_collection_toggle_all_visibility");
}

export async function togglePreviewCollectionItemSelected(id: string): Promise<PreviewCollectionSnapshot> {
  return invoke<PreviewCollectionSnapshot>("preview_collection_toggle_item_selected", { id });
}

export async function setPreviewCollectionActive(id: string): Promise<PreviewCollectionSnapshot> {
  return invoke<PreviewCollectionSnapshot>("preview_collection_set_active", { id });
}

export async function clearPreviewCollectionActive(): Promise<PreviewCollectionSnapshot> {
  return invoke<PreviewCollectionSnapshot>("preview_collection_clear_active");
}

export async function setPreviewCollectionViewRange(value: "all" | "single"): Promise<PreviewCollectionSnapshot> {
  return invoke<PreviewCollectionSnapshot>("preview_collection_set_view_range", { value });
}

export async function setPreviewCollectionControlRange(value: "all" | "single"): Promise<PreviewCollectionSnapshot> {
  return invoke<PreviewCollectionSnapshot>("preview_collection_set_control_range", { value });
}

export async function removeMissingPreviewCollectionIds(validIds: string[]): Promise<PreviewCollectionSnapshot> {
  return invoke<PreviewCollectionSnapshot>("preview_collection_remove_missing_ids", { validIds });
}

export function defaultFhm2dMemoryFormat(): Fhm2d_type_format {
  return Fhm2d_type_format.fhm2d_character;
}
