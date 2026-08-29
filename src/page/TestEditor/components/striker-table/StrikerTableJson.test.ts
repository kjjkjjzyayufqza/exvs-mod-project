import { describe, expect, it } from "vitest";
import { Buffer } from "buffer";
import { STRIKER_TABLE_MAGIC_HEX, StrikerTable, buildStrikerTableBuffer } from "@/models/strikerTable";
import { applyStrikerTableImport, buildStrikerTableJsonPayload } from "./StrikerTableJson";

function emptyTable(): StrikerTable {
  const buffer = Buffer.alloc(0x20);
  buffer.write(STRIKER_TABLE_MAGIC_HEX, 0, 4, "hex");
  buffer.writeUInt32LE(0x20, 0x08);
  buffer.writeUInt32LE(0, 0x10);
  buffer.writeUInt32LE(8, 0x14);
  return new StrikerTable(buffer);
}

describe("StrikerTableJson", () => {
  it("exports and re-applies host/slot rows", () => {
    const table = applyStrikerTableImport(emptyTable(), [
      { hostUnitId: 16_001_001, slot1: 516_001_001, slot2: 0 },
    ]);
    expect(buildStrikerTableJsonPayload(table)).toEqual([
      { hostUnitId: 16_001_001, slot1: 516_001_001, slot2: 0 },
    ]);
    const rebuilt = new StrikerTable(buildStrikerTableBuffer(table));
    expect(rebuilt.rows[0]).toMatchObject({ HostUnitId: 16_001_001, Slot2: 0 });
  });
});
