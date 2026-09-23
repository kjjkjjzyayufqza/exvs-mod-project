import { z } from "zod";
import { commentSchema, graphNodeSchema, MAX_GRAPH_BYTES, type GraphComment, type MissionGraph } from "./graph";
import { derivePhaseProjection, expandSelection } from "./projection";

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 172;
export const PHASE_NODE_WIDTH = 280;
export const PHASE_LANE_GAP = 96;
export const SNAP = 16;
export const snap = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-100000, Math.min(100000, Math.round(value / SNAP) * SNAP));
};
export const edgeId = (edge: { source: string; target: string }) => JSON.stringify([edge.source, edge.target]);
const fragmentSchema = z.object({
  format: z.literal("exvs-mission-graph-fragment-v1"),
  nodes: z.array(graphNodeSchema).max(510),
  edges: z.array(z.object({ source: z.string(), target: z.string() }).strict()).max(512),
  comments: z.array(commentSchema).max(64),
}).strict();
export type GraphFragment = z.infer<typeof fragmentSchema>;
export type Position = { x: number; y: number };

export function copySelection(graph: MissionGraph, ids: string[]): GraphFragment {
  const selected = new Set(ids);
  const nodes = graph.nodes.filter((n) => selected.has(n.id) && !["start", "end"].includes(n.data.kind));
  const copied = new Set(nodes.map((n) => n.id));
  return structuredClone({ format: "exvs-mission-graph-fragment-v1", nodes,
    edges: graph.edges.filter((e) => copied.has(e.source) && copied.has(e.target)),
    comments: graph.comments.filter((c) => selected.has(c.id)),
  });
}

export function parseFragment(source: string): GraphFragment {
  if (source.length > MAX_GRAPH_BYTES) throw new Error("Clipboard exceeds 512 KiB");
  const fragment = fragmentSchema.parse(JSON.parse(source));
  const ids = [...fragment.nodes, ...fragment.comments].map((n) => n.id);
  if (new Set(ids).size !== ids.length) throw new Error("Clipboard contains duplicate IDs");
  if (fragment.nodes.some((n) => n.data.kind === "start" || n.data.kind === "end")) throw new Error("Start and End cannot be pasted");
  if (fragment.edges.some((e) => !fragment.nodes.some((n) => n.id === e.source) || !fragment.nodes.some((n) => n.id === e.target))) throw new Error("Clipboard contains dangling connections");
  return fragment;
}

export function pasteSelection(graph: MissionGraph, fragment: GraphFragment, position: Position) {
  if (graph.nodes.length + fragment.nodes.length > 512 || graph.comments.length + fragment.comments.length > 64 || graph.edges.length + fragment.edges.length > 512) throw new Error("Graph size limit reached");
  for (const node of fragment.nodes) {
    const d = node.data;
    const slot = d.kind === "deploy" || d.kind === "message" ? d.slot : d.kind === "condition" && d.trigger.kind === "slot_hp_percent_at_most" ? d.trigger.slot : null;
    if (slot !== null && !graph.slots.some((s) => s.params[0] === slot)) throw new Error(`Pasted node references missing slot ${slot}`);
  }
  const elements = [...fragment.nodes, ...fragment.comments];
  if (!elements.length) return { graph, selected: [] as string[] };
  const left = Math.min(...elements.map((n) => n.x)), top = Math.min(...elements.map((n) => n.y));
  const ids = new Map(elements.map((n) => [n.id, crypto.randomUUID()]));
  const offset = (n: { id: string; x: number; y: number }) => ({ id: ids.get(n.id)!, x: snap(position.x + n.x - left), y: snap(position.y + n.y - top) });
  return { graph: { ...graph,
    nodes: [...graph.nodes, ...fragment.nodes.map((n) => ({ ...structuredClone(n), ...offset(n) }))],
    comments: [...graph.comments, ...fragment.comments.map((c) => ({ ...c, ...offset(c) }))],
    edges: [...graph.edges, ...fragment.edges.map((e) => ({ source: ids.get(e.source)!, target: ids.get(e.target)! }))],
  }, selected: [...ids.values()] };
}

/**
 * Drop nodes and splice each predecessor to its successor.
 * Start and End stay. One node at a time so two non-adjacent actions both reconnect.
 */
