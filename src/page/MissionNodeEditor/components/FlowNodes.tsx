import { memo, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Handle, NodeResizer, Position, type Node, type NodeProps, type ResizeParams } from "@xyflow/react";
import { Ban, ChevronDown, ChevronRight, Database, Flag, GitBranch, MessageSquare, Music2, Play, Radio, Repeat, ShieldAlert, Split, Timer, Trash2, Unplug, Users } from "lucide-react";
import type { GraphComment, GraphNode, NodeKind } from "@/services/missionGraph/graph";
import { isNoGoKind, isPlannedKind, PLANNED_DESCRIPTIONS, PLANNED_LABELS } from "@/services/missionGraph/planned";
import type { GraphIssue } from "@/services/missionGraph/issues";
import { issuesForMembers, worstSeverity } from "@/services/missionGraph/issues";
import type { BudgetPoint, ProjectedAction, ProjectedOpening, ProjectedPhase } from "@/services/missionGraph/projection";
import { triggerSummary } from "@/services/missionGraph/projection";
import { formatHash } from "@/services/missionGraph/resources";
import type { SlotSuit } from "@/services/missionGraph/slotParams";
import { kindAccentStyle } from "../schemes";

export { kindAccentStyle };
export const NODE_LABELS: Record<NodeKind, string> = {
  start: "Start", end: "End", condition: "Condition + delay", deploy: "Deploy unit",
  message: "Show message", bgm: "Change BGM", raw_sys: "Raw syscall",
  ...PLANNED_LABELS,
};
export const NODE_DESCRIPTIONS: Record<NodeKind, string> = {
  start: "Mission entry point", end: "Finish the authored sequence", condition: "Wait for a condition, then count down",
  deploy: "Deploy an enemy slot at its named spawn point", message: "Display a message for a slot",
  bgm: "Change the mission background music", raw_sys: "Advanced mission command with explicit arguments",
  ...PLANNED_DESCRIPTIONS,
};
export const NODE_LIBRARY = ["condition", "deploy", "message", "bgm", "raw_sys"] as const;
export const RESEARCH_ONLY_LIBRARY = ["planned_branch", "planned_loop", "planned_blackboard", "planned_subline"] as const;
export const NOGO_LIBRARY = ["planned_nogo_row_3c", "planned_nogo_steal_802", "planned_nogo_event_kind"] as const;
export const ADDABLE_LIBRARY = [...NODE_LIBRARY, ...RESEARCH_ONLY_LIBRARY] as const;
const ICONS: Record<NodeKind, typeof Play> = {
  start: Play, end: Flag, condition: Timer, deploy: Users, message: MessageSquare, bgm: Music2, raw_sys: Radio,
  planned_branch: GitBranch, planned_loop: Repeat, planned_blackboard: Database, planned_subline: Split,
  planned_nogo_row_3c: Ban, planned_nogo_steal_802: ShieldAlert, planned_nogo_event_kind: Unplug,
};

export function TodoBadge({ children = "TODO" }: { children?: ReactNode }) {
  return <span className="mission-todo-badge">{children}</span>;
}

export interface ActionRowData {
  action: ProjectedAction;
  suit?: SlotSuit;
  issues: GraphIssue[];
  selected: boolean;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
}

export type MissionFlowNode = Node<{ node: GraphNode; suit?: SlotSuit; orphan: boolean }, "mission">;
export type CommentFlowNode = Node<{ comment: GraphComment; onResize: (id: string, size: ResizeParams) => void }, "comment">;
export type OpeningFlowNode = Node<{
  opening: ProjectedOpening;
  budget?: BudgetPoint;
  issues: GraphIssue[];
  selectedAction: string | null;
  suits: Record<number, SlotSuit>;
  onSelectAction: (id: string) => void;
  onDeleteAction: (id: string) => void;
}, "opening">;
export type PhaseFlowNode = Node<{
  phase: ProjectedPhase;
  budget?: BudgetPoint;
  issues: GraphIssue[];
  selectedAction: string | null;
  suits: Record<number, SlotSuit>;
  onSelectAction: (id: string) => void;
  onDeleteAction: (id: string) => void;
  onDeletePhase: () => void;
  onToggle: () => void;
}, "phase">;
export type EndFlowNode = Node<{ label: string; issues: GraphIssue[] }, "end">;
export type EditorFlowNode = MissionFlowNode | CommentFlowNode | OpeningFlowNode | PhaseFlowNode | EndFlowNode;

function severityClass(issues: GraphIssue[]) {
  const worst = worstSeverity(issues);
  return worst ? `is-${worst}` : "";
}

function IssueBadge({ issues }: { issues: GraphIssue[] }) {
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  if (!errors && !warnings) return null;
  return <span className="mission-issue-badge" aria-label={`${errors} errors, ${warnings} warnings`}>{errors ? `${errors}E` : ""}{warnings ? `${warnings}W` : ""}</span>;
}

function actionSummary(action: ProjectedAction) {
  if (action.kind === "message") return formatHash(action.data.kind === "message" ? action.data.messageHash : 0);
  if (action.kind === "bgm") return formatHash(action.data.kind === "bgm" ? action.data.bgm : 0);
  if (action.data.kind === "raw_sys") return `${formatHash(action.data.command)} · ${action.data.args.length} args`;
  return "";
}

