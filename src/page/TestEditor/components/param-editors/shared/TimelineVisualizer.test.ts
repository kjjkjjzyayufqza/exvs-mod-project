import { describe, expect, it } from "vitest";
import { buildReloadTimeline } from "./TimelineVisualizer";

describe("buildReloadTimeline", () => {
  it("shows raw frame fields without assigning reload semantics", () => {
    expect(buildReloadTimeline(2, 40, 180, 8, 0, 0)).toEqual([
      {
        label: "0x103171AE",
        frames: 40,
        color: "#64748b",
        tooltip: "Raw field; reload type 2",
      },
      {
        label: "0xA502BCF2",
        frames: 180,
        color: "#2563eb",
        tooltip: "Raw field; reload type 2",
      },
    ]);
  });
});
