import type { DdsFormat } from "../components/TextureFormatSelect";

export function recommendDdsFormat(paramId: string): DdsFormat {
  const id = paramId.toLowerCase();
  if (id.includes("normal")) return "BC5_UNORM";
  if (id.includes("roughness") || id.includes("metalness") || id.includes("ao") || id.includes("ambient")) return "BC4_UNORM";
  if (id.includes("diffuse") || id.includes("basecolor") || id.includes("emissive")) return "BC7_UNORM_SRGB";
  return "BC7_UNORM";
}

export function textureBasename(filePath: string): string {
  return filePath.replace(/.*[/\\]/, "");
}

export function isNutexbFile(name: string): boolean {
  return name.toLowerCase().endsWith(".nutexb");
}
