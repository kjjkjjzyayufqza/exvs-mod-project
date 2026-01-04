/**
 * Obfuscated 0x00-terminated byte string codec.
 *
 * This is a direct transcription of the per-byte transform used by the game.
 * Behavior matches:
 * - Transform bytes in-place until (but not including) the first 0x00 terminator
 * - The terminator byte is not modified
 *
 * The transform depends only on the byte index:
 * - index % 7 (rotation amount derived from division-by-7 logic)
 * - index % 2 (bitwise NOT for odd indices)
 * Together: index % 14.
 */

const INVERSE_TABLES: Array<Uint8Array | undefined> = new Array(14);

function bytesToUtf8StringNullTerminated(bytes: Uint8Array): string {
  let end = 0;
  while (end < bytes.length && bytes[end] !== 0) end++;
  const payload = bytes.subarray(0, end);
  return new TextDecoder("utf-8").decode(payload);
}

function utf8StringToNullTerminatedBytes(str: string): Uint8Array {
  const encoded = new TextEncoder().encode(str);
  const out = new Uint8Array(encoded.length + 1);
  out.set(encoded, 0);
  out[out.length - 1] = 0;
  return out;
}

function obfTransformByte(index: number, byte: number): number {
  const i = index >>> 0;
  const b = byte & 0xff;

  // r8d = ((b & 0x55) << 2) | (b & 0xAA)
  let r8d = (((b & 0x55) << 2) | (b & 0xaa)) >>> 0;

  // Compute cl = (i - floor(i/7)*7) in the original; equivalent to i % 7.
  const q = Math.floor(i / 7);
  const cl = (i - q * 7) & 0x1f;

  // r8d = (r8d << 7) >> cl (logical)
  r8d = (r8d << 7) >>> 0;
  r8d = r8d >>> cl;

  // r8d |= (r8d >> 8)
  r8d = (r8d | (r8d >>> 8)) >>> 0;

  // if (i & 1) r8d = ~r8d
  if ((i & 1) !== 0) {
    r8d = (~r8d) >>> 0;
  }

  return r8d & 0xff;
}

function getInverseTableForMod14(mod14: number): Uint8Array {
  const m = mod14 % 14;
  let table = INVERSE_TABLES[m];
  if (table) return table;

  table = new Uint8Array(256);
  const seen = new Uint8Array(256);

  for (let plain = 0; plain < 256; plain++) {
    const enc = obfTransformByte(m, plain);
    if (seen[enc] !== 0) {
      throw new Error(`Non-bijective mapping for mod14=${m} (collision at 0x${enc.toString(16).toUpperCase().padStart(2, "0")})`);
    }
    seen[enc] = 1;
    table[enc] = plain;
  }

  INVERSE_TABLES[m] = table;
  return table;
}

/**
 * In-place decrypt. Stops before the first 0x00 terminator (terminator is not modified).
 */
export function obfDecryptInPlace(buf: Uint8Array): void {
  const n = buf.length;
  let i = 0;
  while (i < n && buf[i] !== 0) {
    buf[i] = obfTransformByte(i, buf[i]);
    i++;
  }
}

/**
 * Decrypt and return a new byte array (input is not modified).
 */
export function obfDecryptBytes(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data);
  obfDecryptInPlace(out);
  return out;
}

/**
 * Decode obfuscated bytes into a UTF-8 string (reads until the first 0x00 terminator).
 */
export function obfDecodeToUtf8String(encoded: Uint8Array): string {
  const decoded = obfDecryptBytes(encoded);
  return bytesToUtf8StringNullTerminated(decoded);
}

/**
 * In-place encrypt. Stops before the first 0x00 terminator (terminator is not modified).
 *
 * This is the inverse of {@link obfDecryptInPlace}.
 */
export function obfEncryptInPlace(buf: Uint8Array): void {
  const n = buf.length;
  let i = 0;
  while (i < n && buf[i] !== 0) {
    const inv = getInverseTableForMod14(i);
    buf[i] = inv[buf[i]];
    i++;
  }
}

/**
 * Encrypt and return a new byte array (input is not modified).
 */
export function obfEncryptBytes(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data);
  obfEncryptInPlace(out);
  return out;
}

/**
 * Encode a UTF-8 string as an obfuscated, 0x00-terminated byte string.
 */
export function obfEncodeFromUtf8String(str: string): Uint8Array {
  const plain = utf8StringToNullTerminatedBytes(str);
  return obfEncryptBytes(plain);
}


