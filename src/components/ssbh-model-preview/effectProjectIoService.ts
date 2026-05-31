import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { Buffer } from "buffer";
import { CharacterEffectProject } from "@/models/characterEffectProject";
import {
  type EffectProjectEditorDocument,
  bufferFromEditorDocument,
  documentFromCharacterEffectProject,
} from "./effectProjectEditorUtils";

export async function effectProjectReadFile(filePath: string): Promise<EffectProjectEditorDocument> {
  const raw = await readFile(filePath);
  const buffer = Buffer.from(raw);
  const parsed = new CharacterEffectProject(buffer);
  return documentFromCharacterEffectProject(parsed);
}

export async function effectProjectWriteFile(payload: {
  filePath: string;
  document: EffectProjectEditorDocument;
}): Promise<void> {
  const out = bufferFromEditorDocument(payload.document);
  await writeFile(payload.filePath, out);
}
