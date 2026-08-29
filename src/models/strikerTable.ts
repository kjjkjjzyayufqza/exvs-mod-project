import { Buffer } from "buffer";
import { ErrorMessage } from "./error";

export const STRIKER_TABLE_MAGIC_HEX = "A9B8ABCE";
export const STRIKER_TABLE_HEADER_SIZE = 0x20;
export const STRIKER_TABLE_STRIDE = 8;

export class StrikerTable {
  bufferData: Buffer;
  Magic: string;
  FileSize: number;
  HostCount: number;
  DataEachSize: number;
  rows: StrikerTableRow[];

  constructor(buffer: Buffer) {
    this.bufferData = buffer;
    this.Magic = this.readFileMagic();
    this.FileSize = buffer.readUInt32LE(0x08);
    this.HostCount = buffer.readUInt32LE(0x10);
    this.DataEachSize = buffer.readUInt32LE(0x14);

    if (this.DataEachSize !== STRIKER_TABLE_STRIDE) {
      throw new Error(
        `StrikerTable stride is ${this.DataEachSize}, expected ${STRIKER_TABLE_STRIDE}`,
      );
    }

    const expectedSize =
      STRIKER_TABLE_HEADER_SIZE + this.HostCount * 4 + this.HostCount * STRIKER_TABLE_STRIDE;
    if (buffer.byteLength !== expectedSize) {
      throw new Error(
        `StrikerTable size is ${buffer.byteLength}, expected ${expectedSize} for count ${this.HostCount}`,
      );
    }
    if (this.FileSize !== expectedSize) {
      throw new Error(
        `StrikerTable header file size is ${this.FileSize}, expected ${expectedSize}`,
      );
    }

    this.rows = [];
    const idsStartOffset = STRIKER_TABLE_HEADER_SIZE;
    const dataStartOffset = idsStartOffset + this.HostCount * 4;
    for (let i = 0; i < this.HostCount; i++) {
      const hostUnitId = this.bufferData.readUInt32LE(idsStartOffset + i * 4);
      const entryOffset = dataStartOffset + i * STRIKER_TABLE_STRIDE;
      this.rows.push(new StrikerTableRow(this.bufferData, entryOffset, hostUnitId));
    }
  }

  readFileMagic(): string {
    const magic = this.bufferData.slice(0, 0x4).toString("hex");
    if (magic.toUpperCase() !== STRIKER_TABLE_MAGIC_HEX) {
      throw new Error(ErrorMessage.magicIncorrect);
    }
    return magic;
  }
}

export class StrikerTableRow {
  HostUnitId: number;
  Slot1: number;
  Slot2: number;

  constructor(buffer: Buffer, offset: number, hostUnitId: number) {
    this.HostUnitId = hostUnitId;
    this.Slot1 = buffer.readUInt32LE(offset + 0x0);
    this.Slot2 = buffer.readUInt32LE(offset + 0x4);
  }
}

export function unsignedId(value: number): number {
  return value >>> 0;
}

export function compareUnsignedIds(a: number, b: number): number {
  const left = unsignedId(a);
  const right = unsignedId(b);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function sortStrikerTableRows(rows: StrikerTableRow[]): StrikerTableRow[] {
  return [...rows].sort((a, b) => compareUnsignedIds(a.HostUnitId, b.HostUnitId));
}

export function findDuplicateStrikerHostIds(rows: StrikerTableRow[]): number[] {
  const counts = new Map<number, number>();
  for (const row of rows) {
    const id = unsignedId(row.HostUnitId);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort(compareUnsignedIds);
}

export function validateStrikerTableRows(rows: StrikerTableRow[]): string | null {
  const duplicates = findDuplicateStrikerHostIds(rows);
  if (duplicates.length > 0) {
    return `Duplicate host unit id(s): ${duplicates.join(", ")}`;
  }
  for (let i = 1; i < rows.length; i++) {
    if (compareUnsignedIds(rows[i - 1].HostUnitId, rows[i].HostUnitId) >= 0) {
      return "Host unit ids must be strictly ascending";
    }
  }
  return null;
}

export function cloneStrikerTable(table: StrikerTable, rows?: StrikerTableRow[]): StrikerTable {
  const nextRows = rows ?? table.rows.map((row) => ({ ...row }) as StrikerTableRow);
  return Object.assign(Object.create(Object.getPrototypeOf(table)), table, {
    rows: nextRows,
    HostCount: nextRows.length,
  }) as StrikerTable;
}

export function buildStrikerTableBuffer(table: StrikerTable): Buffer {
  const rows = table.rows;
  const headerBuffer = Buffer.alloc(STRIKER_TABLE_HEADER_SIZE);
  headerBuffer.write(table.Magic, 0x0, 0, "hex");
  headerBuffer.writeUInt32LE(0, 0x04);
  headerBuffer.writeUInt32LE(0, 0x08);
  headerBuffer.writeUInt32LE(0, 0x0c);
  headerBuffer.writeUInt32LE(rows.length, 0x10);
  headerBuffer.writeUInt32LE(STRIKER_TABLE_STRIDE, 0x14);
  headerBuffer.writeUInt32LE(0, 0x18);
  headerBuffer.writeUInt32LE(0, 0x1c);

  const idBuffer = Buffer.alloc(rows.length * 4);
  const dataBuffer = Buffer.alloc(rows.length * STRIKER_TABLE_STRIDE);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    idBuffer.writeUInt32LE(unsignedId(row.HostUnitId), i * 4);
    const base = i * STRIKER_TABLE_STRIDE;
    dataBuffer.writeUInt32LE(unsignedId(row.Slot1), base + 0x0);
    dataBuffer.writeUInt32LE(unsignedId(row.Slot2), base + 0x4);
  }

  const outBuffer = Buffer.concat([headerBuffer, idBuffer, dataBuffer]);
  outBuffer.writeUInt32LE(outBuffer.byteLength, 0x08);
  return outBuffer;
}

export function isStrikerTableBuffer(buffer: Buffer): boolean {
  if (buffer.byteLength < STRIKER_TABLE_HEADER_SIZE) return false;
  if (buffer.slice(0, 4).toString("hex").toUpperCase() !== STRIKER_TABLE_MAGIC_HEX) return false;
  if (buffer.readUInt32LE(0x14) !== STRIKER_TABLE_STRIDE) return false;
  const count = buffer.readUInt32LE(0x10);
  const expected = STRIKER_TABLE_HEADER_SIZE + count * 4 + count * STRIKER_TABLE_STRIDE;
  return buffer.byteLength === expected && buffer.readUInt32LE(0x08) === expected;
}
