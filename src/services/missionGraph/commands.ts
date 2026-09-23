import { connectNodes, isNoGoKind, isPlannedKind, newNode, type ActionKind, type AddableKind, type GraphNode, type MissionGraph } from "./graph";
import { derivePhaseProjection, expandSelection, firstNodeId, lastNodeId, type PhaseProjection } from "./projection";
import { snap } from "./editor";
import { PLANNED_LABELS } from "./planned";

export interface CommandResult {
  graph: MissionGraph;
  select: string | null;
  semantic: boolean;
}

export function insertNodeAfter(graph: MissionGraph, afterId: string, node: GraphNode): MissionGraph {
  const following = graph.edges.find((edge) => edge.source === afterId)?.target;
  let next = { ...graph, nodes: [...graph.nodes, node] };
  next = connectNodes(next, afterId, node.id);
  if (following) next = connectNodes(next, node.id, following);
  return next;
}

export function connectVisual(graph: MissionGraph, sourceId: string, targetId: string): MissionGraph {
  const projection = derivePhaseProjection(graph);
  return connectNodes(graph, lastNodeId(projection, sourceId), firstNodeId(projection, targetId));
}

export function disconnectVisual(graph: MissionGraph, sourceId: string, targetId: string): MissionGraph {
  const projection = derivePhaseProjection(graph);
  const source = lastNodeId(projection, sourceId);
  const target = firstNodeId(projection, targetId);
  return { ...graph, edges: graph.edges.filter((edge) => !(edge.source === source && edge.target === target)) };
}

export function placeNode(graph: MissionGraph, kind: AddableKind, x: number, y: number): GraphNode {
  if (isNoGoKind(kind)) throw new Error(`${PLANNED_LABELS[kind]}: TODO No-Go — cannot instantiate as a working node`);
  return { ...newNode(kind, graph), x: snap(x), y: snap(y), label: defaultLabel(kind, graph) };
}

export function addDraft(graph: MissionGraph, kind: AddableKind, x: number, y: number): CommandResult {
  if (graph.nodes.length >= 512) throw new Error("At most 512 execution nodes are supported");
  const node = placeNode(graph, kind, x, y);
  return { graph: { ...graph, nodes: [...graph.nodes, node] }, select: node.id, semantic: true };
}

export function insertPhaseAfter(graph: MissionGraph, visualId: string, x?: number, y?: number): CommandResult {
  if (graph.nodes.length >= 512) throw new Error("At most 512 execution nodes are supported");
  const projection = derivePhaseProjection(graph);
  const after = lastNodeId(projection, visualId);
  const origin = graph.nodes.find((node) => node.id === after) ?? graph.nodes[0];
  const node = placeNode(graph, "condition", x ?? origin.x + 280, y ?? origin.y);
  return { graph: insertNodeAfter(graph, after, node), select: node.id, semantic: true };
}

export function insertPhaseBefore(graph: MissionGraph, visualId: string): CommandResult {
  const projection = derivePhaseProjection(graph);
  if (projection.opening && (visualId === projection.opening.id || projection.opening.memberIds.includes(visualId))) {
    return insertPhaseAfter(graph, projection.opening.id);
  }
  const incoming = graph.edges.find((edge) => edge.target === firstNodeId(projection, visualId));
  if (!incoming) return insertPhaseAfter(graph, visualId);
  return insertPhaseAfter(graph, hostOrSelf(projection, incoming.source));
}

export function removePhase(graph: MissionGraph, phaseId: string, keepActions = false): CommandResult {
  const projection = derivePhaseProjection(graph);
  const phase = projection.phases.find((entry) => entry.id === phaseId);
  if (!phase) return { graph, select: null, semantic: false };
  const removed = new Set(keepActions ? [phase.id] : phase.memberIds);
  return { graph: removeIdsKeepChain(graph, removed), select: null, semantic: true };
}

