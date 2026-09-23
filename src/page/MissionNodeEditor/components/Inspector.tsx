import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GraphComment, GraphNode, MissionGraph } from "@/services/missionGraph/graph";
import { isNoGoKind, isPlannedKind } from "@/services/missionGraph/planned";
import { derivePhaseProjection, hostOf } from "@/services/missionGraph/projection";
import { builtinCatalog, type ResourceCatalog } from "@/services/missionGraph/resources";
import { slotChoiceLabel, slotSuit } from "@/services/missionGraph/slotParams";
import { NODE_DESCRIPTIONS, NODE_LABELS, TodoBadge } from "./FlowNodes";
import { ResourceCombobox } from "./ResourceCombobox";

const controlClass = "h-8 w-full min-w-0 px-2 text-xs shadow-none tabular-nums";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground"><span>{label}</span>{children}</label>;
}

export function SelectField({ label, value, onValueChange, options, placeholder }: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const known = options.some((option) => option.value === value);
  const items = known || value === "" ? options : [...options, { value, label: value }];
  return <div className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
    <span>{label}</span>
    <Select value={known ? value : value === "" ? undefined : value} onValueChange={onValueChange}>
      <SelectTrigger aria-label={label} className={controlClass}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((option) => <SelectItem key={option.value} value={option.value} className="text-xs">{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>;
}

export function CommentInspector({ comment, onChange }: {
  comment: GraphComment; onChange: (comment: GraphComment) => void;
}) {
  return <div className="space-y-3">
    <div className="text-xs font-semibold tracking-wide text-muted-foreground">Comment frame</div>
    <Field label="Comment title"><Input className={controlClass} value={comment.label} maxLength={120} onChange={(e) => onChange({ ...comment, label: e.target.value })} /></Field>
    <Field label="Comment color"><Input type="color" className={`${controlClass} cursor-pointer p-1`} value={comment.color} onChange={(e) => onChange({ ...comment, color: e.target.value })} /></Field>
    <NumberField label="Frame width" value={comment.width} onChange={(width) => onChange({ ...comment, width })} />
    <NumberField label="Frame height" value={comment.height} onChange={(height) => onChange({ ...comment, height })} />
    <p className="text-xs text-muted-foreground">Drag the header to move the frame and fully enclosed nodes. Resize from its corners. Comments are saved with the graph and do not execute.</p>
  </div>;
}

export function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setText(String(value)); setDraft(String(value)); }, [value]);
  function commit(raw = draft) {
    const parsed = Number(raw.trim());
    if (!Number.isFinite(parsed)) { setDraft(String(value)); return; }
    setText(String(parsed));
    if (parsed !== value) onChange(parsed);
  }
  return <Field label={label}><Input className={controlClass} value={draft} inputMode="text" aria-invalid={draft.trim() !== "" && !Number.isFinite(Number(draft))}
    onChange={(event) => {
      const next = event.target.value;
      setDraft(next);
      const parsed = Number(next.trim());
      if (Number.isFinite(parsed)) { setText(next); onChange(parsed); }
    }}
    onBlur={() => commit()}
    onKeyDown={(event) => {
      if (event.key === "Enter") { event.preventDefault(); commit(); (event.target as HTMLInputElement).blur(); }
      if (event.key === "Escape") { event.preventDefault(); setDraft(text); }
    }} /></Field>;
}

export function SlotSelect({ graph, value, onChange, enemiesOnly = false, label = "Unit slot", catalog = builtinCatalog() }: {
  graph: MissionGraph; value: number; onChange: (value: number) => void; enemiesOnly?: boolean; label?: string;
  catalog?: ResourceCatalog;
}) {
  const options = graph.slots
    .filter((slot) => !enemiesOnly || slot.params[3] === 1)
    .map((slot) => ({ value: String(slot.params[0]), label: slotChoiceLabel(slot.params[0], slotSuit(slot, catalog.units)) }));
  return <SelectField label={label} value={String(value)} options={options} onValueChange={(next) => onChange(Number(next))} />;
}

