import { invoke } from "@tauri-apps/api/core";
import { parseHavokXML, type HavokMeshData } from "@/utils/havokXmlParser";

export interface HavokMeshDataPayload {
  sourceId: string;
  hktXml: string;
}

export async function loadHavokCollisionFromSession(
  sessionId: string,
  objectId: string,
): Promise<HavokMeshData> {
  const payload = await invoke<HavokMeshDataPayload>(
    "scene_load_hkt_from_session",
    { sessionId, objectId },
  );
  return parseHavokXML(payload.hktXml);
}

export async function generateHavokCollision(
  sessionId: string,
  importId: string,
  configProfile: string,
): Promise<HavokMeshData> {
  const payload = await invoke<HavokMeshDataPayload>("scene_generate_hkt", {
    sessionId,
    importId,
    configProfile,
  });
  return parseHavokXML(payload.hktXml);
}

export function parseHktXmlToMeshData(hktXml: string): HavokMeshData {
  return parseHavokXML(hktXml);
}
