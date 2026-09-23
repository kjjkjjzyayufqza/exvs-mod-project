import { MissionError } from "@/services/missionTranspiler/missionErrors";
import { validateMission } from "@/services/missionTranspiler/model";
import { graphToModel, isPlannedKind, plannedCompileMessage, type MissionGraph } from "./graph";
import { derivePhaseProjection, missionBudget, type PhaseProjection } from "./projection";
import { builtinCatalog, describeHash, type ResourceCatalog } from "./resources";
import { slotSuit } from "./slotParams";
import { isNoGoKind } from "./planned";

export type IssueSeverity = "error" | "warning" | "info";
export interface IssueTarget { nodeId?: string; slot?: number; field?: string; phaseId?: string }
export interface GraphIssue {
  id: string;
  code: string;
  severity: IssueSeverity;
  message: string;
  target: IssueTarget;
}

function issue(code: string, severity: IssueSeverity, message: string, target: IssueTarget = {}): GraphIssue {
  return { id: `${code}:${target.nodeId ?? target.slot ?? target.field ?? "graph"}`, code, severity, message, target };
}

export function blockingErrors(issues: GraphIssue[]): GraphIssue[] {
  return issues.filter((entry) => entry.severity === "error");
}

export function issuesForMembers(issues: GraphIssue[], memberIds: string[]): GraphIssue[] {
  const members = new Set(memberIds);
  return issues.filter((entry) => (entry.target.nodeId && members.has(entry.target.nodeId)) || (entry.target.phaseId && members.has(entry.target.phaseId)));
}

export function worstSeverity(issues: GraphIssue[]): IssueSeverity | null {
  if (issues.some((entry) => entry.severity === "error")) return "error";
  if (issues.some((entry) => entry.severity === "warning")) return "warning";
  return issues.length ? "info" : null;
}

export function collectGraphIssues(graph: MissionGraph, catalog: ResourceCatalog = builtinCatalog()): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const projection = derivePhaseProjection(graph);
  const starts = graph.nodes.filter((node) => node.data.kind === "start");
  const ends = graph.nodes.filter((node) => node.data.kind === "end");
  if (starts.length !== 1 || ends.length !== 1) {
    issues.push(issue("start-end", "error", "Exactly one Start and one End node are required"));
  }
  if (!projection.linear) {
    issues.push(issue("branch", "error", "Branching and merging are not supported by this mission template"));
  }
  const seen = new Set<string>();
  let cursor: string | undefined = starts[0]?.id;
  while (cursor) {
    if (seen.has(cursor)) {
      issues.push(issue("cycle", "error", "Cycle detected", { nodeId: cursor }));
      break;
    }
    seen.add(cursor);
    cursor = projection.next.get(cursor);
  }
  for (const node of projection.drafts) {
    issues.push(issue("draft", "error", `${node.label}: disconnected from the Start-to-End flow`, { nodeId: node.id }));
  }
  for (const node of projection.planned) {
    const code = isNoGoKind(node.data.kind) ? "planned-nogo" : "planned-control-flow";
    issues.push(issue(code, "error", plannedCompileMessage(node.label, node.data.kind), { nodeId: node.id }));
  }
  walkActionPlacement(graph, projection, issues);
  for (const node of graph.nodes) {
    const data = node.data;
    if (data.kind === "condition") {
      if (!Number.isInteger(data.delaySeconds) || data.delaySeconds < 1) {
        issues.push(issue("delay", "error", `${node.label}: delay must be at least 1 second`, { nodeId: node.id, field: "delaySeconds" }));
      }
      const trigger = data.trigger;
      if (trigger.kind === "slot_hp_percent_at_most" && !graph.slots.some((slot) => slot.params[0] === trigger.slot)) {
        issues.push(issue("trigger-slot", "error", `${node.label}: observed slot is missing`, { nodeId: node.id, slot: trigger.slot }));
      }
    }
    if ((data.kind === "deploy" || data.kind === "message") && !graph.slots.some((slot) => slot.params[0] === data.slot)) {
      issues.push(issue("slot-ref", "error", `${node.label}: missing slot ${data.slot}`, { nodeId: node.id, slot: data.slot }));
    }
    if (data.kind === "raw_sys") {
      issues.push(issue("raw-sys", "warning", `${node.label}: raw syscall 0x${data.command.toString(16)} has unverified runtime effects`, { nodeId: node.id }));
      if (data.command === 0x349) {
        issues.push(issue("dead-349", "warning", `${node.label}: sys_0(0x349) has no OB dispatcher case and always returns 0`, { nodeId: node.id }));
      }
    }
    if (data.kind === "bgm") pushUnknown(issues, graph, catalog, "bgm", data.bgm, node.id);
    if (data.kind === "message") pushUnknown(issues, graph, catalog, "message", data.messageHash, node.id);
  }
  pushUnknown(issues, graph, catalog, "map", graph.battle.map);
  pushUnknown(issues, graph, catalog, "bgm", graph.battle.bgm);
  const deployed = new Set<number>();
  const noteDeploy = (slot: number, nodeId: string) => {
    if (deployed.has(slot)) issues.push(issue("duplicate-deploy", "error", `Slot ${slot} is deployed more than once`, { nodeId, slot }));
    deployed.add(slot);
  };
  projection.opening?.actions.forEach((action) => { if (action.kind === "deploy") noteDeploy(action.slot!, action.id); });
  projection.phases.forEach((phase) => phase.actions.forEach((action) => { if (action.kind === "deploy") noteDeploy(action.slot!, action.id); }));
  for (const point of missionBudget(graph)) {
    if (point.overBudget) {
      issues.push(issue("budget", "warning", "Conservative on-field enemy count may exceed 12. Add an enemies-alive gate before more deploys.", { nodeId: point.visualId }));
    } else if (point.conservativeEnemies >= 10) {
      issues.push(issue("budget-warn", "warning", `Conservative on-field enemy count is ${point.conservativeEnemies} (limit 12).`, { nodeId: point.visualId }));
    }
  }
  for (const slot of graph.slots) {
    const suit = slotSuit(slot, catalog.units);
    const identity = [suit.name, suit.unitId].filter((part) => part !== "").join(" ");
    const suffix = identity ? ` (${identity})` : "";
    if (slot.params[33]) {
      issues.push(issue("external-coords", "warning", `${slot.name}${suffix}: external coordinates (P33) can override the authored spawn point`, { slot: slot.params[0] }));
    }
    if (slot.params[3] === 1 && !deployed.has(slot.params[0])) {
      issues.push(issue("unused-slot", "warning", `Defined but never deployed: slot ${slot.params[0]}${suffix}. The unit is still preloaded.`, { slot: slot.params[0] }));
    }
  }
  if (graph.battle.win & 8) {
    issues.push(issue("any-target", "warning", "any_target_destroyed uses sys_0(0x349); OB returns zero for that query"));
  }
  issues.push(issue("linear-supported", "info", "Sequential Opening → Phase → End is supported. Each phase has one successor."));
  issues.push(issue("unsupported-control-flow", "info", "Only sequential phases compile. Branches, loops, parallel sequences and blackboard writes are not supported by this source editor."));
  issues.push(issue("budget-scope", "info", "On-field budget is conservative: opening deploys plus later deploys, reduced only by enemies-alive gates. Deaths are not simulated."));
  issues.push(issue("e1-scope", "info", "Source-level review only. Map, unit, BGM, message and briefing references still require target assets and an in-game test."));
  issues.push(issue("end-runtime", "info", "End finishes the authored sequence. The mission runtime continues evaluating victory and defeat rules.", { nodeId: projection.end?.id }));
  try {
    const model = graphToModel(graph);
    for (const warning of validateMission(model)) {
      if (!issues.some((entry) => entry.message === warning)) {
        issues.push(issue("model-warning", "warning", warning));
      }
    }
  } catch (reason) {
    if (graph.nodes.some((node) => isPlannedKind(node.data.kind))) {
      return uniqueIssues(issues);
    }
    const message = reason instanceof Error || reason instanceof MissionError ? reason.message : String(reason);
    if (!issues.some((entry) => entry.message === message || message.includes(entry.code))) {
      issues.push(issue("model", "error", message));
    }
  }
  return uniqueIssues(issues);
}

