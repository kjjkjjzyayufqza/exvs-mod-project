import { insertAction, insertPhaseAfter, type CommandResult } from "./commands";
import type { GraphNode, MissionGraph } from "./graph";
import { derivePhaseProjection } from "./projection";
import { TEMPLATE_MESSAGE_HASH } from "./resources";

export { TEMPLATE_MESSAGE_HASH };

export const LINEAR_TEMPLATE_IDS = [
  "opening-deploy",
  "alive-gate",
  "message-deploy-wave",
  "deploy-wave",
  "bgm-change",
] as const;

export type LinearTemplateId = (typeof LINEAR_TEMPLATE_IDS)[number];

/**
 * Insert a proven linear pattern: Opening deploy, enemies-alive gate, or one
 * sequential phase with message/BGM/deploy rows. One successor. No branch.
 */
export function applyLinearTemplate(graph: MissionGraph, id: LinearTemplateId, hostId?: string): CommandResult {
  const projection = derivePhaseProjection(graph);
  let host = hostId
    ?? (id === "opening-deploy" ? projection.opening?.id : undefined)
    ?? projection.phases.at(-1)?.id
    ?? projection.opening?.id;
  if (host && projection.end?.id === host) host = projection.phases.at(-1)?.id ?? projection.opening?.id;
  if (!host) throw new Error("Add Opening before inserting a sequential template");
  if (id === "opening-deploy") {
    const opening = projection.opening?.id;
    if (!opening) throw new Error("Opening is required for an opening deploy");
    return insertDeployAction(graph, opening);
  }
  if (id === "alive-gate") return insertAliveGate(graph, host);
  if (id === "bgm-change") {
    const gated = insertAliveGate(graph, host, "BGM change");
    return insertAction(gated.graph, gated.select!, "bgm");
  }
  if (id === "deploy-wave") {
    const gated = insertAliveGate(graph, host, "Deploy wave");
    return insertDeployAction(gated.graph, gated.select!);
  }
  const cloned = cloneEnemySlot(graph);
  if (!cloned) throw new Error("No unused enemy slot remains (max 256)");
  const gated = insertAliveGate(cloned.graph, host, "Message + deploy");
  const withMessage = insertAction(gated.graph, gated.select!, "message");
  const labeled = {
    ...withMessage.graph,
    nodes: withMessage.graph.nodes.map((node) => (
      node.id === withMessage.select && node.data.kind === "message"
        ? { ...node, data: { ...node.data, slot: cloned.slot, messageHash: TEMPLATE_MESSAGE_HASH } }
        : node
    )),
  };
  return insertDeployAction(labeled, gated.select!, cloned.slot);
}

function insertAliveGate(graph: MissionGraph, hostId: string, label = "Enemies alive gate"): CommandResult {
  const inserted = insertPhaseAfter(graph, hostId);
  if (!inserted.select) return inserted;
  return {
    graph: {
      ...inserted.graph,
      nodes: inserted.graph.nodes.map((node) => node.id === inserted.select ? withAliveGate(node, label) : node),
    },
    select: inserted.select,
    semantic: true,
  };
}

function withAliveGate(node: GraphNode, label: string): GraphNode {
  if (node.data.kind !== "condition") return node;
  return {
    ...node,
    label,
    data: { ...node.data, trigger: { kind: "enemies_alive_at_most", value: 1 }, delaySeconds: 1 },
  };
}

function insertDeployAction(graph: MissionGraph, hostId: string, slot?: number): CommandResult {
  const cloned = slot === undefined ? cloneEnemySlot(graph) : { graph, slot };
  if (!cloned) throw new Error("No unused enemy slot remains (max 256)");
  const inserted = insertAction(cloned.graph, hostId, "deploy");
  return {
    graph: {
      ...inserted.graph,
      nodes: inserted.graph.nodes.map((node) => (
        node.id === inserted.select && node.data.kind === "deploy"
          ? { ...node, label: `Deploy slot ${cloned.slot}`, data: { ...node.data, slot: cloned.slot } }
          : node
      )),
    },
    select: inserted.select,
    semantic: true,
  };
}

export function cloneEnemySlot(graph: MissionGraph): { graph: MissionGraph; slot: number } | null {
  const source = graph.slots.find((slot) => slot.params[3] === 1);
  const id = Array.from({ length: 254 }, (_, index) => index + 2).find((value) => !graph.slots.some((slot) => slot.params[0] === value));
  if (!source || id === undefined || graph.slots.length >= 256) return null;
  const params = [...source.params];
  params[0] = id;
  return {
    graph: { ...graph, slots: [...graph.slots, { name: `Enemy ${id}`, params }] },
    slot: id,
  };
}
