import { describe, expect, it } from "vitest";
import { MISSION_C_TEMPLATE } from "./template";
import { cTokens, generateC, modelFromC } from "./transpile";
import { TEMPLATE_SLOTS } from "./model";
import { initialDebugState, stepMission } from "./debugger";

describe("mission MSC C model", () => {
  it("parses the embedded template and round-trips through generateC", () => {
    const original = modelFromC(MISSION_C_TEMPLATE);
    expect(original.slots).toEqual(TEMPLATE_SLOTS);
    expect(original.phases).toHaveLength(4);
    expect(modelFromC(generateC(original))).toEqual(original);
    expect(original.slots[0][36]).toBe(0xffffffd8);
  });

  it("refuses custom runtime logic, duplicate functions, missing terminal and added statements", () => {
    for (const source of [
      MISSION_C_TEMPLATE.replace("sys_0(0x802, 0x9de)", "sys_0(0x802, 0x9df)"),
      MISSION_C_TEMPLATE.replace("global21 = 0;", "global21 = 1;"),
      MISSION_C_TEMPLATE + "void func_36() {}",
      MISSION_C_TEMPLATE.replace(/else if \(global20 == 0x4\)[\s\S]*$/, "}"),
      MISSION_C_TEMPLATE.replace("global19 = 0xba15df91;", "global19 = 0xba15df91; sys_0(0x800);"),
    ]) {
      expect(() => modelFromC(source)).toThrow();
    }
  });

  it("supports an empty wave chain with an explicit terminal branch", () => {
    const model = modelFromC(MISSION_C_TEMPLATE);
    model.phases = [];
    expect(modelFromC(generateC(model))).toEqual(model);
  });

  it("tokenizes the embedded template", () => {
    expect(cTokens(MISSION_C_TEMPLATE).length).toBeGreaterThan(100);
  });
});

describe("phase simulator", () => {
  it("pauses the counter when the condition is false and stops after one phase", () => {
    const model = modelFromC(MISSION_C_TEMPLATE);
    const inputs = { enemiesAlive: 1, elapsedFrames: 0, hpPercent: {} };
    const armed = stepMission(model, initialDebugState(), inputs);
    expect(armed.counter).toBe(60);
    const paused = stepMission(model, armed, { ...inputs, enemiesAlive: 2 }, 60);
    expect(paused.counter).toBe(60);
    const fired = stepMission(model, paused, inputs, 600);
    expect(fired.phase).toBe(1);
    expect(fired.counter).toBe(0);
    expect(fired.log[0]).toContain("deploy slot 4");
  });

  it("requires explicit HP observations and supports time triggers", () => {
    const model = modelFromC(MISSION_C_TEMPLATE);
    model.phases[0].trigger = { kind: "slot_hp_percent_at_most", slot: 2, value: 50 };
    expect(stepMission(model, initialDebugState(), { enemiesAlive: 0, elapsedFrames: 999, hpPercent: {} }, 60).counter).toBe(0);
    model.phases[0].trigger = { kind: "elapsed_frames_at_least", value: 100 };
    expect(stepMission(model, initialDebugState(), { enemiesAlive: 0, elapsedFrames: 99, hpPercent: {} }, 2).counter).toBe(60);
  });
});
