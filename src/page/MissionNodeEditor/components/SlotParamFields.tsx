import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MissionGraph } from "@/services/missionGraph/graph";
import { applySlotParam, parseSlotWord, SLOT_PARAMS, type SlotParamSpec } from "@/services/missionGraph/slotParams";
import { signedSlotWord } from "@/services/missionGraph/spawnMarkers";
import { formatHash, type ResourceCatalog } from "@/services/missionGraph/resources";
import { ResourceCombobox } from "./ResourceCombobox";

const controlClass = "h-8 w-full min-w-0 px-2 text-xs shadow-none";

function shownWord(value: number, spec: SlotParamSpec): string {
  if (spec.control === "signed") return String(signedSlotWord(value));
  if (spec.control === "hash") return formatHash(value);
  return String(value >>> 0);
}

function WordField({ spec, value, label, onChange }: {
  spec: SlotParamSpec;
  value: number;
  label: string;
  onChange: (value: number) => void;
}) {
  const shown = shownWord(value, spec);
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  function commit(raw = draft) {
    const parsed = parseSlotWord(raw, spec.control === "signed");
    if (parsed === null) {
      setDraft(shown);
      return;
    }
    setDraft(shownWord(parsed, spec));
    if ((parsed >>> 0) !== (value >>> 0)) onChange(parsed >>> 0);
  }
  return <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
    <span className="whitespace-normal break-words leading-snug">{label}</span>
    <Input
      className={controlClass}
      aria-label={label}
      value={draft}
      inputMode="text"
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        if (spec.index === 0) return;
        const parsed = parseSlotWord(next, spec.control === "signed");
        if (parsed !== null) onChange(parsed >>> 0);
      }}
      onBlur={() => commit()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          (event.target as HTMLInputElement).blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setDraft(shown);
        }
      }}
    />
  </label>;
}

export function SlotParamFields({ graph, slotId, catalog, onChange, onSlotId, onAlias }: {
  graph: MissionGraph;
  slotId: number;
  catalog: ResourceCatalog;
  onChange: (graph: MissionGraph) => void;
  onSlotId: (slotId: number) => void;
  onAlias?: (alias: string) => void;
}) {
  const { t } = useTranslation("mission-node-editor");
  const slot = graph.slots.find((entry) => entry.params[0] === slotId) ?? graph.slots[0];
  function write(index: number, value: number) {
    const next = applySlotParam(graph, slot.params[0], index, value);
    onChange(next);
    if (index === 0 && next !== graph) onSlotId(value >>> 0);
  }
  return <div className="space-y-3">
    <p className="text-xs font-medium text-foreground">{t("slotParams.heading")}</p>
    {SLOT_PARAMS.map((spec) => {
      const value = slot.params[spec.index] ?? 0;
      const name = t(`slotParams.p${spec.index}`, { defaultValue: spec.name });
      const label = `P${spec.index} ${name}`;
      if (spec.control === "unit") {
        return <div key={spec.index} className="space-y-1">
          <ResourceCombobox label={label} kind="unit" value={value} graph={graph} catalog={catalog} onChange={(unitId) => write(2, unitId)} onAlias={onAlias} />
        </div>;
      }
      if (spec.control === "bool" && (value === 0 || value === 1)) {
        const id = `slot-p${spec.index}-${slot.params[0]}`;
        return <div key={spec.index} className="space-y-1">
          <div className="flex items-start gap-2">
            <Checkbox id={id} className="mt-0.5" checked={value === 1} onCheckedChange={(checked) => write(spec.index, checked === true ? 1 : 0)} />
            <Label htmlFor={id} className="whitespace-normal break-words text-xs font-normal leading-snug">{label}</Label>
          </div>
          {spec.unread && <p className="text-[10px] leading-snug text-muted-foreground">{t("slotParams.unread")}</p>}
          {spec.index === 33 && value === 1 && <p className="text-xs text-amber-600">{t("slotParams.external")}</p>}
        </div>;
      }
      return <div key={spec.index} className="space-y-1">
        <WordField spec={spec} value={value} label={label} onChange={(next) => write(spec.index, next)} />
        {spec.unread && <p className="text-[10px] leading-snug text-muted-foreground">{t("slotParams.unread")}</p>}
        {spec.index === 37 && <p className="text-[10px] leading-snug text-muted-foreground">{t("slotParams.intro")}</p>}
        {spec.index === 3 && <p className="text-[10px] leading-snug text-muted-foreground">{t("slotParams.team")}</p>}
      </div>;
    })}
  </div>;
}