export function removeKeepingChain(graph: MissionGraph, ids: string[]): MissionGraph {
  const protectedIds = new Set(graph.nodes.filter((node) => node.data.kind === "start" || node.data.kind === "end").map((node) => node.id));
  const drop = new Set(ids.filter((id) => !protectedIds.has(id)));
  let next = graph;
  for (const id of drop) {
    if (!next.nodes.some((node) => node.id === id)) continue;
    const incoming = next.edges.find((edge) => edge.target === id);
    const outgoing = next.edges.find((edge) => edge.source === id);
    let edges = next.edges.filter((edge) => edge.source !== id && edge.target !== id);
    if (incoming && outgoing && incoming.source !== outgoing.target && !edges.some((edge) => edge.source === incoming.source && edge.target === outgoing.target)) {
      edges = [...edges, { source: incoming.source, target: outgoing.target }];
    }
    next = {
      ...next,
      nodes: next.nodes.filter((node) => node.id !== id),
      edges,
      collapsed: next.collapsed.filter((collapsedId) => collapsedId !== id),
    };
  }
  if (next.comments.some((comment) => drop.has(comment.id))) {
    next = { ...next, comments: next.comments.filter((comment) => !drop.has(comment.id)) };
  }
  return next;
}

/** Delete the focused canvas id (phase/opening expands to members; actions stay single). */
export function deleteGraphFocus(graph: MissionGraph, focusId: string): MissionGraph {
  return removeKeepingChain(graph, expandSelection(graph, [focusId]));
}

/** Remove an enemy slot and the deploy/message actions that name it. Null when the slot must stay. */
export function deleteEnemySlot(graph: MissionGraph, slotId: number): MissionGraph | null {
  const slot = graph.slots.find((entry) => entry.params[0] === slotId);
  if (!slot || slotId < 2) return null;
  if (slot.params[3] === 1 && graph.slots.filter((entry) => entry.params[3] === 1).length < 2) return null;
  const hpLocked = graph.nodes.some((node) => node.data.kind === "condition" && node.data.trigger.kind === "slot_hp_percent_at_most" && node.data.trigger.slot === slotId);
  if (hpLocked) return null;
  const referenced = graph.nodes
    .filter((node) => (node.data.kind === "deploy" || node.data.kind === "message") && node.data.slot === slotId)
    .map((node) => node.id);
  const next = removeKeepingChain(graph, referenced);
  return { ...next, slots: next.slots.filter((entry) => entry.params[0] !== slotId) };
}

export function deleteSelection(graph: MissionGraph, nodeIds: string[], edgeIds: string[]): MissionGraph {
  const protectedIds = new Set(graph.nodes.filter((n) => n.data.kind === "start" || n.data.kind === "end").map((n) => n.id));
  const removed = new Set(nodeIds.filter((id) => !protectedIds.has(id)));
  const edges = new Set(edgeIds);
  return { ...graph, nodes: graph.nodes.filter((n) => !removed.has(n.id)), comments: graph.comments.filter((c) => !removed.has(c.id)),
    edges: graph.edges.filter((e) => !removed.has(e.source) && !removed.has(e.target) && !edges.has(edgeId(e))),
  };
}

export function addComment(graph: MissionGraph, ids: string[], position: Position): { graph: MissionGraph; id: string } {
  if (graph.comments.length >= 64) throw new Error("At most 64 comment frames are supported");
  const selected = graph.nodes.filter((n) => ids.includes(n.id));
  const left = selected.length ? Math.min(...selected.map((n) => n.x)) - 32 : position.x;
  const top = selected.length ? Math.min(...selected.map((n) => n.y)) - 64 : position.y;
  const width = selected.length ? Math.max(...selected.map((n) => n.x + NODE_WIDTH)) - left + 32 : 480;
  const height = selected.length ? Math.max(...selected.map((n) => n.y + NODE_HEIGHT)) - top + 32 : 280;
  if (width > 10000 || height > 10000) throw new Error("Selection is too large for one comment frame");
  const comment: GraphComment = { id: crypto.randomUUID(), label: "Comment", x: snap(left), y: snap(top), width, height, color: "#52667c" };
  return { graph: { ...graph, comments: [...graph.comments, comment] }, id: comment.id };
}

