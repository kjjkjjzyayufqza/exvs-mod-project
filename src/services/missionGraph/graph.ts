import { z } from "zod";
import { validateMission } from "@/services/missionTranspiler/model";
import { generateC, modelFromC } from "@/services/missionTranspiler/transpile";
import { MISSION_C_TEMPLATE } from "@/services/missionTranspiler/template";
import { patchMissionSource } from "@/services/missionTranspiler/sourcePatch";
import type { MissionAction, MissionModel, MissionPhase } from "@/services/missionTranspiler/types";
import { isPlannedKind, plannedCompileMessage, PLANNED_LABELS } from "./planned";

export { isNoGoKind, isPlannedKind, isResearchOnlyKind, plannedCompileMessage, PLANNED_KINDS } from "./planned";

export const MAX_GRAPH_BYTES = 512 * 1024;
const word = z.number().int().min(0).max(0xffffffff);
const positiveInt = z.number().int().min(1).max(0x7fffffff);
const slotId = z.number().int().min(0).max(255);
const id = z.string().min(1).max(80);
const label = z.string().trim().min(1).max(120);
const triggerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("enemies_alive_at_most"), value: z.number().int().min(0).max(12) }).strict(),
  z.object({ kind: z.literal("elapsed_frames_at_least"), value: z.number().int().min(0).max(0x7fffffff) }).strict(),
  z.object({ kind: z.literal("slot_hp_percent_at_most"), slot: slotId, value: z.number().int().min(0).max(100) }).strict(),
]);
const dataSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("start") }).strict(),
  z.object({ kind: z.literal("end") }).strict(),
  z.object({ kind: z.literal("condition"), trigger: triggerSchema, delaySeconds: positiveInt.max(Math.floor(0x7fffffff / 60)) }).strict(),
  z.object({ kind: z.literal("deploy"), slot: slotId }).strict(),
  z.object({ kind: z.literal("message"), slot: slotId, messageHash: word }).strict(),
  z.object({ kind: z.literal("bgm"), bgm: word }).strict(),
  z.object({ kind: z.literal("raw_sys"), command: word.min(0x100).max(0x8ff), args: z.array(word).max(51) }).strict(),
  z.object({ kind: z.literal("planned_branch") }).strict(),
  z.object({ kind: z.literal("planned_loop") }).strict(),
  z.object({ kind: z.literal("planned_blackboard") }).strict(),
  z.object({ kind: z.literal("planned_subline") }).strict(),
  z.object({ kind: z.literal("planned_nogo_row_3c") }).strict(),
  z.object({ kind: z.literal("planned_nogo_steal_802") }).strict(),
  z.object({ kind: z.literal("planned_nogo_event_kind") }).strict(),
]);
export const graphNodeSchema = z.object({ id, label, x: z.number().min(-100000).max(100000), y: z.number().min(-100000).max(100000), data: dataSchema }).strict();
export const commentSchema = z.object({
  id, label, x: z.number().min(-100000).max(100000), y: z.number().min(-100000).max(100000),
  width: z.number().min(240).max(10000), height: z.number().min(120).max(10000),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
}).strict();
export const graphSchema = z.object({
  format: z.literal("exvs-mission-graph-v1"),
  name: label,
  battle: z.object({
    map: word, bgm: word, win: word.min(1).max(15), lose: word.min(1).max(7),
    targetCount: word.max(0x7fffffff), allowedLosses: word.max(0x7fffffff),
    teamCosts: z.array(z.object({ team: word.max(5), cost: word.max(0x7fffffff) }).strict()).min(1).max(6),
  }).strict(),
  slots: z.array(z.object({ name: label, params: z.array(word).length(51) }).strict()).min(2).max(256),
  nodes: z.array(graphNodeSchema).min(2).max(512),
  edges: z.array(z.object({ source: id, target: id }).strict()).max(512),
  comments: z.array(commentSchema).max(64).default([]),
  viewport: z.object({ x: z.number().finite(), y: z.number().finite(), zoom: z.number().min(0.1).max(2) }).strict().optional(),
  aliases: z.array(z.object({
    kind: z.enum(["bgm", "map", "message", "unit"]),
    value: word,
    alias: label,
  }).strict()).max(256).default([]),
  collapsed: z.array(id).max(512).default([]),
}).strict();

