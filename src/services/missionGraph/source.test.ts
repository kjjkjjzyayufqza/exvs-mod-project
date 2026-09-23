// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { MISSION_C_TEMPLATE } from "../missionTranspiler/template";
import { cTokens, generateC, modelFromC } from "../missionTranspiler/transpile";
import { buildGraph, graphFromModel, graphToModel, importCGraph } from "./graph";

mkdirSync("tmp/mission-source-tests", { recursive: true });
const directory = mkdtempSync("tmp/mission-source-tests/roundtrip-");
const original = "\uFEFF// Author mission notes\r\n" + MISSION_C_TEMPLATE
  .replace("global2 = 0x1d4c;", "global2 = 0x1d4c; // Keep the mission tuning note")
  .replace(/\r?\n/g, "\r\n");
writeFileSync(join(directory, "original.c"), original);

function diskRoundTrip(name: string, edit: (graph: ReturnType<typeof importCGraph>) => void) {
  const source = readFileSync(join(directory, "original.c"), "utf8");
  const graph = importCGraph(source);
  edit(graph);
  const build = buildGraph(graph, source);
  const destination = join(directory, `${name}.c`);
  writeFileSync(destination, build.c);
  expect(modelFromC(readFileSync(destination, "utf8"))).toEqual(graphToModel(graph));
  expect(readFileSync(join(directory, "original.c"), "utf8")).toBe(original);
  return build.c;
}

