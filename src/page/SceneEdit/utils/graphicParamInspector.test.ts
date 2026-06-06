import { describe, expect, it } from "vitest";
import {
  buildGraphicParamInspectorRows,
  formatGraphicParamLabel,
  groupIndexedGraphicParams,
} from "./graphicParamInspector";

describe("graphicParamInspector", () => {
  it("formats snake_case keys as readable labels", () => {
    expect(formatGraphicParamLabel("shadow_near_clip")).toBe("Shadow Near Clip");
  });

  it("groups _r/_g/_b channels into one color row", () => {
    const params = [
      { key: "shadow_add_color_r", value: "0" },
      { key: "shadow_add_color_g", value: "0.2" },
      { key: "shadow_add_color_b", value: "1" },
      { key: "fog_alpha_boost", value: "1" },
    ];

    const rows = buildGraphicParamInspectorRows(
      params.map((p, originalIndex) => ({ ...p, originalIndex })),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.kind).toBe("color");
    if (rows[0]?.kind === "color") {
      expect(rows[0].label).toBe("Shadow Add Color");
    }
    expect(rows[1]?.kind).toBe("scalar");
  });

  it("filters grouped rows by key substring", () => {
    const params = [
      { key: "shadow_near_clip", value: "5" },
      { key: "fog_alpha_boost", value: "1" },
    ];
    const grouped = groupIndexedGraphicParams(params, "fog");
    const misc = grouped.get("misc");
    const post = grouped.get("postprocess");
    const total = [...grouped.values()].reduce((n, rows) => n + rows.length, 0);
    expect(total).toBe(1);
    expect(post?.length ?? misc?.length).toBe(1);
  });

  it("keeps pfx keys in post process instead of misc", () => {
    const grouped = groupIndexedGraphicParams(
      [{ key: "pfx_bloom_bright_threshold", value: "1.25" }],
      "",
    );

    expect(grouped.get("postprocess")).toHaveLength(1);
    expect(grouped.get("misc")).toBeUndefined();
  });
});
