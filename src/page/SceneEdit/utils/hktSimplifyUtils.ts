import type { HavokMeshData } from "@/utils/havokXmlParser";
import type { HktSimplifyConfig } from "../components/dae-import/daeImportTypes";
import type { ImportConfig } from "./sceneSessionService";

export const DEFAULT_HKT_SIMPLIFY: HktSimplifyConfig = {
  // Off by default: the user opts in per import. When disabled, every render triangle is
  // exported as collision. The simplify algorithm and its UI controls remain available, and
  // enabling it is what keeps dense meshes within Havok's per-section triangle limits.
  enabled: false,
  planarityAngleDeg: 8,
  minTriangleArea: 1e-8,
  weldEpsilon: 1e-5,
};

export function countHavokCollisionTriangles(data: HavokMeshData): number {
  let count = 0;
  for (const quad of data.quads) {
    const c = quad[2];
    const d = quad[3];
    count += c === d ? 1 : 2;
  }
  return count;
}

export function formatTriangleCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(2)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}k`;
  }
  return String(count);
}

export function buildImportConfigForHktPreview(
  partial: {
    generateHkt: boolean;
    convertToSsbh: boolean;
    ssbhConfig: ImportConfig["ssbhConfig"];
    hktSimplify: HktSimplifyConfig;
  },
): ImportConfig {
  return {
    loadToScene: false,
    convertToSsbh: partial.convertToSsbh,
    generateHkt: partial.generateHkt,
    ssbhConfig: partial.ssbhConfig,
    hktSimplify: partial.hktSimplify,
  };
}

/** Stable key for HKT preview effect deps (ignores object identity). */
export function serializeHktPreviewConfigKey(
  importConfig: Pick<ImportConfig, "generateHkt" | "convertToSsbh" | "ssbhConfig">,
  hktSimplify: HktSimplifyConfig,
): string {
  const ssbh = importConfig.ssbhConfig;
  return JSON.stringify({
    generateHkt: importConfig.generateHkt,
    convertToSsbh: importConfig.convertToSsbh,
    hktSimplify,
    ssbh: ssbh
      ? {
          baseFilename: ssbh.baseFilename,
          scaleFactor: ssbh.scaleFactor,
          upAxis: ssbh.upAxis,
          writeNumdlb: ssbh.writeNumdlb,
          writeNumshb: ssbh.writeNumshb,
          writeNusktb: ssbh.writeNusktb,
          writeNumatb: ssbh.writeNumatb,
          writeJnttbl: ssbh.writeJnttbl,
          writeMayaProfile: ssbh.writeMayaProfile,
          materialTemplate: ssbh.materialTemplate,
        }
      : null,
  });
}

export function reductionPercent(before: number, after: number): number | null {
  if (before <= 0) return null;
  return Math.max(0, Math.round((1 - after / before) * 100));
}
