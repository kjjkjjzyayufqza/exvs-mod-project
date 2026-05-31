import { Buffer } from "buffer";

/** Unsigned 32-bit hex (matches hash-style ids in tooling). */
export function formatHexU32(n: number): string {
  return `0x${(n >>> 0).toString(16).padStart(8, "0")}`;
}

/** Eight hex chars, uppercase, no 0x — int32 stored as LE bytes in order b0..b3. */
export function formatInt32BytesHexLeUpper(n: number): string {
  const b = Buffer.alloc(4);
  b.writeInt32LE(n, 0);
  return b.toString("hex").toUpperCase();
}

/** Eight hex chars, uppercase, no 0x — same four bytes as LE storage, reversed for BE byte order display. */
export function formatInt32BytesHexBeUpper(n: number): string {
  const b = Buffer.alloc(4);
  b.writeInt32LE(n, 0);
  return Buffer.from(b).reverse().toString("hex").toUpperCase();
}

/** Effect project id line: `decimal (LEHEX / BEHEX)`. */
export function formatEffectProjectIdLeBeLine(id: number): string {
  return `${id} (${formatInt32BytesHexLeUpper(id)} / ${formatInt32BytesHexBeUpper(id)})`;
}
