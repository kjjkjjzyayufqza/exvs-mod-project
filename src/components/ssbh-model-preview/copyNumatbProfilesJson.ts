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
