import { describe, expect, it } from "vitest";
import {
  filterDrawsForMotionSkinning,
  motionVisibilityAllowsMesh,
  resolveDrawVisibility,
} from "./motionVisibility";

describe("motionVisibilityAllowsMesh", () => {
  it("returns true when there are no rules", () => {
    expect(motionVisibilityAllowsMesh("MeshA", null)).toBe(true);
    expect(motionVisibilityAllowsMesh("MeshA", [])).toBe(true);
  });

  it("applies prefix rules with last match winning", () => {
    const rows = [
      { meshNamePrefix: "Body", visible: true },
      { meshNamePrefix: "Body_L", visible: false },
    ];
    expect(motionVisibilityAllowsMesh("Body_main", rows)).toBe(true);
    expect(motionVisibilityAllowsMesh("Body_L_hand", rows)).toBe(false);
  });

  it("uses case-sensitive prefix matching", () => {
    const rows = [{ meshNamePrefix: "mesh", visible: false }];
    expect(motionVisibilityAllowsMesh("meshA", rows)).toBe(false);
    expect(motionVisibilityAllowsMesh("MeshA", rows)).toBe(true);
  });

  it("filters CPU skinning draws by viewport and motion visibility", () => {
    const draws = [
      {
        key: "visible_body",
        label: "visible_body",
        geometry: {} as never,
        materialLabel: "mat",
        meshObjectName: "Body_main",
        meshObjectSubindex: 0,
        skin: null,
      },
      {
        key: "hidden_toggle",
        label: "hidden_toggle",
        geometry: {} as never,
        materialLabel: "mat",
        meshObjectName: "Body_hidden",
        meshObjectSubindex: 0,
        skin: null,
      },
      {
        key: "hidden_motion",
        label: "hidden_motion",
        geometry: {} as never,
        materialLabel: "mat",
        meshObjectName: "Face_expr",
        meshObjectSubindex: 0,
        skin: null,
      },
    ];
    const filtered = filterDrawsForMotionSkinning(
      draws,
      new Set(["visible_body", "hidden_motion"]),
      [{ meshNamePrefix: "Face", visible: false }],
    );
    expect(filtered.map((d) => d.key)).toEqual(["visible_body"]);
  });

  it("forces draw visibility during playback when override is enabled", () => {
    const visible = resolveDrawVisibility({
      drawKey: "hidden_draw",
      meshObjectName: "Body_hidden",
      visibleKeys: new Set<string>(),
      motionVisibilityRows: [{ meshNamePrefix: "Body", visible: false }],
      forceVisibleDuringMotion: true,
      motionPlaybackActive: true,
    });
    expect(visible).toBe(true);
  });

  it("respects viewport and motion visibility when override is disabled", () => {
    const visible = resolveDrawVisibility({
      drawKey: "hidden_draw",
      meshObjectName: "Body_hidden",
      visibleKeys: new Set<string>(),
      motionVisibilityRows: [{ meshNamePrefix: "Body", visible: false }],
      forceVisibleDuringMotion: false,
      motionPlaybackActive: true,
    });
    expect(visible).toBe(false);
  });
});
