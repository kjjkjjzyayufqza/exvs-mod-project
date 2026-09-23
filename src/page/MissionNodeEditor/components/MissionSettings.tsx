import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MissionGraph } from "@/services/missionGraph/graph";
import { Field, NumberField, SlotSelect } from "./Inspector";
import { ResourceCombobox } from "./ResourceCombobox";
import { SlotParamFields } from "./SlotParamFields";
import { builtinCatalog, type ResourceCatalog } from "@/services/missionGraph/resources";
import { deleteEnemySlot } from "@/services/missionGraph/editor";
import { addEnemySlot } from "@/services/missionGraph/slotParams";

const controlClass = "h-8 w-full min-w-0 px-2 text-xs shadow-none";

const WIN = ["Enemy cost exhausted", "Targets destroyed", "Survive time limit", "Any target destroyed"];
const LOSE = ["Player cost exhausted", "Important units lost", "Time up"];

export function BattleSettings({ graph, onChange, catalog = builtinCatalog(), onAlias }: {
  graph: MissionGraph; onChange: (graph: MissionGraph) => void; catalog?: ResourceCatalog;
  onAlias?: (kind: "map" | "bgm", value: number, alias: string) => void;
}) {
  const battle = graph.battle;
  const update = (patch: Partial<MissionGraph["battle"]>) => onChange({ ...graph, battle: { ...battle, ...patch } });
  return <div className="space-y-3">
    <ResourceCombobox label="Map hash" kind="map" value={battle.map} graph={graph} catalog={catalog} onChange={(map) => update({ map })} onAlias={(alias) => onAlias?.("map", battle.map, alias)} />
    <ResourceCombobox label="Opening BGM hash" kind="bgm" value={battle.bgm} graph={graph} catalog={catalog} onChange={(bgm) => update({ bgm })} onAlias={(alias) => onAlias?.("bgm", battle.bgm, alias)} />
    {[0, 1].map((team) => <NumberField key={team} label={team === 0 ? "Player team cost" : "Enemy team cost"} value={battle.teamCosts.find((c) => c.team === team)?.cost ?? 0}
      onChange={(cost) => update({ teamCosts: [...battle.teamCosts.filter((c) => c.team !== team), { team, cost }].sort((a, b) => a.team - b.team) })} />)}
    {(["win", "lose"] as const).map((key) => <fieldset key={key} className="space-y-1.5 rounded border p-2">
      <legend className="px-1 text-xs font-medium">{key === "win" ? "Victory" : "Defeat"}</legend>
      {(key === "win" ? WIN : LOSE).map((label, i) => {
        const id = `battle-${key}-${i}`;
        const checked = !!(battle[key] & (1 << i));
        return <div className="flex items-center gap-2" key={label}>
          <Checkbox id={id} checked={checked} onCheckedChange={(next) => update({ [key]: next === true ? battle[key] | (1 << i) : battle[key] & ~(1 << i) })} />
          <Label htmlFor={id} className="text-xs font-normal">{label}</Label>
        </div>;
      })}
    </fieldset>)}
    <NumberField label="Target count" value={battle.targetCount} onChange={(targetCount) => update({ targetCount })} />
    <NumberField label="Allowed losses" value={battle.allowedLosses} onChange={(allowedLosses) => update({ allowedLosses })} />
  </div>;
}

export function UnitSettings({ graph, onChange, catalog = builtinCatalog(), focusSlot, onFocusSlot, onAlias }: {
  graph: MissionGraph;
  onChange: (graph: MissionGraph) => void;
  catalog?: ResourceCatalog;
  focusSlot?: number;
  onFocusSlot?: (slot: number) => void;
  onAlias?: (kind: "unit", value: number, alias: string) => void;
}) {
  const [selected, setSelected] = useState(0);
  useEffect(() => { if (focusSlot !== undefined) setSelected(focusSlot); }, [focusSlot]);
  function chooseSlot(slot: number) {
    setSelected(slot);
    onFocusSlot?.(slot);
  }
  const slot = graph.slots.find((s) => s.params[0] === selected) ?? graph.slots[0];
  const patchSlot = (patch: Partial<typeof slot>) => onChange({ ...graph, slots: graph.slots.map((s) => s === slot ? { ...s, ...patch } : s) });
  const slotId = slot.params[0];
  const referencedByAction = graph.nodes.some((node) => (node.data.kind === "deploy" || node.data.kind === "message") && node.data.slot === slotId);
  const hpLocked = graph.nodes.some((node) => node.data.kind === "condition" && node.data.trigger.kind === "slot_hp_percent_at_most" && node.data.trigger.slot === slotId);
  const lastEnemy = slot.params[3] === 1 && graph.slots.filter((entry) => entry.params[3] === 1).length < 2;
  const protectedSlot = slotId < 2;
  function addEnemy() {
    const created = addEnemySlot(graph);
    if (!created) return;
    onChange(created.graph);
    chooseSlot(created.slotId);
  }
  function cloneEnemy() {
    const source = graph.slots.find((s) => s.params[3] === 1);
    if (!source) return;
    const id = Array.from({ length: 254 }, (_, i) => i + 2).find((i) => !graph.slots.some((s) => s.params[0] === i));
    if (id === undefined) return;
    const params = [...source.params]; params[0] = id;
    onChange({ ...graph, slots: [...graph.slots, { name: `Enemy ${id}`, params }] });
    chooseSlot(id);
  }
  return <div className="space-y-3">
    <SlotSelect graph={graph} catalog={catalog} label="Edit unit" value={slot.params[0]} onChange={chooseSlot} />
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={addEnemy} disabled={graph.slots.length >= 256}>Add enemy</Button>
      <Button size="sm" variant="outline" onClick={cloneEnemy} disabled={graph.slots.length >= 256 || !graph.slots.some((s) => s.params[3] === 1)}>Clone enemy</Button>
      <Button size="sm" variant="ghost" disabled={protectedSlot || lastEnemy || hpLocked}
        onClick={() => { const next = deleteEnemySlot(graph, slotId); if (next) { onChange(next); chooseSlot(0); } }}>Delete unit</Button></div>
    {protectedSlot && <p className="text-xs text-muted-foreground">Player and partner slots stay in the mission.</p>}
    {lastEnemy && <p className="text-xs text-muted-foreground">Keep at least one enemy slot.</p>}
    {hpLocked && <p className="text-xs text-amber-600">A phase HP condition uses this slot. Change that condition, then delete the unit.</p>}
    {!protectedSlot && !lastEnemy && !hpLocked && referencedByAction && <p className="text-xs text-muted-foreground">Delete unit also removes deploy and message actions that use this slot. Or use the trash icon on that action.</p>}
    <Field label="Unit name"><Input className={controlClass} maxLength={120} value={slot.name} onChange={(e) => patchSlot({ name: e.target.value })} /></Field>
    <SlotParamFields graph={graph} slotId={slotId} catalog={catalog} onChange={onChange} onSlotId={chooseSlot} onAlias={(alias) => onAlias?.("unit", slot.params[2], alias)} />
  </div>;
}
