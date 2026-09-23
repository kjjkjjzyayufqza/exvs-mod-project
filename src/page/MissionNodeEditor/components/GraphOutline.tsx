import { useMemo, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import type { ActionKind, MissionGraph, NodeKind } from "@/services/missionGraph/graph";
import { isPlannedKind } from "@/services/missionGraph/planned";
import { LINEAR_TEMPLATE_IDS, type LinearTemplateId } from "@/services/missionGraph/templates";
import { derivePhaseProjection, type ProjectedAction } from "@/services/missionGraph/projection";
import type { ResourceOption } from "@/services/missionGraph/resources";
import { slotSuit } from "@/services/missionGraph/slotParams";
import { issuesForMembers, type GraphIssue } from "@/services/missionGraph/issues";
import { NODE_DESCRIPTIONS, NODE_LABELS, NODE_LIBRARY, kindAccentStyle } from "./FlowNodes";

export const NODE_DRAG_TYPE = "application/exvs-mission-node";

export function NodeLibrary({ disabled, onAdd, onTemplate }: {
  disabled: boolean;
  onAdd: (kind: ActionKind | "condition") => void;
  onTemplate?: (id: LinearTemplateId) => void;
}) {
  const { t } = useTranslation("mission-node-editor");
  const [query, setQuery] = useState("");
  const needle = query.toLowerCase();
  const matches = NODE_LIBRARY.filter((kind) => `${NODE_LABELS[kind]} ${NODE_DESCRIPTIONS[kind]} ${t(`nodes.${kind}`)}`.toLowerCase().includes(needle));
  const templates = LINEAR_TEMPLATE_IDS.filter((id) => `${id} ${t(`templates.${id}`)} ${t(`templates.${id}Hint`)}`.toLowerCase().includes(needle));
  return <aside className="mission-node-library" aria-label="Node library">
    <h2>{t("nav.actions")}</h2>
    <label className="mission-library-search"><Search size={14} /><input aria-label="Search node library" placeholder={t("nav.searchActions")} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
    <p className="mission-panel-caption">{t("nav.libraryHint")}</p>
    <div className="mission-library-items">{matches.map((kind) => <button key={kind} type="button" disabled={disabled} draggable={!disabled} title={NODE_DESCRIPTIONS[kind]}
      style={kindAccentStyle(kind)}
      onDragStart={(event) => { event.dataTransfer.setData(NODE_DRAG_TYPE, kind); event.dataTransfer.effectAllowed = "copy"; }}
      onClick={() => onAdd(kind)}>
      <span className="mission-kind-dot" /><span>{t(`nodes.${kind}`, { defaultValue: NODE_LABELS[kind] })}</span>
    </button>)}</div>
    {onTemplate && <>
      <h2 className="mt-3">{t("templates.title")}</h2>
      <p className="mission-panel-caption">{t("templates.hint")}</p>
      <div className="mission-library-items">{templates.map((id) => <button key={id} type="button" disabled={disabled} style={kindAccentStyle("condition")} title={t(`templates.${id}Hint`)} onClick={() => onTemplate(id)}>
        <span className="mission-kind-dot" /><span>{t(`templates.${id}`)}</span>
      </button>)}</div>
    </>}
    {!matches.length && !templates.length && <p className="mission-panel-caption">{t("nav.noActions")}</p>}
  </aside>;
}

function outlineActionLabel(graph: MissionGraph, action: ProjectedAction, units: readonly Pick<ResourceOption, "value" | "label">[]): string {
  if (action.slot === undefined) return action.label;
  const slot = graph.slots.find((entry) => entry.params[0] === action.slot);
  const suit = slotSuit(slot, units);
  const extra = [suit.name, suit.unitId].filter((part) => part !== "").join(" ");
  return extra ? `${action.label} ${extra}` : action.label;
}

export function GraphOutline({ graph, units = [], selected, issues, onFocus }: {
  graph: MissionGraph; units?: readonly Pick<ResourceOption, "value" | "label">[];
  selected: string | null; issues: GraphIssue[]; onFocus: (id: string) => void;
}) {
  const { t } = useTranslation("mission-node-editor");
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();
  const projection = useMemo(() => derivePhaseProjection(graph), [graph]);
  const rows = useMemo(() => {
    const items: { id: string; label: string; depth: number; kind: string }[] = [];
    if (projection.opening) {
      items.push({ id: projection.opening.id, label: projection.opening.label, depth: 0, kind: "start" });
      projection.opening.actions.forEach((action) => items.push({ id: action.id, label: outlineActionLabel(graph, action, units), depth: 1, kind: action.kind }));
    }
    for (const phase of projection.phases) {
      items.push({ id: phase.id, label: phase.label, depth: 0, kind: "condition" });
      phase.actions.forEach((action) => items.push({ id: action.id, label: outlineActionLabel(graph, action, units), depth: 1, kind: action.kind }));
    }
    if (projection.end) items.push({ id: projection.end.id, label: projection.end.label, depth: 0, kind: "end" });
    if (projection.planned.length) {
      items.push({ id: "__planned", label: t("nav.planned"), depth: 0, kind: "planned_branch" });
      projection.planned.forEach((node) => items.push({ id: node.id, label: `${t("todo.badge")} ${node.label}`, depth: 1, kind: node.data.kind }));
    }
    if (projection.drafts.length) {
      items.push({ id: "__drafts", label: t("nav.drafts"), depth: 0, kind: "raw_sys" });
      projection.drafts.forEach((node) => items.push({ id: node.id, label: node.label, depth: 1, kind: node.data.kind }));
    }
    const needle = query.trim().toLowerCase();
    return needle ? items.filter((item) => item.label.toLowerCase().includes(needle)) : items;
  }, [graph, projection, query, t, units]);
  return <section className="mission-outline" aria-label="Graph outline">
    <h2>{t("nav.outline")} <span>({projection.phases.length})</span></h2>
    <input aria-label="Find node" className="mission-outline-search" placeholder={t("nav.findNode")} value={query}
      onChange={(event) => startTransition(() => { setQuery(event.target.value); })} />
    <div className="mission-outline-list">{rows.map((row) => {
      if (row.id === "__drafts" || row.id === "__planned") return <div key={row.id} className="mission-outline-band">{row.label}</div>;
      const count = issuesForMembers(issues, [row.id]).filter((issue) => issue.severity !== "info").length;
      return <button key={row.id} type="button" onClick={() => onFocus(row.id)} aria-pressed={selected === row.id}
        aria-label={isPlannedKind(row.kind) ? `TODO ${row.label}` : row.label}
        className={`mission-outline-row ${selected === row.id ? "is-selected" : ""}`}
        style={{ ...kindAccentStyle((row.kind in NODE_LABELS ? row.kind : "condition") as NodeKind), paddingLeft: 8 + row.depth * 12 }}>
        <span className="mission-kind-dot" />
        <span className="min-w-0 whitespace-normal break-words text-left">{row.label}</span>
        {count > 0 && <span className="mission-outline-count">{count}</span>}
      </button>;
    })}</div>
    {!rows.length && <p className="mission-panel-caption">{t("nav.noOutline")}</p>}
  </section>;
}
