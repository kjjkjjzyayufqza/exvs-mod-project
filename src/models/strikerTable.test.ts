import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";
import {
  STRIKER_TABLE_MAGIC_HEX,
  STRIKER_TABLE_STRIDE,
  StrikerTable,
  StrikerTableRow,
  buildStrikerTableBuffer,
  findDuplicateStrikerHostIds,
  isStrikerTableBuffer,
  sortStrikerTableRows,
  validateStrikerTableRows,
} from "./strikerTable";

function row(hostUnitId: number, slot1: number, slot2: number): StrikerTableRow {
  return { HostUnitId: hostUnitId, Slot1: slot1, Slot2: slot2 } as StrikerTableRow;
}

function buildBytes(rows: Array<[number, number, number]>): Buffer {
  const count = rows.length;
  const expected = 0x20 + count * 4 + count * 8;
  const buffer = Buffer.alloc(expected);
  buffer.write(STRIKER_TABLE_MAGIC_HEX, 0, 4, "hex");
  buffer.writeUInt32LE(expected, 0x08);
  buffer.writeUInt32LE(count, 0x10);
  buffer.writeUInt32LE(STRIKER_TABLE_STRIDE, 0x14);
  for (let i = 0; i < count; i++) {
    const [host, slot1, slot2] = rows[i];
    buffer.writeUInt32LE(host, 0x20 + i * 4);
    const rec = 0x20 + count * 4 + i * 8;
    buffer.writeUInt32LE(slot1, rec);
    buffer.writeUInt32LE(slot2, rec + 4);
  }
  return buffer;
}

describe("strikerTable", () => {
  it("parses host ids and two striker slots", () => {
    const table = new StrikerTable(
      buildBytes([
        [16_001_001, 516_001_001, 0],
        [16_002_001, 516_002_001, 516_003_001],
      ]),
    );
    expect(table.HostCount).toBe(2);
    expect(table.rows).toEqual([
      { HostUnitId: 16_001_001, Slot1: 516_001_001, Slot2: 0 },
      { HostUnitId: 16_002_001, Slot1: 516_002_001, Slot2: 516_003_001 },
    ]);
  });

  it("round-trips bytes including empty slot2", () => {
    const original = buildBytes([[16_001_001, 516_001_001, 0]]);
    const rebuilt = buildStrikerTableBuffer(new StrikerTable(original));
    expect(Buffer.from(rebuilt)).toEqual(original);
  });

  it("rejects character_id_table stride 0x18", () => {
    const buffer = Buffer.alloc(0x20 + 4 + 0x18);
    buffer.write(STRIKER_TABLE_MAGIC_HEX, 0, 4, "hex");
    buffer.writeUInt32LE(buffer.byteLength, 0x08);
    buffer.writeUInt32LE(1, 0x10);
    buffer.writeUInt32LE(0x18, 0x14);
    expect(() => new StrikerTable(buffer)).toThrow(/stride is 24/);
    expect(isStrikerTableBuffer(buffer)).toBe(false);
  });

  it("sorts host ids unsigned and reports duplicates", () => {
    const rows = [row(30, 1, 0), row(10, 2, 0), row(10, 3, 0)];
    expect(sortStrikerTableRows(rows).map((r) => r.HostUnitId)).toEqual([10, 10, 30]);
    expect(findDuplicateStrikerHostIds(rows)).toEqual([10]);
    expect(validateStrikerTableRows(sortStrikerTableRows([row(10, 1, 0), row(20, 0, 0)]))).toBeNull();
  });
});
