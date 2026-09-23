import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActionKind } from "@/services/missionGraph/graph";
import { NODE_DESCRIPTIONS, NODE_LABELS, TodoBadge } from "./FlowNodes";

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
  disabled?: boolean;
  todoBadge?: boolean;
}

const NO_EXTRA: PaletteCommand[] = [];

export function CommandPalette({
  open, onClose, onInsert, extra = NO_EXTRA,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (kind: ActionKind | "condition") => void;
  extra?: PaletteCommand[];
}) {
  const { t } = useTranslation("mission-node-editor");
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const builtIn = useMemo<PaletteCommand[]>(() => [
    { id: "condition", label: NODE_LABELS.condition, hint: NODE_DESCRIPTIONS.condition, run: () => onInsert("condition") },
    { id: "deploy", label: NODE_LABELS.deploy, hint: NODE_DESCRIPTIONS.deploy, run: () => onInsert("deploy") },
    { id: "message", label: NODE_LABELS.message, hint: NODE_DESCRIPTIONS.message, run: () => onInsert("message") },
    { id: "bgm", label: NODE_LABELS.bgm, hint: NODE_DESCRIPTIONS.bgm, run: () => onInsert("bgm") },
    { id: "raw_sys", label: NODE_LABELS.raw_sys, hint: NODE_DESCRIPTIONS.raw_sys, run: () => onInsert("raw_sys") },
    ...extra,
  ], [extra, onInsert]);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return builtIn.filter((command) => `${command.label} ${command.hint ?? ""} ${command.id}`.toLowerCase().includes(needle));
  }, [builtIn, query]);
  const runnable = matches.find((command) => !command.disabled);
  useEffect(() => { if (open) { setQuery(""); requestAnimationFrame(() => input.current?.focus()); } }, [open]);
  if (!open) return null;
  return <div className="mission-palette-scrim" role="presentation" onMouseDown={onClose}>
    <div className="mission-palette" role="dialog" aria-label={t("palette.title")} onMouseDown={(event) => event.stopPropagation()}>
      <input ref={input} aria-label={t("palette.search")} placeholder={t("palette.placeholder")} value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key === "Enter" && runnable) { event.preventDefault(); runnable.run(); onClose(); }
        }} />
      <div className="mission-palette-list">
        {matches.map((command) => <button key={command.id} type="button" disabled={command.disabled}
          aria-label={command.todoBadge ? `TODO ${command.label}` : command.label}
          onClick={() => { if (command.disabled) return; command.run(); onClose(); }}>
          <span className="flex items-center gap-2">{command.todoBadge && <TodoBadge>{t("todo.badge")}</TodoBadge>}<span>{command.label}</span></span>
          {command.hint && <span className="mission-panel-caption">{command.hint}</span>}
        </button>)}
        {!matches.length && <p className="mission-panel-caption">{t("palette.empty")}</p>}
      </div>
    </div>
  </div>;
}