/** Commit a drag as one document change, moving enclosed nodes with a frame. */
export function moveElements(graph: MissionGraph, positions: Map<string, Position>, snapToGrid = true): MissionGraph {
  const offsets = new Map<string, Position>();
  for (const comment of graph.comments) {
    const p = positions.get(comment.id);
    if (!p) continue;
    for (const n of graph.nodes) {
      if (n.x >= comment.x && n.y >= comment.y && n.x + NODE_WIDTH <= comment.x + comment.width && n.y + NODE_HEIGHT <= comment.y + comment.height && !offsets.has(n.id)) {
        offsets.set(n.id, { x: n.x + p.x - comment.x, y: n.y + p.y - comment.y });
      }
    }
  }
  const position = (n: { id: string; x: number; y: number }) => {
    const p = positions.get(n.id) ?? offsets.get(n.id);
    const bound = (value: number) => snapToGrid ? snap(value) : Math.max(-100000, Math.min(100000, value));
    return p ? { x: bound(p.x), y: bound(p.y) } : { x: n.x, y: n.y };
  };
  return { ...graph, nodes: graph.nodes.map((n) => ({ ...n, ...position(n) })), comments: graph.comments.map((c) => ({ ...c, ...position(c) })) };
}

export function alignSelection(graph: MissionGraph, ids: string[], axis: "x" | "y"): MissionGraph {
  const selected = graph.nodes.filter((n) => ids.includes(n.id));
  if (selected.length < 2) return graph;
  const position = Math.min(...selected.map((n) => n[axis]));
  return { ...graph, nodes: graph.nodes.map((n) => ids.includes(n.id) ? { ...n, [axis]: position } : n) };
}

/** Keep execution order visible as Opening / Phase / End lanes. */
export function layoutGraph(graph: MissionGraph): MissionGraph {
  const projection = derivePhaseProjection(graph);
  const positions = new Map<string, Position>();
  let x = 0;
  const place = (members: string[], laneY = 0) => {
    for (const id of members) positions.set(id, { x, y: laneY });
    x += PHASE_NODE_WIDTH + PHASE_LANE_GAP;
  };
  if (projection.opening) place([projection.opening.startId]);
  if (projection.opening) {
    projection.opening.actions.forEach((action, index) => positions.set(action.id, { x: (positions.get(projection.opening!.startId)?.x ?? 0), y: 256 + index * 16 }));
  }
  for (const phase of projection.phases) {
    place([phase.id]);
    phase.actions.forEach((action, index) => positions.set(action.id, { x: positions.get(phase.id)?.x ?? 0, y: 256 + index * 16 }));
  }
  if (projection.end) place([projection.end.id]);
  let draftX = 0;
  for (const node of projection.drafts) {
    positions.set(node.id, { x: draftX, y: 420 });
    draftX += PHASE_NODE_WIDTH + PHASE_LANE_GAP;
  }
  let plannedX = 0;
  for (const node of projection.planned) {
    positions.set(node.id, { x: plannedX, y: 580 });
    plannedX += PHASE_NODE_WIDTH + PHASE_LANE_GAP;
  }
  const comments = graph.comments.map((comment) => {
    const members = graph.nodes.filter((n) => n.x >= comment.x && n.y >= comment.y && n.x + NODE_WIDTH <= comment.x + comment.width && n.y + NODE_HEIGHT <= comment.y + comment.height);
    if (!members.length) return comment;
    const points = members.map((n) => positions.get(n.id)!);
    const left = Math.min(...points.map((p) => p.x)) - 32, top = Math.min(...points.map((p) => p.y)) - 64;
    const width = Math.max(...points.map((p) => p.x)) + PHASE_NODE_WIDTH - left + 32;
    const height = Math.max(...points.map((p) => p.y)) + NODE_HEIGHT - top + 32;
    return width <= 10000 && height <= 10000 ? { ...comment, x: left, y: top, width, height } : comment;
  });
  return { ...graph, nodes: graph.nodes.map((n) => ({ ...n, ...(positions.get(n.id) ?? { x: n.x, y: n.y }) })), comments };
}
