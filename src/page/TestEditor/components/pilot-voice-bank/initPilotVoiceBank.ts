import { ExtractFHMData, ExtractType, Fhm2d_type_format } from "@/models/fhm2d";

export const PILOT_VOICE_BANK_ROUTE_ID = "unit.waveform";
export const PILOT_VOICE_BANK_PREFIX = "091waveform";

export type PilotVoiceBankInitPlan = {
  sourceFhm2dPath: string;
  workspaceFolder: string;
};

function trimTrailingSeparators(path: string): string {
  return path.trim().replace(/[\\/]+$/g, "");
}

function preferredSeparator(path: string): "\\" | "/" {
  return path.includes("\\") ? "\\" : "/";
}

export function formatBankPackage(bankPackage: number): string {
  return `0x${(bankPackage >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

export function planPilotVoiceBankInit(input: {
  dplCacheDir: string;
  workspaceRoot: string;
  stem: string;
  bankPackage: number;
  prefix?: string;
}): PilotVoiceBankInitPlan {
  if ((input.bankPackage >>> 0) === 0) {
    throw new Error("bankPackage is 0");
  }
  const dplCacheDir = trimTrailingSeparators(input.dplCacheDir);
  const workspaceRoot = trimTrailingSeparators(input.workspaceRoot);
  const separator = preferredSeparator(workspaceRoot);
  const prefix = input.prefix ?? PILOT_VOICE_BANK_PREFIX;
  return {
    sourceFhm2dPath: `${dplCacheDir}\\${formatBankPackage(input.bankPackage)}.fhm2d`,
    workspaceFolder: [workspaceRoot, prefix, "voice", "pilot", input.stem].join(separator),
  };
}

export function pilotVoiceAudioFolder(dplCacheDir: string, relativeAudio: string): string {
  const base = trimTrailingSeparators(dplCacheDir);
  if (!base) return "";
  const separator = preferredSeparator(base);
  const parent = base.split(/[\\/]/).slice(0, -1).join(separator);
  const folder = relativeAudio
    .replace(/\\/g, "/")
    .split("/")
    .slice(0, -1)
    .join(separator);
  if (!parent || !folder) return "";
  return `${parent}${separator}${folder}`;
}

export async function initPilotVoiceBank(input: {
  dplCacheDir: string;
  workspaceRoot: string;
  stem: string;
  bankPackage: number;
  prefix?: string;
}): Promise<PilotVoiceBankInitPlan> {
  const plan = planPilotVoiceBankInit(input);
  const extractResult = await ExtractFHMData(
    plan.sourceFhm2dPath,
    plan.workspaceFolder,
    ExtractType.SingleFolder,
    Fhm2d_type_format.fhm2d_sound,
  );
  if (extractResult.namingError) {
    throw new Error(extractResult.namingError);
  }
  return plan;
}
