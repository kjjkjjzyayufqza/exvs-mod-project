import { invoke } from "@tauri-apps/api/core";
import { IOReadFile } from "@/IO/fileSystem";
import { obfDecodeToUtf8String } from "@/utils/obfString";
import { canonicalMscHashHex } from "./mscHash";
import type {
  TypedFieldValue,
  TypedParamEntry,
  TypedParamFile,
} from "../components/param-editor/typedParamTypes";

export interface MscParamLabels {
  actionLabel: string | null;
  resourceLabel: string | null;
}

function readNumericField(entry: TypedParamEntry, key: string): number | null {
  const value: TypedFieldValue = entry[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readObfLabelAtOffset(bytes: Uint8Array, offset: number): string | null {
  if (offset <= 0 || offset >= bytes.length) {
    return null;
  }
  const decoded = obfDecodeToUtf8String(bytes.subarray(offset)).trim();
  return decoded.length > 0 ? decoded : null;
}

export function buildParamLabelIndex(
  parsed: TypedParamFile,
  bytes: Uint8Array,
): Map<string, MscParamLabels> {
  const labels = new Map<string, MscParamLabels>();
  for (const entry of parsed.entries) {
    const entryId = readNumericField(entry, "entryId");
    if (entryId == null) {
      continue;
    }
    const actionOffset = readNumericField(entry, "actionLabelOffset");
    const resourceOffset = readNumericField(entry, "resourceLabelOffset");
    labels.set(canonicalMscHashHex(entryId), {
      actionLabel: actionOffset == null ? null : readObfLabelAtOffset(bytes, actionOffset),
      resourceLabel: resourceOffset == null ? null : readObfLabelAtOffset(bytes, resourceOffset),
    });
  }
  return labels;
}

export async function loadParamLabelIndex(
  path: string,
  paramType: "armsparam" | "characterparam" | "speedparam",
): Promise<Map<string, MscParamLabels>> {
  const parsed = await invoke<TypedParamFile>("parse_typed_param_file", { path, paramType });
  const raw = new Uint8Array(await IOReadFile(path));
  return buildParamLabelIndex(parsed, raw);
}

export async function loadBestEffortParamLabels(
  candidates: Array<{ path: string; paramType: "armsparam" | "characterparam" | "speedparam" }>,
): Promise<Map<string, MscParamLabels>> {
  const merged = new Map<string, MscParamLabels>();
  for (const candidate of candidates) {
    try {
      const next = await loadParamLabelIndex(candidate.path, candidate.paramType);
      for (const [hashHex, labels] of next.entries()) {
        const previous = merged.get(hashHex);
        merged.set(hashHex, {
          actionLabel: previous?.actionLabel ?? labels.actionLabel ?? null,
          resourceLabel: previous?.resourceLabel ?? labels.resourceLabel ?? null,
        });
      }
    } catch {
      // Best-effort only.
    }
  }
  return merged;
}
