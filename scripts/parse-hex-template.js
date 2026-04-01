/**
 * Parse hex template string, read fields at fixed offsets, print values.
 * Floats: little-endian IEEE754 (typical for game binary blobs).
 * bone_index at 0xf8: uint32 as big-endian hex (byte order reversed vs LE read).
 * Run: node scripts/parse-jnttbl-template.js
 */

const TEMPLATE_HEX = `
00 00 00 00 00 00 00 00 01 00 00 00 F6 7F 84 0C 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 8A 02 00 00 00 00 00 00 00 00 00 00 00 00 A0 42 00 00 C8 41 00 00 00 00 17 E6 F0 7F 00 00 00 00 00 00 00 00 00 00 96 42 00 00 00 00 00 00 00 C1 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 01 00 00 00 00 00 00 00 00 00 00 00 64 2A 8B 73 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 42 F6 5D 0F FC 00 00 34 42 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 92 5A 9A FF 00 00 00 00 00 00 00 41 00 00 00 00 EF 01 60 92 00 00 00 C0 00 00 00 00 00 00 00 00 13 07 EC F8 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
`;

const OFFSETS = {
  left_right: { offset: 0x44, kind: "float32" },
  wait_time: { offset: 0x48, kind: "float32" },
  up_down: { offset: 0x64, kind: "float32" },
  bone_index: { offset: 0xf8, kind: "hex_u32" },
  shot_direction: { offset: 0x10c, kind: "float32" },
};

function hexStringToUint8Array(hexStr) {
  const cleaned = hexStr.replace(/\s+/g, "");
  if (cleaned.length % 2 !== 0) {
    throw new Error(`Invalid hex string length (must be even): ${cleaned.length}`);
  }
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error(`Invalid hex at pair index ${i}`);
    }
    out[i] = byte;
  }
  return out;
}

function bytesToHexUpper(bytes) {
  return Array.from(bytes, (b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

function readFloat32LE(view, offset) {
  if (offset + 4 > view.byteLength) {
    throw new Error(`Float32 read out of range at 0x${offset.toString(16)}`);
  }
  return view.getFloat32(offset, true);
}

function readHexStringU32BE(view, offset) {
  if (offset + 4 > view.byteLength) {
    throw new Error(`U32 read out of range at 0x${offset.toString(16)}`);
  }
  const v = view.getUint32(offset, false);
  return `0x${v.toString(16).toUpperCase().padStart(8, "0")}`;
}

function main() {
  const templateString = TEMPLATE_HEX;
  const bytes = hexStringToUint8Array(templateString);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const view = new DataView(buffer);

  console.log("Template byte length:", bytes.length);
  console.log("First 16 bytes (hex):", bytesToHexUpper(bytes.subarray(0, 16)));
  console.log("");

  const results = {
    left_right: readFloat32LE(view, OFFSETS.left_right.offset),
    wait_time: readFloat32LE(view, OFFSETS.wait_time.offset),
    up_down: readFloat32LE(view, OFFSETS.up_down.offset),
    bone_index: readHexStringU32BE(view, OFFSETS.bone_index.offset),
    shot_direction: readFloat32LE(view, OFFSETS.shot_direction.offset),
  };

  console.log("Read values (little-endian):");
  console.log(`  0x44 left_right      (float32): ${results.left_right}`);
  console.log(`  0x48 wait_time      (float32): ${results.wait_time}`);
  console.log(`  0x64 up_down        (float32): ${results.up_down}`);
  console.log(`  0xf8 bone_index     (u32 hex BE): ${results.bone_index}`);
  console.log(`  0x10c shot_direction (float32): ${results.shot_direction}`);
}

main();
