import { describe, expect, it } from "vitest";
import { MISSION_C_TEMPLATE } from "@/services/missionTranspiler/template";
import { modelFromC } from "@/services/missionTranspiler/transpile";
import { blockingErrors, collectGraphIssues } from "./issues";
import { derivePhaseProjection } from "./projection";
import { buildGraph, connectNodes, createGraph, graphFromModel, graphToModel, importCGraph, newNode, parseGraph, removeNode } from "./graph";

describe("mission node graph", () => {
  it("preserves the embedded mission and all 51 slot words without a Lua conversion", () => {
    const graph = createGraph();
    const reference = modelFromC(MISSION_C_TEMPLATE);
    expect(graphToModel(graph)).toEqual(reference);
    const result = buildGraph(graph);
    expect(modelFromC(result.c)).toEqual(reference);
    expect(graphToModel(importCGraph(result.c))).toEqual(reference);
    expect(parseGraph(JSON.stringify(graph))).toEqual(graph);
  });

  it("uses connections rather than node order or canvas layout", () => {
    const graph = createGraph();
    const reference = graphToModel(graph);
    graph.nodes.reverse();
    graph.nodes.forEach((n) => { n.x += 321; n.y -= 125; });
    expect(graphToModel(graph)).toEqual(reference);
  });

  it("keeps per-slot spawn words and preserves unrelated raw parameters", () => {
    const graph = createGraph();
    const slot = graph.slots[2];
    slot.params[34] = -1350 >>> 0;
    slot.params[35] = 40;
    slot.params[36] = 520;
    slot.params[38] = -90 >>> 0;
    const result = graphToModel(parseGraph(JSON.stringify(graph))).slots[2];
    expect(result.slice(34, 37)).toEqual([-1350 >>> 0, 40, 520]);
    expect(result[38]).toBe(-90 >>> 0);
    expect(result.slice(0, 34)).toEqual(slot.params.slice(0, 34));
    expect(result.slice(39)).toEqual(slot.params.slice(39));
  });

  it("inserts a new phase by rewiring ports and rejects cycles atomically", () => {
    let graph = createGraph();
    const end = graph.nodes.find((n) => n.data.kind === "end")!;
    const old = graph.edges.find((e) => e.target === end.id)!;
    const condition = newNode("condition", graph);
    graph.nodes.push(condition);
    graph = connectNodes(graph, old.source, condition.id);
    graph = connectNodes(graph, condition.id, end.id);
    expect(graphToModel(graph).phases).toHaveLength(createGraph().nodes.filter((n) => n.data.kind === "condition").length + 1);
    const firstCondition = graph.nodes.find((n) => n.data.kind === "condition")!;
    const before = JSON.stringify(graph);
    expect(() => connectNodes(graph, condition.id, firstCondition.id)).toThrow("cycle");
    expect(JSON.stringify(graph)).toBe(before);
  });

  it("rejects disconnected nodes, missing links, branches and duplicate deployment", () => {
    const graph = createGraph();
    const detached = { ...graph, nodes: [...graph.nodes, newNode("condition", graph)] };
    expect(() => buildGraph(detached)).toThrow("Disconnected");
    expect(() => buildGraph({ ...graph, edges: graph.edges.slice(1) })).toThrow("connect the output");
    expect(() => buildGraph({ ...graph, edges: [...graph.edges, graph.edges[0]] })).toThrow("Branching");
    const model = graphToModel(graph);
    model.phases[0].actions.push({ op: "deploy", slot: model.opening[0] });
    expect(() => graphFromModel(model)).toThrow("more than once");
  });

  it("validates JSON versions, references, commands and primitive ranges at import", () => {
    const graph = createGraph();
    expect(() => parseGraph(JSON.stringify({ ...graph, format: "next" }))).toThrow();
    expect(() => parseGraph(JSON.stringify({ ...graph, extra: 1 }))).toThrow();
    graph.slots[1].params[0] = graph.slots[0].params[0];
    expect(() => parseGraph(JSON.stringify(graph))).toThrow("slot IDs");
    const invalid = createGraph();
    invalid.nodes.push({ ...newNode("message", invalid), data: { kind: "message", slot: 0, messageHash: -1 } });
    expect(() => parseGraph(JSON.stringify(invalid))).toThrow();
    invalid.nodes.pop();
    invalid.battle.map = NaN;
    expect(() => buildGraph(invalid)).toThrow();
  });

  it("allows saving a disconnected draft but never compiling it", () => {
    const graph = createGraph();
    const removable = graph.nodes.find((n) => n.data.kind === "deploy")!;
    const draft = removeNode(graph, removable.id);
    expect(parseGraph(JSON.stringify(draft))).toEqual(draft);
    expect(() => buildGraph(draft)).toThrow();
    const start = graph.nodes.find((n) => n.data.kind === "start")!;
    expect(removeNode(graph, start.id)).toBe(graph);
  });

  it("projects a linear Opening / Phase / End chain and lists every issue at once", () => {
    const graph = createGraph();
    const projection = derivePhaseProjection(graph);
    expect(projection.linear).toBe(true);
    expect(projection.drafts).toEqual([]);
    expect(projection.planned).toEqual([]);
    expect(projection.opening?.actions.every((action) => action.kind === "deploy")).toBe(true);
    expect(projection.phases).toHaveLength(graph.nodes.filter((node) => node.data.kind === "condition").length);
    expect(blockingErrors(collectGraphIssues(graph))).toEqual([]);
    expect(collectGraphIssues(graph).map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "linear-supported", "unsupported-control-flow", "budget-scope", "e1-scope", "end-runtime",
    ]));
    expect(collectGraphIssues(graph).some((issue) => issue.code === "unknown-message")).toBe(false);
    const detached = { ...graph, nodes: [...graph.nodes, newNode("condition", graph)] };
    const issues = collectGraphIssues(detached);
    expect(issues.filter((issue) => issue.code === "draft" && issue.severity === "error").length).toBe(1);
    expect(blockingErrors(issues).length).toBeGreaterThan(0);
  });

  it("round-trips optional aliases and collapse metadata without changing compiled output", () => {
    const graph = createGraph();
    const condition = graph.nodes.find((node) => node.data.kind === "condition")!;
    graph.aliases = [{ kind: "map", value: graph.battle.map, alias: "Side 7" }];
    graph.collapsed = [condition.id];
    const restored = parseGraph(JSON.stringify(graph));
    expect(restored.aliases).toEqual(graph.aliases);
    expect(restored.collapsed).toEqual([condition.id]);
    expect(graphToModel(restored)).toEqual(graphToModel(createGraph()));
  });

  it("round-trips Planned TODO nodes, keeps them out of the compiled chain, and locates Generate errors", () => {
    const graph = createGraph();
    const research = {
      ...graph,
      nodes: [...graph.nodes, { id: "planned-branch", label: "Branch sketch", x: 8, y: 580, data: { kind: "planned_branch" as const } }],
    };
    const restored = parseGraph(JSON.stringify(research));
    expect(restored.nodes.some((node) => node.id === "planned-branch" && node.data.kind === "planned_branch")).toBe(true);
    expect(derivePhaseProjection(restored).planned.map((node) => node.id)).toEqual(["planned-branch"]);
    expect(derivePhaseProjection(restored).drafts).toEqual([]);
    expect(() => graphToModel(restored)).toThrow(/TODO planned control-flow cannot compile/);
    expect(() => graphToModel(restored)).not.toThrow(/Disconnected/);
    const researchIssues = collectGraphIssues(restored);
    expect(researchIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "planned-control-flow", severity: "error", target: { nodeId: "planned-branch" } }),
    ]));
    expect(researchIssues.find((issue) => issue.code === "planned-control-flow")?.message).toMatch(/TODO/);
    expect(blockingErrors(researchIssues).length).toBeGreaterThan(0);
    expect(graphToModel(createGraph())).toEqual(graphToModel(graph));

    const nogo = {
      ...graph,
      nodes: [...graph.nodes, { id: "nogo-3c", label: "Row 0x3c", x: 8, y: 580, data: { kind: "planned_nogo_row_3c" as const } }],
    };
    expect(parseGraph(JSON.stringify(nogo)).nodes.at(-1)?.data.kind).toBe("planned_nogo_row_3c");
    expect(() => graphToModel(nogo)).toThrow(/TODO No-Go/);
    const nogoIssues = collectGraphIssues(nogo);
    expect(nogoIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "planned-nogo", severity: "error", target: { nodeId: "nogo-3c" } }),
    ]));
    expect(nogoIssues.find((issue) => issue.code === "planned-nogo")?.message).toMatch(/TODO No-Go/);
  });
});