export function duplicatePhase(graph: MissionGraph, phaseId: string): CommandResult {
  const projection = derivePhaseProjection(graph);
  const phase = projection.phases.find((entry) => entry.id === phaseId);
  if (!phase) return { graph, select: null, semantic: false };
  return duplicateMembers(graph, phase.memberIds, 48, 48);
}

export function insertAction(graph: MissionGraph, hostId: string, kind: ActionKind, index?: number): CommandResult {
  if (kind !== "deploy" && hostId === derivePhaseProjection(graph).opening?.id) {
    throw new Error("Opening only accepts deploy actions. Add a phase first.");
  }
  if (graph.nodes.length >= 512) throw new Error("At most 512 execution nodes are supported");
  const projection = derivePhaseProjection(graph);
  const after = actionAnchor(projection, hostId, index);
  const origin = graph.nodes.find((node) => node.id === after) ?? graph.nodes[0];
  const node = placeNode(graph, kind, origin.x, origin.y + 40);
  return { graph: insertNodeAfter(graph, after, node), select: node.id, semantic: true };
}

export function updateNode(graph: MissionGraph, node: GraphNode): CommandResult {
  return { graph: { ...graph, nodes: graph.nodes.map((entry) => entry.id === node.id ? node : entry) }, select: node.id, semantic: true };
}

export function moveAction(graph: MissionGraph, actionId: string, direction: -1 | 1): CommandResult {
  const projection = derivePhaseProjection(graph);
  const host = projection.opening?.memberIds.includes(actionId) ? projection.opening
    : projection.phases.find((phase) => phase.memberIds.includes(actionId));
  if (!host) return { graph, select: actionId, semantic: false };
  const ids = host.actions.map((action) => action.id);
  const index = ids.indexOf(actionId);
  const swap = index + direction;
  if (index < 0 || swap < 0 || swap >= ids.length) return { graph, select: actionId, semantic: false };
  [ids[index], ids[swap]] = [ids[swap], ids[index]];
  return { graph: rewriteSequence(graph, host.id === projection.opening?.id ? projection.opening.startId : host.id, ids, nextAfter(projection, host.lastNodeId)), select: actionId, semantic: true };
}

export function moveActionToPhase(graph: MissionGraph, actionId: string, hostId: string): CommandResult {
  const node = graph.nodes.find((entry) => entry.id === actionId);
  if (!node || node.data.kind === "start" || node.data.kind === "end" || node.data.kind === "condition" || isPlannedKind(node.data.kind)) return { graph, select: actionId, semantic: false };
  const lifted = removeIdsKeepChain(graph, new Set([actionId]));
  const after = actionAnchor(derivePhaseProjection(lifted), hostId);
  return { graph: insertNodeAfter(lifted, after, node), select: actionId, semantic: true };
}

export function duplicateAction(graph: MissionGraph, actionId: string): CommandResult {
  return duplicateMembers(graph, [actionId], 0, 48);
}

export function removeAction(graph: MissionGraph, actionId: string): CommandResult {
  const node = graph.nodes.find((entry) => entry.id === actionId);
  if (!node || node.data.kind === "start" || node.data.kind === "end") return { graph, select: null, semantic: false };
  return { graph: removeIdsKeepChain(graph, new Set([actionId])), select: null, semantic: true };
}

export function toggleCollapsed(graph: MissionGraph, phaseId: string): CommandResult {
  const collapsed = graph.collapsed.includes(phaseId)
    ? graph.collapsed.filter((id) => id !== phaseId)
    : [...graph.collapsed, phaseId];
  return { graph: { ...graph, collapsed }, select: phaseId, semantic: false };
}

export function setAlias(graph: MissionGraph, kind: MissionGraph["aliases"][number]["kind"], value: number, alias: string): CommandResult {
  const aliases = graph.aliases.filter((entry) => !(entry.kind === kind && entry.value === value));
  return { graph: { ...graph, aliases: alias.trim() ? [...aliases, { kind, value, alias: alias.trim() }] : aliases }, select: null, semantic: false };
}

