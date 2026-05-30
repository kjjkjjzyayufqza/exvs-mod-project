import type { DdsFormat } from "../components/TextureFormatSelect";
import { ddsFormatToRust } from "./sceneTextureConvert";

const RUST_TO_SCENE_DDS: Record<string, DdsFormat> = {
  BC7RgbaUnorm: "BC7_UNORM",
  BC7RgbaUnormSrgb: "BC7_UNORM_SRGB",
  BC5RgUnorm: "BC5_UNORM",
  BC5RgSnorm: "BC5_UNORM",
  BC4RUnorm: "BC4_UNORM",
  BC4RSnorm: "BC4_UNORM",
  BC1RgbaUnorm: "BC1_UNORM",
  BC1RgbaUnormSrgb: "BC1_UNORM",
  BC3RgbaUnorm: "BC3_UNORM",
  BC3RgbaUnormSrgb: "BC3_UNORM",
};

export function rustDdsFormatToSceneFormat(rustFormat: string): DdsFormat | null {
  const trimmed = rustFormat.trim();
  return RUST_TO_SCENE_DDS[trimmed] ?? null;
}

export function sceneFormatFromEntryFormat(entryFormat: string): DdsFormat | null {
  const known: DdsFormat[] = [
    "BC7_UNORM",
    "BC7_UNORM_SRGB",
    "BC5_UNORM",
    "BC4_UNORM",
    "BC1_UNORM",
    "BC3_UNORM",
  ];
  if (known.includes(entryFormat as DdsFormat)) {
    return entryFormat as DdsFormat;
  }
  return rustDdsFormatToSceneFormat(entryFormat);
}

export function sceneFormatMatchesRust(
  sceneFormat: DdsFormat,
  rustFormat: string,
): boolean {
  return ddsFormatToRust(sceneFormat) === rustFormat.trim();
}
