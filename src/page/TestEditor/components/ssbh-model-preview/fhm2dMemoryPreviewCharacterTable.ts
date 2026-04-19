import { listCharacterIdMemoryPreviewRows } from "./fhm2dMemoryPreviewService";
import type { CharacterIdMemoryPreviewResponse } from "./fhm2dMemoryPreviewTypes";

export async function loadCharacterIdMemoryPreviewOptions(params: {
  workspaceRoot: string;
  obDplCachePath: string;
  query?: string;
}): Promise<CharacterIdMemoryPreviewResponse> {
  return listCharacterIdMemoryPreviewRows(params);
}
