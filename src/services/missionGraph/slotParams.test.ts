import { describe, expect, it } from "vitest";
import { createGraph } from "./graph";
import { insertAction } from "./commands";
import { addEnemySlot, applySlotParam, SLOT_PARAM_COUNT, SLOT_PARAMS, slotSuit, UNREAD_SLOT_PARAMS } from "./slotParams";

describe("sys_0(0x400) slot arguments", () => {
  it("names every argument from P0 through P50", () => {
    expect(SLOT_PARAMS).toHaveLength(SLOT_PARAM_COUNT);
    expect(SLOT_PARAMS.map((spec) => spec.index)).toEqual(SLOT_PARAMS.map((_, index) => index));
    expect(UNREAD_SLOT_PARAMS).toEqual(new Set([9, 10, 12, 15, 18, 19, 22, 23, 24, 40, 41]));
    expect(SLOT_PARAMS.filter((spec) => spec.unread).map((spec) => spec.index)).toEqual([...UNREAD_SLOT_PARAMS]);
  });

  it("writes a signed coordinate and keeps the other arguments", () => {
    const graph = createGraph();
    const next = applySlotParam(graph, 0, 36, -40);
    expect(next.slots[0].params[36] | 0).toBe(-40);
    expect(next.slots[0].params[2]).toBe(graph.slots[0].params[2]);
    expect(next.slots[0].params).toHaveLength(51);
  });

  it("renames P0 and the deploy action that names the slot", () => {
    const graph = createGraph();
    const withDeploy = insertAction(graph, graph.nodes[1].id, "deploy").graph;
    const deploy = withDeploy.nodes.find((node) => node.data.kind === "deploy");
    if (deploy?.data.kind !== "deploy") throw new Error("missing deploy");
    const next = applySlotParam(withDeploy, deploy.data.slot, 0, 8);
    const moved = next.nodes.find((node) => node.data.kind === "deploy");
    expect(next.slots.some((slot) => slot.params[0] === 8)).toBe(true);
    expect(next.slots.some((slot) => slot.params[0] === deploy.data.slot)).toBe(false);
    expect(moved?.data.kind === "deploy" && moved.data.slot).toBe(8);
    expect(applySlotParam(next, 8, 0, 1)).toBe(next);
  });

  it("shows a character-list name and unit id, and leaves missing parts blank", () => {
    const slot = { params: Array.from({ length: 51 }, () => 0) };
    slot.params[2] = 1001001;
    expect(slotSuit(slot, [{ value: 1001001, label: "ガンダム" }])).toEqual({ name: "ガンダム", unitId: "1001001" });
    expect(slotSuit(slot, [])).toEqual({ name: "", unitId: "1001001" });
    slot.params[2] = 0;
    expect(slotSuit(slot, [{ value: 1001001, label: "ガンダム" }])).toEqual({ name: "", unitId: "" });
  });

  it("adds an enemy slot without copying another unit", () => {
    const graph = createGraph();
    const created = addEnemySlot(graph);
    expect(created).not.toBeNull();
    const added = created!.graph.slots.find((slot) => slot.params[0] === created!.slotId)!;
    expect(added.params[3]).toBe(1);
    expect(added.params[2]).toBe(0);
    expect(added.params[20]).toBe(1);
    expect(added.params[39]).toBe(1);
    expect(added.params).toHaveLength(51);
  });
});
