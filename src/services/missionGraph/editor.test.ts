import { describe, expect, it } from "vitest";
import { createGraph, graphToModel, parseGraph } from "./graph";
import { addComment, alignSelection, copySelection, deleteEnemySlot, deleteGraphFocus, deleteSelection, edgeId, layoutGraph, moveElements, parseFragment, pasteSelection } from "./editor";
import { insertAction, insertPhaseAfter, insertPhaseBefore, moveAction, removePhase, addDraft } from "./commands";
import { derivePhaseProjection } from "./projection";
import { blockingErrors, collectGraphIssues } from "./issues";
import { applyLinearTemplate } from "./templates";
import { builtinCatalog, EMPTY_CATALOG, mergeCatalogs, TEMPLATE_MESSAGE_HASH } from "./resources";

describe("mission graph editing commands", () => {
  it("loads existing v1 documents and preserves comments / viewport on a save round trip", () => {
    const graph = createGraph();
    const { comments, ...legacy } = graph;
    expect(parseGraph(JSON.stringify(legacy)).comments).toEqual([]);
    const commented = addComment(graph, [graph.nodes[1].id], { x: 100, y: 100 }).graph;
    commented.viewport = { x: -180, y: 30, zoom: 0.7 };
    expect(parseGraph(JSON.stringify(commented))).toEqual(commented);
    expect(graphToModel(commented)).toEqual(graphToModel(graph));
  });

  it("duplicates a subgraph with fresh IDs and only internal connections", () => {
    const graph = createGraph(), selection = graph.nodes.slice(1, 4).map((n) => n.id);
    const fragment = parseFragment(JSON.stringify(copySelection(graph, selection)));
    const { graph: next, selected } = pasteSelection(graph, fragment, { x: 640, y: 640 });
    expect(selected).toHaveLength(3);
    expect(selected.every((id) => !graph.nodes.some((n) => n.id === id))).toBe(true);
    expect(next.edges.slice(graph.edges.length)).toEqual([
      { source: selected[0], target: selected[1] }, { source: selected[1], target: selected[2] },
    ]);
    expect(next.nodes[graph.nodes.length].x).toBe(640);
    expect(next.nodes[graph.nodes.length].data).toEqual(graph.nodes[1].data);
    next.nodes[graph.nodes.length].label = "Changed clone";
    expect(graph.nodes[1].label).not.toBe("Changed clone");
  });

  it("deletes a focused action without removing its parent phase", () => {
    const graph = layoutGraph(createGraph());
    const withAction = insertAction(graph, graph.nodes[1].id, "message").graph;
    const actionId = withAction.nodes.find((node) => node.data.kind === "message")!.id;
    const incoming = withAction.edges.find((edge) => edge.target === actionId)!;
    const outgoing = withAction.edges.find((edge) => edge.source === actionId)!;
    const next = deleteGraphFocus(withAction, actionId);
    expect(next.nodes.some((node) => node.id === actionId)).toBe(false);
    expect(next.nodes.some((node) => node.data.kind === "condition")).toBe(true);
    expect(next.edges).toContainEqual({ source: incoming.source, target: outgoing.target });
  });

  it("reconnects the previous node when a phase is deleted", () => {
    const graph = layoutGraph(createGraph());
    const phaseId = graph.nodes.find((node) => node.data.kind === "condition")!.id;
    const phase = derivePhaseProjection(graph).phases.find((entry) => entry.id === phaseId)!;
    const incoming = graph.edges.find((edge) => edge.target === phaseId)!;
    const outgoing = graph.edges.find((edge) => edge.source === phase.lastNodeId)!;
    const next = deleteGraphFocus(graph, phaseId);
    expect(phase.memberIds.every((id) => !next.nodes.some((node) => node.id === id))).toBe(true);
    expect(next.edges).toContainEqual({ source: incoming.source, target: outgoing.target });
  });

  it("deletes a cloned enemy together with the deploy that references it", () => {
    const graph = createGraph();
    const enemy = graph.slots.find((slot) => slot.params[3] === 1)!;
    const cloneId = 8;
    const params = [...enemy.params];
    params[0] = cloneId;
    const withClone = {
      ...graph,
      slots: [...graph.slots, { name: "Enemy 8", params }],
    };
    const inserted = insertAction(withClone, withClone.nodes[1].id, "deploy");
    const deployId = inserted.select!;
    const pointing = {
      ...inserted.graph,
      nodes: inserted.graph.nodes.map((node) => node.id === deployId && node.data.kind === "deploy"
        ? { ...node, data: { ...node.data, slot: cloneId } }
        : node),
    };
    const next = deleteEnemySlot(pointing, cloneId);
    expect(next).not.toBeNull();
    expect(next!.slots.some((slot) => slot.params[0] === cloneId)).toBe(false);
    expect(next!.nodes.some((node) => node.id === deployId)).toBe(false);
    const start = next!.nodes.find((node) => node.data.kind === "start")!;
    expect(next!.edges.some((edge) => edge.source === start.id)).toBe(true);
    expect(deleteEnemySlot(graph, 0)).toBeNull();
  });

  it("protects Start / End while deleting a selection and incident wires atomically", () => {
    const graph = createGraph();
    const fragment = copySelection(graph, graph.nodes.map((n) => n.id));
    expect(fragment.nodes.some((n) => ["start", "end"].includes(n.data.kind))).toBe(false);
    const next = deleteSelection(graph, graph.nodes.map((n) => n.id), []);
    expect(next.nodes.map((n) => n.data.kind)).toEqual(["start", "end"]);
    expect(next.edges).toEqual([]);
    expect(deleteSelection(graph, [], [edgeId(graph.edges[0])]).edges).toHaveLength(graph.edges.length - 1);
  });

  it("moves enclosed nodes with a comment once, including an explicitly selected child", () => {
    const graph = layoutGraph(createGraph()), node = graph.nodes[1];
    const { graph: grouped, id } = addComment(graph, [node.id], { x: 0, y: 0 });
    const frame = grouped.comments[0];
    const next = moveElements(grouped, new Map([[id, { x: frame.x + 160, y: frame.y + 80 }], [node.id, { x: node.x + 160, y: node.y + 80 }]]));
    expect(next.nodes[1]).toMatchObject({ x: node.x + 160, y: node.y + 80 });
    expect(next.nodes[0]).toEqual(graph.nodes[0]);
    expect(graphToModel(next)).toEqual(graphToModel(graph));
    expect(moveElements(grouped, new Map([[id, { x: frame.x + 160, y: frame.y + 80 }]])).nodes[1]).toEqual(next.nodes[1]);
  });

  it("aligns and lays out without losing annotations or changing execution", () => {
    const graph = createGraph();
    const ids = graph.nodes.slice(1, 3).map((n) => n.id);
    const next = alignSelection(graph, ids, "y");
    expect(next.nodes[1].y).toBe(next.nodes[2].y);
    const annotated = addComment(graph, ids, { x: 0, y: 0 }).graph;
    const layout = layoutGraph(annotated);
    expect(layout.comments.map((c) => c.id)).toEqual(annotated.comments.map((c) => c.id));
    expect(graphToModel(layout)).toEqual(graphToModel(graph));
  });

  it("rejects malformed or oversized clipboard data and missing cross-document slots", () => {
    const graph = createGraph(), fragment = copySelection(graph, graph.nodes.slice(1, 2).map((n) => n.id));
    expect(() => parseFragment("not a graph")).toThrow();
    expect(() => parseFragment("x".repeat(512 * 1024 + 1))).toThrow("512 KiB");
    expect(() => parseFragment(JSON.stringify({ ...fragment, edges: [{ source: "missing", target: fragment.nodes[0].id }] }))).toThrow("dangling");
    expect(() => parseFragment(JSON.stringify({ ...fragment, nodes: [fragment.nodes[0], fragment.nodes[0]] }))).toThrow("duplicate");
    fragment.nodes[0].data = { kind: "deploy", slot: 255 };
    expect(() => pasteSelection(graph, fragment, { x: 0, y: 0 })).toThrow("missing slot 255");
  });

  it("inserts phases and reorders actions without changing Start / End identity", () => {
    const graph = layoutGraph(createGraph());
    const start = graph.nodes.find((node) => node.data.kind === "start")!;
    const inserted = insertPhaseAfter(graph, start.id).graph;
    expect(graphToModel(inserted).phases).toHaveLength(graphToModel(graph).phases.length + 1);
    const phase = derivePhaseProjection(inserted).phases.find((entry) => entry.actions.length > 0)!;
    const withAction = insertAction(inserted, phase.id, "message").graph;
    const message = withAction.nodes.find((node) => node.data.kind === "message" && !graph.nodes.some((entry) => entry.id === node.id))!;
    expect(moveAction(withAction, message.id, -1).semantic).toBe(true);
    const trimmed = removePhase(withAction, phase.id).graph;
    expect(trimmed.nodes.some((node) => node.id === start.id)).toBe(true);
    expect(trimmed.nodes.some((node) => node.data.kind === "end")).toBe(true);
    expect(graphToModel(layoutGraph(graph))).toEqual(graphToModel(graph));
  });

  it("keeps Opening / Phase / End on a lane and records a single semantic history step", () => {
    const graph = layoutGraph(createGraph());
    const start = graph.nodes.find((node) => node.data.kind === "start")!;
    expect(start).toMatchObject({ x: 0, y: 0 });
    const phase = derivePhaseProjection(graph).phases[0];
    expect(graph.nodes.find((node) => node.id === phase.id)!.x).toBeGreaterThan(start.x);
    const inserted = insertPhaseAfter(graph, start.id);
    expect(inserted.semantic).toBe(true);
    expect(graphToModel(inserted.graph).phases.length).toBe(graphToModel(graph).phases.length + 1);
  });

  it("inserts a phase before Opening after opening deploys, not as a disconnected draft", () => {
    const graph = layoutGraph(createGraph());
    const opening = derivePhaseProjection(graph).opening!;
    const next = insertPhaseBefore(graph, opening.id).graph;
    expect(derivePhaseProjection(next).drafts).toEqual([]);
    expect(derivePhaseProjection(next).linear).toBe(true);
    expect(graphToModel(next).phases.length).toBe(graphToModel(graph).phases.length + 1);
  });

  it("applies a linear message-deploy wave without branching or duplicate deploys", () => {
    const graph = layoutGraph(createGraph());
    const next = applyLinearTemplate(graph, "message-deploy-wave").graph;
    const projection = derivePhaseProjection(next);
    expect(projection.linear).toBe(true);
    expect(projection.drafts).toEqual([]);
    expect(graphToModel(next).phases.length).toBe(graphToModel(graph).phases.length + 1);
    expect(blockingErrors(collectGraphIssues(next))).toEqual([]);
    expect(next.nodes.some((node) => node.data.kind === "message" && node.data.messageHash === TEMPLATE_MESSAGE_HASH)).toBe(true);
  });

  it("merges workspace BGM names onto the builtin catalog", () => {
    const merged = mergeCatalogs(builtinCatalog(), {
      ...EMPTY_CATALOG,
      bgm: [{ kind: "bgm", value: 1, label: "Cue", source: "catalog", evidence: "named" }],
    });
    expect(merged.maps.length).toBeGreaterThan(0);
    expect(merged.bgm).toEqual([{ kind: "bgm", value: 1, label: "Cue", source: "catalog", evidence: "named" }]);
    expect(merged.messages.some((option) => option.value === TEMPLATE_MESSAGE_HASH)).toBe(true);
  });

  it("adds research-only Planned TODO drafts and refuses No-Go instantiation", () => {
    const graph = layoutGraph(createGraph());
    const added = addDraft(graph, "planned_loop", 48, 580);
    expect(added.semantic).toBe(true);
    expect(added.graph.nodes.at(-1)?.data.kind).toBe("planned_loop");
    expect(parseGraph(JSON.stringify(added.graph)).nodes.at(-1)?.data.kind).toBe("planned_loop");
    expect(derivePhaseProjection(added.graph).planned).toHaveLength(1);
    expect(() => graphToModel(added.graph)).toThrow(/TODO/);
    expect(blockingErrors(collectGraphIssues(added.graph)).some((issue) => issue.target.nodeId === added.select)).toBe(true);
    expect(() => addDraft(graph, "planned_nogo_steal_802", 48, 580)).toThrow(/TODO No-Go/);
    expect(graphToModel(graph)).toEqual(graphToModel(createGraph()));
  });
});
