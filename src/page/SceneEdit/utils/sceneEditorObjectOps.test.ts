import { describe, expect, it } from "vitest";
import type { PlacementRow } from "../types/placement";
import {
  deletePlacementAt,
  duplicatePlacementAt,
  pastePlacementsAfter,
} from "./sceneEditorObjectOps";

function row(id: number, type = "OBJECT"): PlacementRow {
  return {
    vdkType: type,
    objectNumber: id,
    posX: id,
    posY: id + 1,
    posZ: id + 2,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    rawFields: ["VDK_TYPE", type, "VDK_OBJECT", String(id)],
  };
}

describe("scene editor object operations", () => {
  it("duplicates only OBJECT placement rows after the source row", () => {
    const rows = [row(10), row(20)];

    const result = duplicatePlacementAt(rows, 0);

    expect(result.insertedIndex).toBe(1);
    expect(result.entries).toHaveLength(3);
    expect(result.entries[1]).toEqual(rows[0]);
    expect(result.entries[1]).not.toBe(rows[0]);
    expect(rows).toHaveLength(2);
  });

  it("throws when duplicating unsupported placement row types", () => {
    expect(() => duplicatePlacementAt([row(10, "EFFECT")], 0)).toThrow(
      "Only OBJECT placement rows can be duplicated.",
    );
  });

  it("deletes a placement row and preserves the deleted row for undo", () => {
    const rows = [row(10), row(20), row(30)];

    const result = deletePlacementAt(rows, 1);

    expect(result.deleted).toEqual(rows[1]);
    expect(result.entries.map((entry) => entry.objectNumber)).toEqual([10, 30]);
  });

  it("pastes copied rows as new cloned rows after the selected row", () => {
    const rows = [row(10), row(20)];
    const copied = [row(30), row(40)];

    const result = pastePlacementsAfter(rows, copied, 0);

    expect(result.insertedStart).toBe(1);
    expect(result.entries.map((entry) => entry.objectNumber)).toEqual([10, 30, 40, 20]);
    expect(result.entries[1]).not.toBe(copied[0]);
    expect(result.insertedRows).toEqual(copied);
  });
});
