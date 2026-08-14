import { describe, expect, it } from "vitest";
import { ensureMatlDataSerdeFields } from "./daeSsbhTypes";
import type { MatlDataJson } from "./types";
import mayaFixtureJson from "./fixtures/015gndmuc_004deltpl_001_body_normal__maya__.numatb.json";
import nustFixtureJson from "./fixtures/015gndmuc_004deltpl_001_body_normal__nust__.numatb.json";

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

  it("coerces map-form colors/vectors/border_color to [f32;4] for ssbh_data MatlData", () => {
    const raw = {
      major_version: 1,
      minor_version: 6,
      entries: [
        {
          material_label: "pbr1Mtl",
          shader_label: "vsngCharaBasic",
          colors: [{ param_id: "Diffuse", data: { r: 1, g: 0.5, b: 0, a: 1 } }],
          vectors: [{ param_id: "CustomVector0", data: { x: 0, y: 1, z: 2, w: 3 } }],
          samplers: [
            {
              param_id: "DiffuseSampler",
              data: {
                wraps: "Repeat",
                wrapt: "Repeat",
                border_color: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
              },
            },
          ],
          textures: [],
        },
      ],
    };
    const out = ensureMatlDataSerdeFields(raw as unknown as MatlDataJson);
    const entry = out.entries[0];
    expect(entry.colors?.[0].data).toEqual([1, 0.5, 0, 1]);
    expect(entry.vectors?.[0].data).toEqual([0, 1, 2, 3]);
    const sampler = entry.samplers?.[0]?.data as { border_color: number[] };
    expect(sampler.border_color).toEqual([0.5, 0.5, 0.5, 1]);
  });

  it("normalizes embedded default maya/nust fixtures without map-shaped vec4 leftovers", () => {
    for (const fixture of [mayaFixtureJson, nustFixtureJson]) {
      const out = ensureMatlDataSerdeFields(fixture as MatlDataJson);
      for (const entry of out.entries) {
        for (const row of entry.colors ?? []) {
          expect(Array.isArray(row.data)).toBe(true);
          expect((row.data as number[]).length).toBe(4);
        }
        for (const row of entry.vectors ?? []) {
          expect(Array.isArray(row.data)).toBe(true);
          expect((row.data as number[]).length).toBe(4);
        }
        for (const row of entry.samplers ?? []) {
          const data = row.data as { border_color?: unknown } | undefined;
          if (data && "border_color" in data && data.border_color !== undefined) {
            expect(Array.isArray(data.border_color)).toBe(true);
            expect((data.border_color as number[]).length).toBe(4);
          }
        }
      }
    }
  });
});
