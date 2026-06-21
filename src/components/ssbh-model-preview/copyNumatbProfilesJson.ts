import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import type { MatlDataJson } from "./daeSsbhTypes";
import { normalizeMatlDataJson } from "./store/numatbProfileMigration";

export interface NumatbClipboardExportPayload {
  modelName?: string;
  numatbPaths?: { maya: string | null; nust: string | null };
  mirrorTexturePathsAcrossProfiles?: boolean;
  mayaProfile: MatlDataJson;
  nustProfile: MatlDataJson;
  numdlbMaterialMappings?: unknown;
  exportOptions?: {
    writeMayaProfile?: boolean;
    writeNumatb?: boolean;
  };
}

export function buildNumatbClipboardExportPayload(
  input: Omit<NumatbClipboardExportPayload, "mayaProfile" | "nustProfile"> & {
    mayaProfile: MatlDataJson;
    nustProfile: MatlDataJson;
  },
): NumatbClipboardExportPayload {
  const { mayaProfile, nustProfile, ...rest } = input;
  return {
    ...rest,
    mayaProfile: normalizeMatlDataJson(mayaProfile),
    nustProfile: normalizeMatlDataJson(nustProfile),
  };
}

function readProfileField(raw: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (raw[key] !== undefined) {
      return raw[key];
    }
  }
  return undefined;
}

/**
 * Parses JSON exported by Copy JSON or hand-authored bundle files such as assets/textures/file.json.
 */
export function parseNumatbProfilesJsonText(text: string): NumatbClipboardExportPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON file");
  }
  if (!raw || typeof raw !== "object") {
    throw new Error("JSON root must be an object");
  }
  const record = raw as Record<string, unknown>;
  const mayaProfile = readProfileField(record, ["mayaProfile", "mayaFile"]);
  const nustProfile = readProfileField(record, ["nustProfile", "nustFile"]);
  if (!mayaProfile || !nustProfile) {
    throw new Error("JSON must include mayaProfile and nustProfile (or mayaFile / nustFile)");
  }
  const numatbPathsRaw = record.numatbPaths;
  const numatbPaths =
    numatbPathsRaw && typeof numatbPathsRaw === "object"
      ? {
          maya: typeof (numatbPathsRaw as { maya?: unknown }).maya === "string"
            ? (numatbPathsRaw as { maya: string }).maya
            : null,
          nust: typeof (numatbPathsRaw as { nust?: unknown }).nust === "string"
            ? (numatbPathsRaw as { nust: string }).nust
            : null,
        }
      : undefined;
  return buildNumatbClipboardExportPayload({
    modelName: typeof record.modelName === "string" ? record.modelName : undefined,
    numatbPaths,
    mirrorTexturePathsAcrossProfiles:
      typeof record.mirrorTexturePathsAcrossProfiles === "boolean"
        ? record.mirrorTexturePathsAcrossProfiles
        : undefined,
    mayaProfile: mayaProfile as MatlDataJson,
    nustProfile: nustProfile as MatlDataJson,
    numdlbMaterialMappings: record.numdlbMaterialMappings,
    exportOptions:
      record.exportOptions && typeof record.exportOptions === "object"
        ? (record.exportOptions as NumatbClipboardExportPayload["exportOptions"])
        : undefined,
  });
}

/**
 * Serializes in-memory Maya/Nust numatb profile JSON for clipboard export.
 * Intended for pasting into an AI assistant for material/texture troubleshooting.
 */
export async function copyNumatbProfilesJsonToClipboard(
  payload: NumatbClipboardExportPayload,
): Promise<boolean> {
  try {
    await writeText(JSON.stringify(payload, null, 2));
    toast.success("Copied NUMATB profiles JSON to clipboard");
    return true;
  } catch {
    toast.error("Failed to copy NUMATB profiles to clipboard");
    return false;
  }
}