function defaultLabel(kind: AddableKind, graph: MissionGraph): string {
  if (kind === "condition") return `Phase ${graph.nodes.filter((node) => node.data.kind === "condition").length + 1}`;
  if (kind === "deploy") return "Deploy unit";
  if (kind === "message") return "Show message";
  if (kind === "bgm") return "Change BGM";
  if (kind === "raw_sys") return "Raw syscall";
  if (isPlannedKind(kind)) return PLANNED_LABELS[kind];
  return kind;
}

function hostOrSelf(projection: PhaseProjection, nodeId: string): string {
  if (projection.opening?.memberIds.includes(nodeId)) return projection.opening.id;
  return projection.phases.find((phase) => phase.memberIds.includes(nodeId))?.id ?? nodeId;
}

function actionAnchor(projection: PhaseProjection, hostId: string, index?: number): string {
  if (projection.opening?.id === hostId) {
    const actions = projection.opening.actions;
    if (index === undefined || index >= actions.length) return projection.opening.lastNodeId;
    return index <= 0 ? projection.opening.startId : actions[index - 1].id;
  }
  const phase = projection.phases.find((entry) => entry.id === hostId);
  if (!phase) return hostId;
  if (index === undefined || index >= phase.actions.length) return phase.lastNodeId;
  return index <= 0 ? phase.id : phase.actions[index - 1].id;
}

function nextAfter(projection: PhaseProjection, lastId: string): string | undefined {
  return projection.next.get(lastId);
}

function rewriteSequence(graph: MissionGraph, headId: string, actionIds: string[], tail?: string): MissionGraph {
  const sequence = [headId, ...actionIds];
  const members = new Set(sequence);
  const edges = graph.edges.filter((edge) => !members.has(edge.source) && edge.target !== (tail ?? "") && !actionIds.includes(edge.target));
  const rebuilt = sequence.slice(1).map((id, index) => ({ source: sequence[index], target: id }));
  if (tail) rebuilt.push({ source: sequence[sequence.length - 1], target: tail });
  return { ...graph, edges: [...edges, ...rebuilt] };
}

function removeIdsKeepChain(graph: MissionGraph, removed: Set<string>): MissionGraph {
  const incomingFrom = graph.edges.filter((edge) => removed.has(edge.target) && !removed.has(edge.source));
  const outgoingTo = graph.edges.filter((edge) => removed.has(edge.source) && !removed.has(edge.target));
  let edges = graph.edges.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target));
  if (incomingFrom[0] && outgoingTo[0] && !edges.some((edge) => edge.source === incomingFrom[0].source)) {
    edges = [...edges, { source: incomingFrom[0].source, target: outgoingTo[0].target }];
  }
  return { ...graph, nodes: graph.nodes.filter((node) => !removed.has(node.id)), edges, collapsed: graph.collapsed.filter((id) => !removed.has(id)) };
}

function duplicateMembers(graph: MissionGraph, memberIds: string[], dx: number, dy: number): CommandResult {
  const members = graph.nodes.filter((node) => memberIds.includes(node.id) && node.data.kind !== "start" && node.data.kind !== "end");
  if (!members.length) return { graph, select: null, semantic: false };
  if (graph.nodes.length + members.length > 512) throw new Error("At most 512 execution nodes are supported");
  const ids = new Map(members.map((node) => [node.id, crypto.randomUUID()]));
  const nodes = members.map((node) => ({ ...structuredClone(node), id: ids.get(node.id)!, x: snap(node.x + dx), y: snap(node.y + dy) }));
  const edges = graph.edges
    .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
    .map((edge) => ({ source: ids.get(edge.source)!, target: ids.get(edge.target)! }));
  return { graph: { ...graph, nodes: [...graph.nodes, ...nodes], edges: [...graph.edges, ...edges] }, select: nodes[0].id, semantic: true };
}

export function selectedMembers(graph: MissionGraph, ids: string[]): string[] {
  return expandSelection(graph, ids);
}
