import { DDS_FORMATS, type DdsFormat } from "@/lib/ddsFormats";

export type { DdsFormat };

const LEGACY_SCENE_TO_RUST: Record<string, DdsFormat> = {
  BC7_UNORM: "BC7RgbaUnorm",
  BC7_UNORM_SRGB: "BC7RgbaUnormSrgb",
  BC5_UNORM: "BC5RgUnorm",
  BC4_UNORM: "BC4RUnorm",
  BC1_UNORM: "BC1RgbaUnorm",
  BC3_UNORM: "BC3RgbaUnorm",
};

const KNOWN_VALUES = new Set<string>(DDS_FORMATS.map((opt) => opt.value));

export const DEFAULT_DDS_FORMAT: DdsFormat = "BC7RgbaUnormSrgb";

export function isKnownDdsFormat(value: string): value is DdsFormat {
  return KNOWN_VALUES.has(value.trim());
}

export function normalizeDdsFormat(value: string | null | undefined): DdsFormat {
  const trimmed = value?.trim() ?? "";
  if (isKnownDdsFormat(trimmed)) {
    return trimmed;
  }
  const legacy = LEGACY_SCENE_TO_RUST[trimmed];
  if (legacy) {
    return legacy;
  }
  return DEFAULT_DDS_FORMAT;
}

export function resolveDetectedDdsFormat(detected: string): DdsFormat | null {
  const trimmed = detected.trim();
  if (isKnownDdsFormat(trimmed)) {
    return trimmed;
  }
  return null;
}

export function formatMatchesDetected(
  selected: DdsFormat,
  detected: string,
): boolean {
  return selected === detected.trim();
}
