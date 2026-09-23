import type { ActionKind, GraphNode, MissionGraph } from "./graph";
import type { Trigger } from "@/services/missionTranspiler/types";
import { isPlannedKind } from "./planned";

export interface ProjectedAction {
  id: string;
  kind: ActionKind;
  label: string;
  slot?: number;
  data: Extract<GraphNode["data"], { kind: ActionKind }>;
}

export interface ProjectedOpening {
  id: string;
  startId: string;
  label: string;
  actions: ProjectedAction[];
  lastNodeId: string;
  memberIds: string[];
}

export interface ProjectedPhase {
  id: string;
  index: number;
  label: string;
  trigger: Trigger;
  delaySeconds: number;
  actions: ProjectedAction[];
  collapsed: boolean;
  lastNodeId: string;
  memberIds: string[];
}

export interface VisualEdge { source: string; target: string }

export interface BudgetPoint {
  visualId: string;
  conservativeEnemies: number;
  overBudget: boolean;
}

export interface PhaseProjection {
  opening: ProjectedOpening | null;
  phases: ProjectedPhase[];
  end: { id: string; label: string } | null;
  drafts: GraphNode[];
  planned: GraphNode[];
  visualEdges: VisualEdge[];
  linear: boolean;
  visited: Set<string>;
  next: Map<string, string>;
}

export function asAction(node: GraphNode): ProjectedAction | null {
  const data = node.data;
  if (data.kind === "deploy" || data.kind === "message" || data.kind === "bgm" || data.kind === "raw_sys") {
    return { id: node.id, kind: data.kind, label: node.label, slot: "slot" in data ? data.slot : undefined, data };
  }
  return null;
}

export function derivePhaseProjection(graph: MissionGraph): PhaseProjection {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const next = new Map<string, string>();
  const incoming = new Map<string, string>();
  let linear = true;
  for (const edge of graph.edges) {
    if (next.has(edge.source) || incoming.has(edge.target)) linear = false;
    if (!next.has(edge.source)) next.set(edge.source, edge.target);
    if (!incoming.has(edge.target)) incoming.set(edge.target, edge.source);
  }
  const starts = graph.nodes.filter((node) => node.data.kind === "start");
  const ends = graph.nodes.filter((node) => node.data.kind === "end");
  const visited = new Set<string>();
  let opening: ProjectedOpening | null = null;
  const phases: ProjectedPhase[] = [];
  let end = ends[0] ? { id: ends[0].id, label: ends[0].label } : null;
  const collapsed = new Set(graph.collapsed);

  if (starts.length === 1) {
    const start = starts[0];
    const openingActions: ProjectedAction[] = [];
    visited.add(start.id);
    let cursor = next.get(start.id);
    while (cursor) {
      const node = byId.get(cursor);
      if (!node || visited.has(cursor) || node.data.kind === "condition" || node.data.kind === "end" || isPlannedKind(node.data.kind)) break;
      const action = asAction(node);
      if (action?.kind !== "deploy") break;
      visited.add(node.id);
      openingActions.push(action);
      cursor = next.get(node.id);
    }
    const lastNodeId = openingActions.at(-1)?.id ?? start.id;
    opening = {
      id: start.id, startId: start.id, label: start.label, actions: openingActions, lastNodeId,
      memberIds: [start.id, ...openingActions.map((action) => action.id)],
    };
    cursor = next.get(lastNodeId);
    while (cursor) {
      const node = byId.get(cursor);
      if (!node || visited.has(cursor)) break;
      if (node.data.kind === "end") { visited.add(node.id); end = { id: node.id, label: node.label }; break; }
      if (node.data.kind !== "condition") break;
      visited.add(node.id);
      const actions: ProjectedAction[] = [];
      let last = node.id;
      let actionCursor = next.get(node.id);
      while (actionCursor) {
        const actionNode = byId.get(actionCursor);
        if (!actionNode || visited.has(actionCursor) || actionNode.data.kind === "condition" || actionNode.data.kind === "end" || isPlannedKind(actionNode.data.kind)) break;
        const action = asAction(actionNode);
        if (!action) break;
        visited.add(actionNode.id);
        actions.push(action);
        last = actionNode.id;
        actionCursor = next.get(actionNode.id);
      }
      phases.push({
        id: node.id, index: phases.length, label: node.label, trigger: node.data.trigger, delaySeconds: node.data.delaySeconds,
        actions, collapsed: collapsed.has(node.id), lastNodeId: last, memberIds: [node.id, ...actions.map((action) => action.id)],
      });
      cursor = next.get(last);
    }
  }

  const planned = graph.nodes.filter((node) => isPlannedKind(node.data.kind));
  const drafts = graph.nodes.filter((node) => !visited.has(node.id) && !isPlannedKind(node.data.kind) && node.id !== opening?.id && node.id !== end?.id);
  const visualEdges: VisualEdge[] = [];
  const linked = (from: string, to: string) => next.get(from) === to;
  if (opening && phases[0] && linked(opening.lastNodeId, phases[0].id)) visualEdges.push({ source: opening.id, target: phases[0].id });
  else if (opening && end && linked(opening.lastNodeId, end.id)) visualEdges.push({ source: opening.id, target: end.id });
  for (let index = 0; index < phases.length - 1; index++) {
    if (linked(phases[index].lastNodeId, phases[index + 1].id)) visualEdges.push({ source: phases[index].id, target: phases[index + 1].id });
  }
  if (phases.length && end && linked(phases[phases.length - 1].lastNodeId, end.id)) {
    visualEdges.push({ source: phases[phases.length - 1].id, target: end.id });
  }
  return { opening, phases, end, drafts, planned, visualEdges, linear, visited, next };
}