function SlotSuitReadout({ graph, slotId, catalog }: { graph: MissionGraph; slotId: number; catalog: ResourceCatalog }) {
  const { t } = useTranslation("mission-node-editor");
  const slot = graph.slots.find((entry) => entry.params[0] === slotId);
  const suit = slotSuit(slot, catalog.units);
  return <div className="space-y-1 text-xs">
    <div className="text-muted-foreground">{t("slotSuit.name")}</div>
    <div className="whitespace-normal break-words leading-snug text-foreground">{suit.name}</div>
    <div className="text-muted-foreground">{t("slotSuit.id")}</div>
    <div className="font-mono tabular-nums text-foreground">{suit.unitId}</div>
  </div>;
}

export function Inspector({ graph, node, catalog = builtinCatalog(), onChange, onConnect, onAlias, onInsertPhaseBefore, onInsertPhaseAfter, onMoveAction, onMoveActionToPhase }: {
  graph: MissionGraph; node: GraphNode; catalog?: ResourceCatalog; onChange: (node: GraphNode) => void; onConnect: (target: string) => void;
  onAlias?: (kind: "bgm" | "message", value: number, alias: string) => void;
  onInsertPhaseBefore?: () => void;
  onInsertPhaseAfter?: () => void;
  onMoveAction?: (direction: -1 | 1) => void;
  onMoveActionToPhase?: (hostId: string) => void;
}) {
  const { t } = useTranslation("mission-node-editor");
  const d = node.data;
  const update = (data: GraphNode["data"]) => onChange({ ...node, data });
  const planned = isPlannedKind(d.kind);
  const nogo = isNoGoKind(d.kind);
  const projection = derivePhaseProjection(graph);
  const visualId = hostOf(projection, node.id) ?? node.id;
  const visualNext = projection.visualEdges.find((edge) => edge.source === visualId)?.target ?? "";
  const visualTargets = [
    projection.opening ? { id: projection.opening.id, label: projection.opening.label } : null,
    ...projection.phases.map((phase) => ({ id: phase.id, label: phase.label })),
    projection.end ? { id: projection.end.id, label: projection.end.label } : null,
    ...projection.drafts.map((draft) => ({ id: draft.id, label: draft.label })),
    ...projection.planned.map((entry) => ({ id: entry.id, label: `TODO ${entry.label}` })),
  ].filter((entry): entry is { id: string; label: string } => !!entry && entry.id !== visualId);
  const showNext = !nogo && (d.kind === "start" || d.kind === "condition" || d.kind === "end" || projection.drafts.some((draft) => draft.id === node.id) || projection.planned.some((entry) => entry.id === node.id));
  const phaseOptions = [
    ...(projection.opening ? [{ value: projection.opening.id, label: projection.opening.label }] : []),
    ...projection.phases.map((phase) => ({ value: phase.id, label: phase.label })),
  ];
  return <div className="space-y-3">
    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{NODE_LABELS[d.kind]} {planned && <TodoBadge>{t("todo.badge")}</TodoBadge>}</div>
    <Field label="Node label"><Input className={controlClass} maxLength={120} value={node.label} onChange={(e) => onChange({ ...node, label: e.target.value })} /></Field>
    {planned && <p className="text-xs text-muted-foreground" aria-label={nogo ? t("planned.nogoAria", { name: NODE_LABELS[d.kind] }) : t("planned.addAria", { name: NODE_LABELS[d.kind] })}>
      {nogo ? t("planned.nogoBody", { reason: NODE_DESCRIPTIONS[d.kind] }) : t("planned.researchBody")}
    </p>}
    {d.kind === "condition" && <>
      <SelectField label="Trigger" value={d.trigger.kind} onValueChange={(kind) => {
        update({ ...d, trigger: kind === "slot_hp_percent_at_most" ? { kind, slot: 0, value: 50 } : { kind: kind as "enemies_alive_at_most" | "elapsed_frames_at_least", value: 0 } });
      }} options={[
        { value: "enemies_alive_at_most", label: "Enemies alive at most" },
        { value: "elapsed_frames_at_least", label: "Elapsed frames at least" },
        { value: "slot_hp_percent_at_most", label: "Slot HP percent at most" },
      ]} />
      {d.trigger.kind === "slot_hp_percent_at_most" && <>
        <SlotSelect graph={graph} catalog={catalog} value={d.trigger.slot} label="Observed slot" onChange={(slot) => update({ ...d, trigger: { kind: "slot_hp_percent_at_most", slot, value: d.trigger.value } })} />
        <SlotSuitReadout graph={graph} slotId={d.trigger.slot} catalog={catalog} />
      </>}
      <NumberField label="Threshold" value={d.trigger.value} onChange={(next) => update({ ...d, trigger: { ...d.trigger, value: next } })} />
      <NumberField label="Delay (seconds)" value={d.delaySeconds} onChange={(delaySeconds) => update({ ...d, delaySeconds })} />
      <p className="text-xs text-muted-foreground">Delay counts only while the condition holds. Minimum: 1 second.</p>
    </>}
    {(d.kind === "deploy" || d.kind === "message") && <>
      <SlotSelect graph={graph} catalog={catalog} value={d.slot} enemiesOnly={d.kind === "deploy"} onChange={(slot) => update({ ...d, slot })} />
      <SlotSuitReadout graph={graph} slotId={d.slot} catalog={catalog} />
    </>}
    {d.kind === "message" && <ResourceCombobox label="Message hash" kind="message" value={d.messageHash} graph={graph} catalog={catalog} onChange={(messageHash) => update({ ...d, messageHash })} onAlias={(alias) => onAlias?.("message", d.messageHash, alias)} />}
    {d.kind === "bgm" && <ResourceCombobox label="BGM hash" kind="bgm" value={d.bgm} graph={graph} catalog={catalog} onChange={(bgm) => update({ ...d, bgm })} onAlias={(alias) => onAlias?.("bgm", d.bgm, alias)} />}
    {d.kind === "raw_sys" && <>
      <NumberField label="Command" value={d.command} onChange={(command) => update({ ...d, command })} />
      <Field label="Arguments (comma separated)"><Input className={controlClass} defaultValue={d.args.join(", ")} onBlur={(e) => update({ ...d, args: e.target.value.trim() ? e.target.value.split(",").map((v) => v.trim() ? Number(v) : NaN) : [] })} /></Field>
      <p className="text-xs text-muted-foreground">Advanced action. Runtime effects are unverified.</p>
    </>}
    {d.kind === "start" && <p className="text-xs text-muted-foreground">{t("details.openingHelp")}</p>}
    {d.kind === "condition" && <p className="text-xs text-muted-foreground">{t("details.phaseHelp")}</p>}
    {d.kind === "end" && <p className="text-xs text-muted-foreground">{t("details.endHelp")}</p>}
    {(d.kind === "start" || d.kind === "condition") && <div className="flex flex-wrap gap-2">
      {d.kind === "condition" && onInsertPhaseBefore && <Button size="sm" variant="outline" onClick={onInsertPhaseBefore}>{t("inspector.insertBefore")}</Button>}
      {onInsertPhaseAfter && <Button size="sm" variant="outline" onClick={onInsertPhaseAfter}>{t("inspector.insertAfter")}</Button>}
    </div>}
    {["deploy", "message", "bgm", "raw_sys"].includes(d.kind) && <div className="space-y-2">
      {onMoveAction && <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onMoveAction(-1)}>{t("inspector.moveUp")}</Button>
        <Button size="sm" variant="outline" onClick={() => onMoveAction(1)}>{t("inspector.moveDown")}</Button>
      </div>}
      {onMoveActionToPhase && <SelectField label={t("inspector.moveToPhase")} value={visualId} options={phaseOptions} onValueChange={(next) => { if (next && next !== visualId) onMoveActionToPhase(next); }} />}
    </div>}
    {showNext && d.kind !== "end" && <SelectField
      label="Next node"
      value={visualTargets.some((entry) => entry.id === visualNext) ? visualNext : ""}
      placeholder="Choose a connection"
      options={visualTargets.map((entry) => ({ value: entry.id, label: entry.label }))}
      onValueChange={(next) => { if (next) onConnect(next); }}
    />}
  </div>;
}
