import type { MissionGraph } from "./graph";
import { parseHashInput, type ResourceOption } from "./resources";

export interface SlotSuit {
  name: string;
  unitId: string;
}

/** Character-list name and decimal unit id for a slot. Missing parts stay blank. */
export function slotSuit(slot: { params: readonly number[] } | undefined, units: readonly Pick<ResourceOption, "value" | "label">[]): SlotSuit {
  if (!slot) return { name: "", unitId: "" };
  const id = slot.params[2] >>> 0;
  if (!id) return { name: "", unitId: "" };
  const hit = units.find((option) => (option.value >>> 0) === id);
  const name = hit && hit.label.trim() && hit.label.trim() !== String(id) ? hit.label.trim() : "";
  return { name, unitId: String(id) };
}

export function slotChoiceLabel(slotNumber: number, suit: SlotSuit): string {
  return [String(slotNumber), suit.name, suit.unitId].filter((part) => part !== "").join(" · ");
}

/** `sys_0(0x400)` argument count. P0 is the first argument after the opcode. */
export const SLOT_PARAM_COUNT = 51;

/**
 * Parameters `sub_140DC45A0` does not read.
 * They are still stored and emitted. Editing them does not change the spawn.
 */
export const UNREAD_SLOT_PARAMS = new Set([9, 10, 12, 15, 18, 19, 22, 23, 24, 40, 41]);

const SIGNED_SLOT_PARAMS = new Set([28, 30, 31, 32, 34, 35, 36, 38]);
const BOOL_SLOT_PARAMS = new Set([1, 4, 5, 6, 7, 26, 33]);
const HASH_SLOT_PARAMS = new Set([8, 43, 45, 47, 49]);

export type SlotParamControl = "bool" | "signed" | "hash" | "unit" | "word";

export interface SlotParamSpec {
  index: number;
  /** English fallback. The inspector prefers `slotParams.pN`. */
  name: string;
  control: SlotParamControl;
  unread: boolean;
}

const NAMES = [
  "Slot",
  "Refresh override",
  "Unit ID",
  "Team",
  "Spawn flag",
  "CPU partner",
  "Important unit",
  "Show pilot name",
  "Pilot name hash",
  "Unread",
  "Unread",
  "Spawn map index",
  "Unread",
  "Unknown index",
  "Refresh request",
  "Unread",
  "Level A",
  "Level B",
  "Unread",
  "Unread",
  "AI",
  "Level C",
  "Unread",
  "Unread",
  "Unread",
  "Mode callback",
  "Second pose",
  "Pose index",
  "Second facing",
  "Second pose extra",
  "Second X",
  "Second Y",
  "Second Z",
  "External coordinates",
  "Spawn X",
  "Spawn Y",
  "Spawn Z",
  "Intro action",
  "Facing",
  "Intro frames",
  "Unread",
  "Unread",
  "Extra pairs",
  "Extra hash 1",
  "Extra value 1",
  "Extra hash 2",
  "Extra value 2",
  "Extra hash 3",
  "Extra value 3",
  "Extra hash 4",
  "Extra value 4",
] as const;

export const SLOT_PARAMS: readonly SlotParamSpec[] = NAMES.map((name, index) => ({
  index,
  name,
  control: index === 2 ? "unit"
    : BOOL_SLOT_PARAMS.has(index) ? "bool"
    : SIGNED_SLOT_PARAMS.has(index) ? "signed"
    : HASH_SLOT_PARAMS.has(index) ? "hash"
    : "word",
  unread: UNREAD_SLOT_PARAMS.has(index),
}));

export function parseSlotWord(text: string, signed: boolean): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (signed && trimmed.startsWith("-")) {
    const value = Number(trimmed);
    if (!Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff) return null;
    return value;
  }
  return parseHashInput(trimmed);
}

function rewriteSlotReferences(graph: MissionGraph, from: number, to: number): MissionGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const data = node.data;
      if ((data.kind === "deploy" || data.kind === "message") && data.slot === from) {
        return { ...node, data: { ...data, slot: to } };
      }
      if (data.kind === "condition" && data.trigger.kind === "slot_hp_percent_at_most" && data.trigger.slot === from) {
        return { ...node, data: { ...data, trigger: { ...data.trigger, slot: to } } };
      }
      return node;
    }),
    slots: graph.slots.map((entry) => entry.params[0] === from
      ? { ...entry, params: entry.params.map((word, index) => index === 0 ? to : word) }
      : entry),
  };
}

/** Change P0 and the deploy / message / HP references that name this slot. */
export function renameSlot(graph: MissionGraph, from: number, to: number): MissionGraph | null {
  const next = to >>> 0;
  if (next > 255 || next === (from >>> 0)) return null;
  if (!graph.slots.some((entry) => entry.params[0] === from)) return null;
  if (graph.slots.some((entry) => entry.params[0] === next)) return null;
  return rewriteSlotReferences(graph, from, next);
}

/** Write one `sys_0(0x400)` argument. P0 renames the slot when the id is free. */
export function applySlotParam(graph: MissionGraph, slotId: number, index: number, value: number): MissionGraph {
  if (index < 0 || index >= SLOT_PARAM_COUNT) return graph;
  const word = value >>> 0;
  if (index === 0) return renameSlot(graph, slotId, word) ?? graph;
  const slot = graph.slots.find((entry) => entry.params[0] === slotId);
  if (!slot || slot.params[index] === word) return graph;
  const params = slot.params.map((entry, paramIndex) => paramIndex === index ? word : entry);
  return {
    ...graph,
    slots: graph.slots.map((entry) => entry.params[0] === slotId ? { ...entry, params } : entry),
  };
}

/** Append an enemy slot with the official unread defaults still filled in. */
export function addEnemySlot(graph: MissionGraph): { graph: MissionGraph; slotId: number } | null {
  if (graph.slots.length >= 256) return null;
  const slotId = Array.from({ length: 254 }, (_, index) => index + 2).find((id) => !graph.slots.some((entry) => entry.params[0] === id));
  if (slotId === undefined) return null;
  const params = Array.from({ length: SLOT_PARAM_COUNT }, () => 0);
  params[0] = slotId;
  params[3] = 1;
  params[20] = 1;
  params[22] = 100;
  params[23] = 100;
  params[24] = 100;
  params[39] = 1;
  return {
    slotId,
    graph: { ...graph, slots: [...graph.slots, { name: `Enemy ${slotId}`, params }] },
  };
}