export function SuitLines({ suit }: { suit?: SlotSuit }) {
  if (!suit?.name && !suit?.unitId) return null;
  return <div className="mission-suit-lines">
    {suit.name ? <div className="mission-suit-name">{suit.name}</div> : null}
    {suit.unitId ? <div className="mission-suit-id">{suit.unitId}</div> : null}
  </div>;
}

export const ActionRow = memo(function ActionRow({ action, suit, issues, selected, onSelect, onDelete }: ActionRowData) {
  const Icon = ICONS[action.kind];
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(action.id); }
  }
  return <div role="button" tabIndex={0} className={`mission-action-row nodrag nopan ${selected ? "is-selected" : ""} ${severityClass(issues)}`}
    style={kindAccentStyle(action.kind)}
    aria-label={`Select ${action.label}`} aria-pressed={selected}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => { event.stopPropagation(); onSelect(action.id); }} onKeyDown={onKey}>
    <span className="mission-kind-dot" /><Icon size={14} />
    <span className="mission-action-copy">
      <b>{action.label}</b>
      {(action.kind === "deploy" || action.kind === "message") && <SuitLines suit={suit} />}
      {action.kind !== "deploy" && actionSummary(action) ? <span>{actionSummary(action)}</span> : null}
    </span>
    <IssueBadge issues={issues} />
    {onDelete && <button type="button" className="mission-action-delete nodrag nopan" aria-label={`Delete ${action.label}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => { event.stopPropagation(); onDelete(action.id); }}><Trash2 size={13} /></button>}
  </div>;
});

function ExecHandles({ label, hasIn, hasOut, connectable }: { label: string; hasIn: boolean; hasOut: boolean; connectable: boolean }) {
  return <div className="mission-execution-row">
    {hasIn ? <><Handle id="exec-in" type="target" position={Position.Left} isConnectable={connectable} aria-label={`Input ${label}`} role="button" className="mission-exec-pin" /><span>In</span></> : <span />}
    {hasOut && <><span>Then</span><Handle id="exec-out" type="source" position={Position.Right} isConnectable={connectable} aria-label={`Output ${label}`} role="button" className="mission-exec-pin" /></>}
  </div>;
}

export const OpeningNode = memo(function OpeningNode({ data, isConnectable, selected }: NodeProps<OpeningFlowNode>) {
  const issues = issuesForMembers(data.issues, data.opening.memberIds);
  const groupSelected = selected || data.opening.actions.some((action) => action.id === data.selectedAction);
  return <article className={`mission-phase-node is-opening ${groupSelected ? "is-selected" : ""} ${severityClass(issues)}`} data-kind="start" style={kindAccentStyle("start")}>
    <div className="mission-phase-stripe" />
    <header className="mission-phase-head"><Play size={15} /><span>{data.opening.label}</span><IssueBadge issues={issues} /></header>
    <div className="mission-node-type">Opening · player / partner initialized by the template</div>
    <ExecHandles label={data.opening.label} hasIn={false} hasOut connectable={isConnectable} />
    <div className="mission-phase-meta">
      <span>{data.opening.actions.length} deploys</span>
      {data.budget && <span className="mission-budget">Conservative {data.budget.conservativeEnemies}/12</span>}
    </div>
    <div className="mission-phase-body">
      {data.opening.actions.map((action) => <ActionRow key={action.id} action={action} suit={action.slot !== undefined ? data.suits[action.slot] : undefined}
        issues={issuesForMembers(data.issues, [action.id])}
        selected={data.selectedAction === action.id} onSelect={data.onSelectAction} onDelete={data.onDeleteAction} />)}
      {!data.opening.actions.length && <p className="mission-panel-caption">No extra enemy deploys in opening.</p>}
    </div>
  </article>;
});

export const PhaseNode = memo(function PhaseNode({ data, isConnectable, selected }: NodeProps<PhaseFlowNode>) {
  const { phase } = data;
  const issues = issuesForMembers(data.issues, phase.memberIds);
  const Icon = phase.collapsed ? ChevronRight : ChevronDown;
  const counts = phase.actions.reduce<Record<string, number>>((acc, action) => { acc[action.kind] = (acc[action.kind] ?? 0) + 1; return acc; }, {});
  const groupSelected = selected || data.selectedAction === phase.id || phase.actions.some((action) => action.id === data.selectedAction);
  return <article className={`mission-phase-node is-phase ${groupSelected ? "is-selected" : ""} ${phase.collapsed ? "is-collapsed" : ""} ${severityClass(issues)}`}
    data-kind="condition" style={kindAccentStyle("condition")}>
    <div className="mission-phase-stripe" />
    <header className="mission-phase-head">
      <button type="button" className="mission-collapse nodrag nopan" aria-label={phase.collapsed ? "Expand phase" : "Collapse phase"} aria-expanded={!phase.collapsed}
        onClick={(event) => { event.stopPropagation(); data.onToggle(); }}><Icon size={14} /></button>
      <Timer size={15} /><span>{phase.label}</span><IssueBadge issues={issues} />
      <button type="button" className="mission-action-delete nodrag nopan" aria-label={`Delete ${phase.label}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); data.onDeletePhase(); }}><Trash2 size={13} /></button>
    </header>
    <div className="mission-node-type">{triggerSummary(phase.trigger)} · {phase.delaySeconds}s</div>
    <ExecHandles label={phase.label} hasIn hasOut connectable={isConnectable} />
    <div className="mission-phase-meta">
      <span>{phase.actions.length} actions</span>
      {data.budget && <span className="mission-budget">Conservative {data.budget.conservativeEnemies}/12</span>}
    </div>
    {phase.collapsed
      ? <p className="mission-phase-summary">{Object.entries(counts).map(([kind, count]) => `${count} ${kind}`).join(" · ") || "Empty phase"}</p>
      : <div className="mission-phase-body">{phase.actions.map((action) => <ActionRow key={action.id} action={action}
        suit={action.slot !== undefined ? data.suits[action.slot] : undefined}
        issues={issuesForMembers(data.issues, [action.id])} selected={data.selectedAction === action.id} onSelect={data.onSelectAction} onDelete={data.onDeleteAction} />)}
        {!phase.actions.length && <p className="mission-panel-caption">Add a deploy, message, BGM or advanced command.</p>}
      </div>}
  </article>;
});

