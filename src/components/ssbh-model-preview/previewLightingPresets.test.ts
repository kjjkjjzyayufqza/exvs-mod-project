import { describe, expect, it } from "vitest";
import {
  matchPreviewLightingPreset,
  PREVIEW_LIGHTING_PRESETS,
  type PreviewLightingValues,
} from "./previewLightingPresets";

describe("matchPreviewLightingPreset", () => {
  it("matches each named preset exactly", () => {
    for (const id of Object.keys(PREVIEW_LIGHTING_PRESETS) as Array<keyof typeof PREVIEW_LIGHTING_PRESETS>) {
      expect(matchPreviewLightingPreset(PREVIEW_LIGHTING_PRESETS[id])).toBe(id);
    }
  });

  it("returns custom when values diverge from every preset", () => {
    const values: PreviewLightingValues = {
      ambientIntensity: 0.55,
      directionalIntensity: 0.8,
      directionalX: 1,
      directionalY: 2,
      directionalZ: 3,
    };
    expect(matchPreviewLightingPreset(values)).toBe("custom");
  });

  it("tolerates small floating-point slider noise", () => {
    const soft = PREVIEW_LIGHTING_PRESETS.softCharacter;
    expect(
      matchPreviewLightingPreset({
        ...soft,
        ambientIntensity: soft.ambientIntensity + 0.02,
      }),
    ).toBe("softCharacter");
  });
});