function walkActionPlacement(graph: MissionGraph, projection: PhaseProjection, issues: GraphIssue[]) {
  const next = projection.next;
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const start = graph.nodes.find((node) => node.data.kind === "start");
  if (!start) return;
  let phase = false;
  let cursor = next.get(start.id);
  const seen = new Set<string>([start.id]);
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const node = byId.get(cursor);
    if (!node) break;
    if (node.data.kind === "condition") phase = true;
    else if (isPlannedKind(node.data.kind)) {
      issues.push(issue(isNoGoKind(node.data.kind) ? "planned-nogo" : "planned-control-flow", "error", plannedCompileMessage(node.label, node.data.kind), { nodeId: node.id }));
    } else if (node.data.kind !== "end" && node.data.kind !== "start") {
      if (!phase && node.data.kind !== "deploy") {
        issues.push(issue("opening-action", "error", `${node.label}: add a Condition before this action`, { nodeId: node.id }));
      }
    }
    if (node.data.kind !== "end" && !isPlannedKind(node.data.kind) && !next.get(node.id) && !projection.drafts.some((draft) => draft.id === node.id)) {
      issues.push(issue("open-output", "error", `${node.label}: connect the output to the next node`, { nodeId: node.id }));
    }
    cursor = next.get(node.id);
  }
}

function pushUnknown(issues: GraphIssue[], graph: MissionGraph, catalog: ResourceCatalog, kind: "map" | "bgm" | "message" | "unit", value: number, nodeId?: string) {
  const described = describeHash(graph, kind, value, catalog);
  if (described.evidence === "not-checked") {
    issues.push(issue(`unknown-${kind}`, "warning", `${kind} 0x${(value >>> 0).toString(16)} is not in the bound catalog (unproven, not invalid)`, { nodeId, field: kind }));
  }
}

function uniqueIssues(issues: GraphIssue[]): GraphIssue[] {
  const seen = new Set<string>();
  return issues.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}
