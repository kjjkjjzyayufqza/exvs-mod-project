import type { HavokMeshData } from "@/utils/havokXmlParser";
import type {
  HktHullPreset,
  HktSimplifyConfig,
  HktSimplifyPreset,
} from "../components/dae-import/daeImportTypes";
import type { ImportConfig } from "./sceneSessionService";

export const HKT_SIMPLIFY_PRESET_ORDER: HktSimplifyPreset[] = [
  "none",
  "medium",
  "high",
  "heavy",
];

export const HKT_SIMPLIFY_PRESET_LABELS: Record<HktSimplifyPreset, string> = {
  none: "Full surface",
  medium: "Merge flats",
  high: "High 50k",
  heavy: "Low 5%",
};

export const HKT_SIMPLIFY_PRESET_HINTS: Record<HktSimplifyPreset, string> = {
  none: "Export every render triangle as collision",
  medium: "Merge coplanar faces on flats and panels (recommended)",
  high: "Keep the source outline closely, capped at 50k collision triangles",
  heavy: "Aggressive merge and curved-surface decimation for low-poly collision",
};

export const HKT_HULL_PRESET_ORDER: HktHullPreset[] = ["coarse", "balanced", "fine"];

export const HKT_HULL_PRESET_LABELS: Record<HktHullPreset, string> = {
  coarse: "Coarse",
  balanced: "Balanced",
  fine: "Fine",
};

export const HKT_HULL_PRESET_HINTS: Record<HktHullPreset, string> = {
  coarse: "Tightest outer shell, fewest faces",
  balanced: "Outer shell with rounded detail (recommended)",
  fine: "Detailed convex shell",
};

/** Target collision-face budget per hull coarseness preset. */
export const HKT_HULL_PRESET_FACES: Record<HktHullPreset, number> = {
  coarse: 24,
  balanced: 80,
  fine: 200,
};

/** Preset parameters sent to the Rust collision pipeline. */
export function hktSimplifyConfigFromPreset(preset: HktSimplifyPreset): HktSimplifyConfig {
  const base = {
    strategy: "shapePreserving" as const,
    preset,
    hullPreset: "balanced" as const,
    hullTargetFaces: null,
  };
  switch (preset) {
    case "none":
      return {
        ...base,
        enabled: false,
        planarityAngleDeg: 8,
        minTriangleArea: 1e-8,
        weldEpsilon: 1e-5,
        targetTriangleRatio: null,
        maxTargetTriangles: null,
      };
    case "medium":
      return {
        ...base,
        enabled: true,
        planarityAngleDeg: 15,
        minTriangleArea: 1e-6,
        weldEpsilon: 0.001,
        targetTriangleRatio: null,
        maxTargetTriangles: null,
      };
    case "high":
      return {
        ...base,
        enabled: true,
        planarityAngleDeg: 15,
        minTriangleArea: 1e-6,
        weldEpsilon: 0.001,
        targetTriangleRatio: null,
        maxTargetTriangles: 50_000,
      };
    case "heavy":
      return {
        ...base,
        enabled: true,
        planarityAngleDeg: 45,
        minTriangleArea: 0.001,
        weldEpsilon: 0.01,
        targetTriangleRatio: 0.05,
        maxTargetTriangles: 50_000,
      };
  }
}

/** Convex-hull ("outer frame") config for a coarseness preset. */
export function hktHullConfigFromPreset(preset: HktHullPreset): HktSimplifyConfig {
  return {
    strategy: "convexHull",
    preset: "medium",
    hullPreset: preset,
    enabled: true,
    planarityAngleDeg: 15,
    minTriangleArea: 1e-6,
    weldEpsilon: 0.001,
    targetTriangleRatio: null,
    maxTargetTriangles: null,
    hullTargetFaces: HKT_HULL_PRESET_FACES[preset],
  };
}

export function detectHktSimplifyPreset(config: HktSimplifyConfig): HktSimplifyPreset {
  if (config.preset && HKT_SIMPLIFY_PRESET_ORDER.includes(config.preset)) {
    const canonical = hktSimplifyConfigFromPreset(config.preset);
    if (
      config.enabled === canonical.enabled &&
      config.planarityAngleDeg === canonical.planarityAngleDeg &&
      config.minTriangleArea === canonical.minTriangleArea &&
      config.weldEpsilon === canonical.weldEpsilon &&
      (config.targetTriangleRatio ?? null) === canonical.targetTriangleRatio &&
      (config.maxTargetTriangles ?? null) === canonical.maxTargetTriangles
    ) {
      return config.preset;
    }
  }

  for (const preset of HKT_SIMPLIFY_PRESET_ORDER) {
    const canonical = hktSimplifyConfigFromPreset(preset);
    if (
      config.enabled === canonical.enabled &&
      config.planarityAngleDeg === canonical.planarityAngleDeg &&
      config.minTriangleArea === canonical.minTriangleArea &&
      config.weldEpsilon === canonical.weldEpsilon &&
      (config.targetTriangleRatio ?? null) === canonical.targetTriangleRatio &&
      (config.maxTargetTriangles ?? null) === canonical.maxTargetTriangles
    ) {
      return preset;
    }
  }

  return config.enabled ? "medium" : "none";
}

/** Normalize legacy configs that omit `preset` or drift from preset values. */
export function normalizeHktSimplifyConfig(
  config: Partial<HktSimplifyConfig> | null | undefined,
): HktSimplifyConfig {
  if (config?.strategy === "convexHull") {
    const hullPreset =
      config.hullPreset && HKT_HULL_PRESET_ORDER.includes(config.hullPreset)
        ? config.hullPreset
        : "balanced";
    return hktHullConfigFromPreset(hullPreset);
  }
  if (config?.preset && HKT_SIMPLIFY_PRESET_ORDER.includes(config.preset)) {
    return hktSimplifyConfigFromPreset(config.preset);
  }
  const merged: HktSimplifyConfig = {
    ...hktSimplifyConfigFromPreset("medium"),
    ...config,
    preset: config?.preset ?? "medium",
  };
  const preset = detectHktSimplifyPreset(merged);
  return hktSimplifyConfigFromPreset(preset);
}

export const DEFAULT_HKT_SIMPLIFY: HktSimplifyConfig = hktSimplifyConfigFromPreset("medium");
export const HIGH_PRECISION_HKT_SIMPLIFY: HktSimplifyConfig =
  hktSimplifyConfigFromPreset("high");

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
    hktSimplify: normalizeHktSimplifyConfig(partial.hktSimplify),
  };
}

/** Stable key for HKT preview effect deps (ignores object identity). */
export function serializeHktPreviewConfigKey(
  importConfig: Pick<ImportConfig, "generateHkt" | "convertToSsbh" | "ssbhConfig">,
  hktSimplify: HktSimplifyConfig,
): string {
  const normalized = normalizeHktSimplifyConfig(hktSimplify);
  const ssbh = importConfig.ssbhConfig;
  return JSON.stringify({
    generateHkt: importConfig.generateHkt,
    convertToSsbh: importConfig.convertToSsbh,
    hktSimplify: normalized,
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
