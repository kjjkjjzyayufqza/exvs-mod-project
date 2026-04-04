import { Buffer } from "buffer";

export function readU64LE(buf: Buffer, offset: number): bigint {
  if (offset < 0 || offset + 8 > buf.length) {
    throw new Error(`readU64LE out of range at 0x${offset.toString(16)}`);
  }
  let result = 0n;
  for (let i = 0; i < 8; i++) {
    result |= BigInt(buf[offset + i]!) << (8n * BigInt(i));
  }
  return result;
}

/**
 * Read a null-terminated UTF-8 string from a buffer (same pattern as SSBH CString fields).
 */
export function readCStringUtf8(buf: Buffer, offset: number, maxLength: number): string {
  if (offset < 0 || offset >= buf.length) return "";
  const endLimit = Math.min(buf.length, offset + Math.max(0, maxLength));
  let end = offset;
  while (end < endLimit && buf[end] !== 0x00) end++;
  return buf.toString("utf8", offset, end);
}

/**
 * RelPtr64: u64 offset relative to the pointer field position (SSBH convention).
 */
export function readRelPtr64AsOffset(buf: Buffer, pointerFieldOffset: number): number | null {
  const relativeOffset = readU64LE(buf, pointerFieldOffset);
  if (relativeOffset === 0n) return null;
  const absolute = BigInt(pointerFieldOffset) + relativeOffset;
  if (absolute < 0n || absolute >= BigInt(buf.length)) {
    throw new Error(`RelPtr64 target out of range: 0x${absolute.toString(16)}`);
  }
  return Number(absolute);
}
