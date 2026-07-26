/**
 * Named lighting presets for SSBH model preview.
 *
 * Unit / character meshes are intentionally low-poly with hard edges; harsh single-key
 * lighting makes triangle facets obvious. "softCharacter" raises fill and softens the key
 * so the viewport is closer to in-game ambient-heavy presentation without changing geometry.
 */

export type PreviewLightingPreset = "studio" | "softCharacter" | "harsh";

export type PreviewLightingValues = {
  ambientIntensity: number;
  directionalIntensity: number;
  directionalX: number;
  directionalY: number;
  directionalZ: number;
};

export const PREVIEW_LIGHTING_PRESET_META: {
  id: PreviewLightingPreset;
  label: string;
  description: string;
}[] = [
  {
    id: "studio",
    label: "Studio (default)",
    description: "Balanced key light — good for inspecting form and materials.",
  },
  {
    id: "softCharacter",
    label: "Soft character",
    description: "Higher ambient, softer key — hides low-poly faceting on unit models.",
  },
  {
    id: "harsh",
    label: "Harsh contrast",
    description: "Strong key, low fill — exaggerates facets and hard edges.",
  },
];

export const PREVIEW_LIGHTING_PRESETS: Record<PreviewLightingPreset, PreviewLightingValues> = {
  studio: {
    ambientIntensity: 0.4,
    directionalIntensity: 1.05,
    directionalX: 8,
    directionalY: 14,
    directionalZ: 6,
  },
  softCharacter: {
    ambientIntensity: 0.9,
    directionalIntensity: 0.5,
    directionalX: 5,
    directionalY: 11,
    directionalZ: 7,
  },
  harsh: {
    ambientIntensity: 0.18,
    directionalIntensity: 1.45,
    directionalX: 10,
    directionalY: 16,
    directionalZ: 4,
  },
};

const PRESET_MATCH_EPS = 0.051;

export function matchPreviewLightingPreset(
  values: PreviewLightingValues,
): PreviewLightingPreset | "custom" {
  for (const id of Object.keys(PREVIEW_LIGHTING_PRESETS) as PreviewLightingPreset[]) {
    const preset = PREVIEW_LIGHTING_PRESETS[id];
    if (
      Math.abs(preset.ambientIntensity - values.ambientIntensity) < PRESET_MATCH_EPS &&
      Math.abs(preset.directionalIntensity - values.directionalIntensity) < PRESET_MATCH_EPS &&
      Math.abs(preset.directionalX - values.directionalX) < PRESET_MATCH_EPS &&
      Math.abs(preset.directionalY - values.directionalY) < PRESET_MATCH_EPS &&
      Math.abs(preset.directionalZ - values.directionalZ) < PRESET_MATCH_EPS
    ) {
      return id;
    }
  }
  return "custom";
}