export type MissionGraph = z.infer<typeof graphSchema>;
export type GraphNode = MissionGraph["nodes"][number];
export type NodeKind = GraphNode["data"]["kind"];
export type GraphComment = MissionGraph["comments"][number];
export type GraphAlias = MissionGraph["aliases"][number];
export type AliasKind = GraphAlias["kind"];
export interface GraphBuild { model: MissionModel; c: string; warnings: string[] }
export type ActionKind = "deploy" | "message" | "bgm" | "raw_sys";
export type AddableKind = Exclude<NodeKind, "start" | "end">;

function unique(values: string[], description: string) {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${description}`);
}

/** Drafts may have disconnected nodes; only structural corruption blocks loading. */
export function parseGraph(text: string): MissionGraph {
  if (text.length > MAX_GRAPH_BYTES) throw new Error("Graph exceeds 512 KiB");
  return checkDocument(JSON.parse(text));
}

export function checkDocument(value: unknown): MissionGraph {
  const graph = graphSchema.parse(value);
  unique([...graph.nodes, ...graph.comments].map((n) => n.id), "node IDs");
  unique(graph.slots.map((s) => String(s.params[0])), "slot IDs");
  const nodes = new Set(graph.nodes.map((n) => n.id));
  for (const edge of graph.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) throw new Error("Connection references a missing node");
  }
  return graph;
}

/** Execution follows connections, never canvas position or array order. */
export function graphToModel(value: MissionGraph): MissionModel {
  const graph = checkDocument(value);
  const starts = graph.nodes.filter((n) => n.data.kind === "start");
  if (starts.length !== 1 || graph.nodes.filter((n) => n.data.kind === "end").length !== 1) throw new Error("Exactly one Start and one End node are required");
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const next = new Map<string, string>();
  const incoming = new Set<string>();
  for (const e of graph.edges) {
    if (next.has(e.source) || incoming.has(e.target)) throw new Error("Branching and merging are not supported by this mission template");
    if (byId.get(e.source)!.data.kind === "end" || byId.get(e.target)!.data.kind === "start") throw new Error("End cannot have an output; Start cannot have an input");
    next.set(e.source, e.target); incoming.add(e.target);
  }
  const visited = new Set<string>();
  const opening: number[] = [];
  const phases: MissionPhase[] = [];
  let phase: MissionPhase | undefined;
  let node: GraphNode | undefined = starts[0];
  while (node) {
    if (visited.has(node.id)) throw new Error(`${node.label}: cycle detected`);
    visited.add(node.id);
    const data = node.data;
    if (isPlannedKind(data.kind)) {
      throw new Error(plannedCompileMessage(node.label, data.kind));
    }
    if (data.kind === "condition") {
      phase = { trigger: data.trigger, delaySeconds: data.delaySeconds, actions: [] };
      phases.push(phase);
    } else if (data.kind !== "start" && data.kind !== "end") {
      const { kind, ...parameters } = data;
      const action = { op: kind, ...parameters } as MissionAction;
      if (phase) phase.actions.push(action);
      else if (action.op === "deploy") opening.push(action.slot);
      else throw new Error(`${node.label}: add a Condition before this action`);
    }
    if (data.kind === "end") break;
    const target = next.get(node.id);
    if (!target) throw new Error(`${node.label}: connect the output to the next node`);
    node = byId.get(target);
  }
  const leftover = graph.nodes.filter((entry) => !visited.has(entry.id));
  const leftoverPlanned = leftover.find((entry) => isPlannedKind(entry.data.kind));
  if (leftoverPlanned) throw new Error(plannedCompileMessage(leftoverPlanned.label, leftoverPlanned.data.kind));
  if (leftover.length) throw new Error("Disconnected nodes or cycles remain outside the Start-to-End flow");
  const slots = graph.slots.map((slot) => [...slot.params]);
  const model = { battle: graph.battle, slots, opening, phases };
  validateMission(model);
  return model;
}

export function buildGraph(graph: MissionGraph, source?: string): GraphBuild {
  const model = graphToModel(graph);
  return { model, c: source === undefined ? generateC(model) : patchMissionSource(source, model), warnings: validateMission(model) };
}

export function graphFromModel(model: MissionModel, name = "New mission"): MissionGraph {
  validateMission(model);
  const nodes: GraphNode[] = [];
  const add = (data: GraphNode["data"], label: string) => {
    const n = nodes.length;
    nodes.push({ id: `node-${n}`, label, x: (n % 4) * 260, y: Math.floor(n / 4) * 160, data });
  };
  add({ kind: "start" }, "Mission start");
  model.opening.forEach((slot) => add({ kind: "deploy", slot }, `Deploy slot ${slot}`));
  model.phases.forEach((phase, index) => {
    add({ kind: "condition", trigger: phase.trigger, delaySeconds: phase.delaySeconds }, `Phase ${index + 1}`);
    phase.actions.forEach(({ op, ...params }) => add({ kind: op, ...params } as GraphNode["data"], op === "deploy" ? `Deploy slot ${(params as { slot: number }).slot}` : op));
  });
  add({ kind: "end" }, "End of sequence");
  return checkDocument({
    format: "exvs-mission-graph-v1", name, battle: structuredClone(model.battle),
    slots: model.slots.map((p) => ({ name: p[0] === 0 ? "Player" : p[0] === 1 ? "Partner" : `Enemy ${p[0]}`, params: [...p] })),
    nodes, edges: nodes.slice(1).map((node, i) => ({ source: nodes[i].id, target: node.id })),
  });
}

export const createGraph = () => graphFromModel(modelFromC(MISSION_C_TEMPLATE));
export const importCGraph = (source: string) => graphFromModel(modelFromC(source), "Imported mission");

/** Rewiring a single-execution port replaces its old connection atomically. */
export function connectNodes(graph: MissionGraph, source: string, target: string): MissionGraph {
  if (source === target) throw new Error("A node cannot connect to itself");
  const from = graph.nodes.find((n) => n.id === source);
  const to = graph.nodes.find((n) => n.id === target);
  if (!from || !to || from.data.kind === "end" || to.data.kind === "start") throw new Error("Invalid execution ports");
  const edges = graph.edges.filter((e) => e.source !== source && e.target !== target);
  const next = new Map(edges.map((e) => [e.source, e.target]));
  const visited = new Set<string>();
  let cursor: string | undefined = target;
  while (cursor) {
    if (cursor === source || visited.has(cursor)) throw new Error("Connection would create a cycle");
    visited.add(cursor); cursor = next.get(cursor);
  }
  return { ...graph, edges: [...edges, { source, target }] };
}

export function removeNode(graph: MissionGraph, id: string): MissionGraph {
  if (["start", "end"].includes(graph.nodes.find((n) => n.id === id)?.data.kind ?? "")) return graph;
  return { ...graph, nodes: graph.nodes.filter((n) => n.id !== id), edges: graph.edges.filter((e) => e.source !== id && e.target !== id) };
}

export function newNode(kind: AddableKind, graph: MissionGraph): GraphNode {
  const slot = graph.slots.find((s) => s.params[3] === 1)?.params[0] ?? 2;
  const data: GraphNode["data"] = kind === "condition" ? { kind, trigger: { kind: "enemies_alive_at_most", value: 0 }, delaySeconds: 1 }
    : kind === "deploy" ? { kind, slot }
    : kind === "message" ? { kind, slot: 0, messageHash: 0 }
    : kind === "bgm" ? { kind, bgm: graph.battle.bgm }
    : kind === "raw_sys" ? { kind, command: 0x355, args: [0, 0] }
    : { kind };
  const label = isPlannedKind(kind) ? PLANNED_LABELS[kind] : kind;
  return { id: crypto.randomUUID(), label, x: 260, y: Math.max(...graph.nodes.map((n) => n.y)) + 160, data };
}
