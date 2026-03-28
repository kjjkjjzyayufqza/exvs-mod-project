import { describe, expect, it } from "vitest";
import { ensureMatlDataSerdeFields } from "./daeSsbhTypes";
import type { MatlDataJson } from "./types";

describe("ensureMatlDataSerdeFields for Rust MatlData JSON", () => {
  it("coerces 0/1 integers to booleans for blend_states and booleans buckets", () => {
    const raw = {
      major_version: 1,
      minor_version: 6,
      entries: [
        {
          material_label: "m",
          shader_label: "",
          blend_states: [
            {
              param_id: "BlendState0",
              data: {
                source_color: "One",
                color_operation: "Add",
                destination_color: "Zero",
                source_alpha: "One",
                alpha_operation: "Add",
                destination_alpha: "Zero",
                alpha_sample_to_coverage: 0,
              },
            },
          ],
          booleans: [
            { param_id: "UseNormalMap", data: 0 },
            { param_id: "UseRoughnessMap", data: 1 },
          ],
          textures: [],
        },
      ],
    };
    const out = ensureMatlDataSerdeFields(raw as unknown as MatlDataJson);
    const entry = out.entries[0];
    const blend = entry.blend_states?.[0]?.data as { alpha_sample_to_coverage: boolean };
    expect(blend.alpha_sample_to_coverage).toBe(false);
    expect(entry.booleans?.[0].data).toBe(false);
    expect(entry.booleans?.[1].data).toBe(true);
  });
});
