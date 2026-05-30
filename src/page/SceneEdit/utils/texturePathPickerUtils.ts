import type { DdsFormat } from "@/lib/ddsFormats";

export function recommendDdsFormat(paramId: string): DdsFormat {
  const id = paramId.toLowerCase();
  if (id.includes("normal")) return "BC5RgUnorm";
  if (
    id.includes("roughness") ||
    id.includes("metalness") ||
    id.includes("ao") ||
    id.includes("ambient")
  ) {
    return "BC4RUnorm";
  }
  if (
    id.includes("diffuse") ||
    id.includes("basecolor") ||
    id.includes("emissive")
  ) {
    return "BC7RgbaUnormSrgb";
  }
  return "BC7RgbaUnorm";
}

export function textureBasename(filePath: string): string {
  return filePath.replace(/.*[/\\]/, "");
}

export function isNutexbFile(name: string): boolean {
  return name.toLowerCase().endsWith(".nutexb");
}