export const EndNode = memo(function EndNode({ data, isConnectable, selected }: NodeProps<EndFlowNode>) {
  return <article className={`mission-phase-node is-end ${selected ? "is-selected" : ""} ${severityClass(data.issues)}`} data-kind="end" style={kindAccentStyle("end")}>
    <div className="mission-phase-stripe" />
    <header className="mission-phase-head"><Flag size={15} /><span>{data.label}</span><IssueBadge issues={data.issues} /></header>
    <div className="mission-node-type">End of authored sequence</div>
    <ExecHandles label={data.label} hasIn hasOut={false} connectable={isConnectable} />
    <p className="mission-phase-summary">Native victory and defeat checks keep running after this node.</p>
  </article>;
});

export const BlueprintNode = memo(function BlueprintNode({ data, isConnectable, selected }: NodeProps<MissionFlowNode>) {
  const { node, suit, orphan } = data;
  const d = node.data, Icon = ICONS[d.kind];
  const planned = isPlannedKind(d.kind);
  const nogo = isNoGoKind(d.kind);
  const canConnect = isConnectable && !nogo;
  return <article className={`mission-blueprint-node ${selected ? "is-selected" : ""} ${orphan ? "is-orphan" : ""} ${planned ? "is-planned" : ""} ${nogo ? "is-nogo" : ""}`} data-kind={d.kind} style={kindAccentStyle(d.kind)}>
    <div className="mission-phase-stripe" />
    <header className="mission-node-title"><Icon size={15} /><span>{node.label}</span>{planned && <TodoBadge />}</header>
    <div className="mission-node-type">{NODE_LABELS[d.kind]}{planned && " · TODO"}{nogo && " · No-Go"}{orphan && <span title="Connect this node to the mission flow"> · Unconnected</span>}</div>
    <ExecHandles label={node.label} hasIn={d.kind !== "start" && !nogo} hasOut={d.kind !== "end" && !nogo} connectable={canConnect} />
    <div className="mission-node-values">
      {d.kind === "condition" && <>
        <div><span>{d.trigger.kind === "enemies_alive_at_most" ? "Enemies alive ≤" : d.trigger.kind === "elapsed_frames_at_least" ? "Elapsed frames ≥" : `Slot ${d.trigger.slot} HP % ≤`}</span><b>{d.trigger.value}</b></div>
        {d.trigger.kind === "slot_hp_percent_at_most" && <SuitLines suit={suit} />}
        <div><span>Delay</span><b>{d.delaySeconds} s</b></div>
      </>}
      {d.kind === "deploy" && <SuitLines suit={suit} />}
      {d.kind === "message" && <><SuitLines suit={suit} /><div><span>Message</span><b>0x{d.messageHash.toString(16)}</b></div></>}
      {d.kind === "bgm" && <div><span>BGM hash</span><b>0x{d.bgm.toString(16)}</b></div>}
      {d.kind === "raw_sys" && <><div><span>Command</span><b>0x{d.command.toString(16)}</b></div><div><span>Arguments</span><b>{d.args.length}</b></div></>}
      {planned && <p>{NODE_DESCRIPTIONS[d.kind]}</p>}
    </div>
  </article>;
});

export const CommentNode = memo(function CommentNode({ data, selected }: NodeProps<CommentFlowNode>) {
  return <div className="mission-comment-frame" style={{ "--comment-color": data.comment.color } as CSSProperties}>
    <NodeResizer isVisible={selected} minWidth={240} minHeight={120} maxWidth={10000} maxHeight={10000}
      onResizeEnd={(_, params) => data.onResize(data.comment.id, params)} />
    <div className="mission-comment-title">{data.comment.label}</div>
  </div>;
});
