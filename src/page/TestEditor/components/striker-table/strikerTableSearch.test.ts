import { describe, expect, it } from "vitest";
import type { StrikerTableRow } from "@/models/strikerTable";
import { filterStrikerTableRows } from "./strikerTableSearch";

function row(hostUnitId: number, slot1: number, slot2: number): StrikerTableRow {
  return { HostUnitId: hostUnitId, Slot1: slot1, Slot2: slot2 } as StrikerTableRow;
}

describe("strikerTableSearch", () => {
  it("matches host or slot decimal and hex", () => {
    const rows = [row(16_001_001, 516_001_001, 0), row(24_001_001, 0, 501_701_001)];
    expect(filterStrikerTableRows(rows, "16001001").map((item) => item.idx)).toEqual([0]);
    expect(filterStrikerTableRows(rows, "501701001").map((item) => item.idx)).toEqual([1]);
    expect(
      filterStrikerTableRows(rows, `0x${(516_001_001).toString(16)}`).map((item) => item.idx),
    ).toEqual([0]);
  });
});