describe("source-backed mission file editing", () => {
  it("keeps a no-op source byte-identical, including BOM, comments and CRLF", () => {
    expect(diskRoundTrip("unchanged", () => {})).toBe(original);
  });

  it("updates one cost without replacing runtime functions or other source text", () => {
    const saved = diskRoundTrip("cost", (graph) => { graph.battle.teamCosts[1].cost = 9000; });
    expect(saved.slice(0, saved.indexOf("void func_32()"))).toBe(original.slice(0, original.indexOf("void func_32()")));
    expect(saved.slice(saved.indexOf("void func_33()"))).toBe(original.slice(original.indexOf("void func_33()")));
    expect(saved).toContain("global2 = 0x2328; // Keep the mission tuning note");
    expect(saved).toContain("// AI decision (");
    expect(saved.replaceAll("\r\n", "")).not.toContain("\n");
    expect(buildGraph(importCGraph(saved), saved).c).toBe(saved);
  });

  it("preserves all 51 slot words while changing unit, AI and signed spawn coordinates", () => {
    const saved = diskRoundTrip("unit", (graph) => {
      graph.slots[2].params[2] = 10050101;
      graph.slots[2].params[20] = 4;
      graph.slots[2].params[34] = -300 >>> 0;
      graph.slots[2].params[38] = -90 >>> 0;
    });
    const oldSlot = modelFromC(original).slots[2];
    const slot = modelFromC(saved).slots[2];
    slot.forEach((word, index) => { if (![2, 20, 34, 38].includes(index)) expect(word).toBe(oldSlot[index]); });
  });

  it("writes added and removed phases and actions and reopens the resulting file", () => {
    const model = modelFromC(original);
    model.phases[0].delaySeconds = 3;
    model.phases[0].actions.unshift({ op: "bgm", bgm: 0x12345678 });
    model.phases.push({ trigger: { kind: "elapsed_frames_at_least", value: 600 }, delaySeconds: 2, actions: [] });
    const saved = buildGraph(graphFromModel(model), original).c;
    writeFileSync(join(directory, "phases.c"), saved);
    expect(modelFromC(readFileSync(join(directory, "phases.c"), "utf8"))).toEqual(model);
    expect(saved.slice(0, saved.indexOf("void func_35()"))).toBe(original.slice(0, original.indexOf("void func_35()")));
    model.phases.pop();
    expect(modelFromC(buildGraph(graphFromModel(model), saved).c)).toEqual(model);
  });

  it("retains source comments when structural edits regenerate a content body", () => {
    const source = original.replace("void func_35()\r\n{", "void func_35()\r\n{\r\n    // Timing reviewed by author");
    const model = modelFromC(source);
    model.phases.push({ trigger: { kind: "enemies_alive_at_most", value: 0 }, delaySeconds: 1, actions: [] });
    expect(buildGraph(graphFromModel(model), source).c).toContain("// Timing reviewed by author");
  });

  it("rejects unsupported source runtime and broken graphs instead of replacing them with a template", () => {
    const graph = importCGraph(original);
    expect(() => buildGraph(graph, original.replace("global1 = 0x3e8;", "global1 = 0x3e9;"))).toThrow(/template code changed/);
    graph.edges = [];
    expect(() => buildGraph(graph, original)).toThrow(/connect|flow/i);
  });

  it("treats layout and aliases as editor-only metadata", () => {
    expect(diskRoundTrip("layout", (graph) => {
      graph.nodes[0].x += 100;
      graph.aliases.push({ kind: "map", value: graph.battle.map, alias: "Test map" });
    })).toBe(original);
  });

  it("preserves a byte-identical file even when configuration assignments use a different order", () => {
    const source = original.replace("    global1 = 0x1770;\r\n    global2 = 0x1d4c; // Keep the mission tuning note", "    global2 = 0x1d4c; // Keep the mission tuning note\r\n    global1 = 0x1770;")
      .replace("    global16 = 0x1;\r\n    global17 = 0x5;", "    global17 = 0x5;\r\n    global16 = 0x1;");
    expect(buildGraph(importCGraph(source), source).c === source).toBe(true);
  });

  it("grows slot definitions and opening deployment without touching initialization", () => {
    const model = modelFromC(original);
    const slot = [...model.slots[2]];
    slot[0] = 8;
    slot[41] = 0xabcdef01;
    model.slots.push(slot);
    model.opening.push(8);
    const output = buildGraph(graphFromModel(model), original).c;
    writeFileSync(join(directory, "opening.c"), output);
    expect(modelFromC(readFileSync(join(directory, "opening.c"), "utf8"))).toEqual(model);
    expect(output.slice(output.indexOf("void func_33()"), output.indexOf("void func_34()")))
      .toBe(original.slice(original.indexOf("void func_33()"), original.indexOf("void func_34()")));
  });

  it("refuses invalid rules, absent slots, duplicate deployments and zero delays before writing", () => {
    for (const edit of [
      (model: ReturnType<typeof modelFromC>) => { model.battle.win = 2; model.battle.targetCount = 0; },
      (model: ReturnType<typeof modelFromC>) => { model.opening.push(255); },
      (model: ReturnType<typeof modelFromC>) => { model.opening.push(model.opening[0]); },
      (model: ReturnType<typeof modelFromC>) => { model.phases[0].delaySeconds = 0; },
    ]) {
      const model = modelFromC(original);
      edit(model);
      expect(() => buildGraph(graphFromModel(model), original)).toThrow();
    }
  });

  it("passes the MSC annotation gate for both vanilla and already annotated generated files", () => {
    for (const [i, source] of [original, generateC(modelFromC(original))].entries()) {
      const graph = importCGraph(source);
      graph.battle.teamCosts[1].cost = 8000;
      const output = join(directory, `annotated-${i}.c`);
      writeFileSync(output, buildGraph(graph, source).c);
      const checked = spawnSync("python", ["tools/check_msc_ai_blocks.py", output], { encoding: "utf8" });
      expect(checked.status, checked.stdout + checked.stderr).toBe(0);
    }
  });

  it("does not bypass the control-flow gate through raw blackboard or coroutine calls", () => {
    for (const command of [0x601, 0x604, 0x802, 0x803]) {
      const model = modelFromC(original);
      model.phases[0].actions.push({ op: "raw_sys", command, args: [1, 0] });
      expect(() => graphFromModel(model)).toThrow(/runtime-owned/);
    }
  });
});

const reference = process.env.EXVS_MISSION_SOURCE;
describe.skipIf(!reference)("real mission file oracle (read-only input)", () => {
  it("loads A-1-1, saves modifications only under tmp and emits a compiler fixture", () => {
    const bytes = readFileSync(reference!);
    const source = bytes.toString("utf8");
    const graph = importCGraph(source);
    expect(graph.slots).toHaveLength(8);
    expect(buildGraph(graph, source).c).toBe(source);
    graph.battle.teamCosts[1].cost = 9000;
    graph.slots[2].params[34] = -250 >>> 0;
    const phase = graph.nodes.find((node) => node.data.kind === "condition")!;
    if (phase.data.kind === "condition") phase.data.delaySeconds = 2;
    const build = buildGraph(graph, source);
    const output = "tmp/mission-source-tests/reference-edited.c";
    writeFileSync(output, build.c);
    expect(modelFromC(readFileSync(output, "utf8"))).toEqual(graphToModel(graph));
    expect(cTokens(build.c.slice(0, build.c.indexOf("void func_32()"))))
      .toEqual(cTokens(source.slice(0, source.indexOf("void func_32()"))));
    expect(readFileSync(reference!)).toEqual(bytes);
  });
});