export function firstNodeId(projection: PhaseProjection, visualId: string): string {
  if (projection.opening?.id === visualId) return projection.opening.startId;
  return visualId;
}

export function lastNodeId(projection: PhaseProjection, visualId: string): string {
  if (projection.opening?.id === visualId) return projection.opening.lastNodeId;
  const phase = projection.phases.find((entry) => entry.id === visualId);
  return phase?.lastNodeId ?? visualId;
}

export function hostOf(projection: PhaseProjection, nodeId: string): string | null {
  if (projection.opening?.memberIds.includes(nodeId)) return projection.opening.id;
  const phase = projection.phases.find((entry) => entry.memberIds.includes(nodeId));
  if (phase) return phase.id;
  if (projection.end?.id === nodeId) return projection.end.id;
  return null;
}

export function expandSelection(graph: MissionGraph, ids: string[]): string[] {
  const projection = derivePhaseProjection(graph);
  const selected = new Set(ids);
  for (const id of ids) {
    if (projection.opening?.id === id) projection.opening.memberIds.forEach((member) => selected.add(member));
    const phase = projection.phases.find((entry) => entry.id === id);
    if (phase) phase.memberIds.forEach((member) => selected.add(member));
  }
  return [...selected];
}

export function missionBudget(graph: MissionGraph): BudgetPoint[] {
  const projection = derivePhaseProjection(graph);
  const points: BudgetPoint[] = [];
  let count = projection.opening?.actions.length ?? 0;
  if (projection.opening) points.push({ visualId: projection.opening.id, conservativeEnemies: count, overBudget: count > 12 });
  for (const phase of projection.phases) {
    if (phase.trigger.kind === "enemies_alive_at_most") count = Math.min(count, phase.trigger.value);
    count += phase.actions.filter((action) => action.kind === "deploy").length;
    points.push({ visualId: phase.id, conservativeEnemies: count, overBudget: count > 12 });
  }
  return points;
}

export function triggerSummary(trigger: Trigger): string {
  if (trigger.kind === "enemies_alive_at_most") return `Enemies alive ≤ ${trigger.value}`;
  if (trigger.kind === "elapsed_frames_at_least") return `Elapsed frames ≥ ${trigger.value}`;
  return `Slot ${trigger.slot} HP % ≤ ${trigger.value}`;
}
