export interface Crc32Result {
  hashU32: number;
  hashInt32: number;
  hashHex: string;
}

/** IEEE CRC32 over UTF-8 bytes (polynomial 0xEDB88320, reflected). */
export function crc32IeeeUint32(input: string): number {
  const bytes = new TextEncoder().encode(input);
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      if ((crc & 1) !== 0) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc >>>= 1;
      }
    }
  }
  return (~crc) >>> 0;
}

export function crc32Ieee(input: string): Crc32Result {
  const hashU32 = crc32IeeeUint32(input);
  const hashInt32 = hashU32 | 0;
  const hashHex = `0x${hashU32.toString(16).toUpperCase().padStart(8, "0")}`;
  return { hashU32, hashInt32, hashHex };
}
