import { Buffer } from "buffer";
import { CommandsData } from "./commandsData";
import { ErrorMessage } from "./error";

const EXPECTED_MAGIC_HEX = "A9B8ABCD";
const HEADER_SIZE = 0x20;
const EFFECT_PROJECT_ENTRY_BYTES = 0x90;

/** int32 at offset: raw LE value plus BE interpretation for ambiguous-endian tools. */
export type EndianAwareInt32Field = {
  offset: number;
  valueLe: number;
  valueBe: number;
};

export function readEndianAwareInt32(buffer: Buffer, offset: number): EndianAwareInt32Field {
  return {
    offset,
    valueLe: buffer.readInt32LE(offset),
    valueBe: buffer.readInt32BE(offset),
  };
}

/**
 * Effect project binary (EXVS-style table).
 * Header: 0x0 magic, 0x8 file size, 0x10 effect_project count, 0x14 command count, 0x18 row size.
 * From 0x20: command id table, command payload table, effect_project id table, then fixed-size rows.
 */
export class CharacterEffectProject {
  bufferData: Buffer;
  Magic: string;
  FileSize: number;
  EffectProjectCount: number;
  CommandsCount: number;
  EachEffectProjectSize: number;
  CommandsData: CommandsData;
  EffectProjectData: EffectProjectEntry[];

  constructor(buffer: Buffer) {
    this.bufferData = buffer;
    this.Magic = this.readFileMagic();
    this.FileSize = buffer.readInt32LE(0x8);
    this.EffectProjectCount = buffer.readInt32LE(0x10);
    this.CommandsCount = buffer.readInt32LE(0x14);
    this.EachEffectProjectSize = buffer.readInt32LE(0x18);

    if (this.EachEffectProjectSize !== EFFECT_PROJECT_ENTRY_BYTES) {
      throw new Error(
        `CharacterEffectProject EachEffectProjectSize must be ${EFFECT_PROJECT_ENTRY_BYTES} (0x90), got ${this.EachEffectProjectSize}`,
      );
    }

    if (buffer.byteLength !== this.FileSize) {
      throw new Error(
        `CharacterEffectProject file size mismatch: buffer length ${buffer.byteLength} vs header 0x8=${this.FileSize}`,
      );
    }

    const commandsStartOffset = HEADER_SIZE;
    const commandsTotal = this.CommandsCount * 0x4 + this.CommandsCount * 0xc;
    const commandsEndOffset = commandsStartOffset + commandsTotal;
    const commandsBuffer = buffer.slice(commandsStartOffset, commandsEndOffset);
    this.CommandsData = new CommandsData(commandsBuffer, this.CommandsCount);

    const idsStartOffset = commandsEndOffset;
    const idRegionBytes = this.EffectProjectCount * 0x4;
    const dataStartOffset = idsStartOffset + idRegionBytes;
    const expectedLen = dataStartOffset + this.EffectProjectCount * this.EachEffectProjectSize;
    if (expectedLen !== buffer.byteLength) {
      throw new Error(
        `CharacterEffectProject layout size mismatch: expected ${expectedLen} bytes, got ${buffer.byteLength}`,
      );
    }

    this.EffectProjectData = [];
    for (let i = 0; i < this.EffectProjectCount; i++) {
      const projectId = buffer.readInt32LE(idsStartOffset + i * 0x4);
      const entryOffset = dataStartOffset + i * this.EachEffectProjectSize;
      this.EffectProjectData.push(new EffectProjectEntry(buffer, entryOffset, projectId));
    }
  }

  readFileMagic(): string {
    const magic = this.bufferData.slice(0, 0x4).toString("hex");
    if (magic.toUpperCase() !== EXPECTED_MAGIC_HEX) {
      throw new Error(ErrorMessage.magicIncorrect);
    }
    return magic;
  }
}

/**
 * One effect_project row (0x90 bytes). Int32/float offsets are file-relative to row start unless noted.
 * Unknown gaps use unkN in sequential order with offset comments in code.
 */
export class EffectProjectEntry {
  EffectProjectId: number;
  /** 0x0 */
  unk0: number;
  /** 0x4 */
  unk1: number;
  /** 0x8: aleo_1 (int32 LE on disk; valueBe is int32 read as BE of the same 4 bytes). */
  aleo1: EndianAwareInt32Field;
  /** 0xc: keep_active — show aleo once action starts */
  keepActive: number;
  /** 0x10: aleo_2 Z distance (float) */
  aleo2ZDistance: number;
  /** 0x14 */
  unk2: number;
  /** 0x18 */
  unk3: number;
  /** 0x1c */
  unk4: number;
  /** 0x20 */
  unk5: number;
  /** 0x24 */
  unk6: number;
  /** 0x28 */
  unk7: number;
  /** 0x2c: aleo_2 size (float) */
  aleo2Size: number;
  /** 0x30: aleo_2 (int32 LE on disk; valueBe is int32 read as BE of the same 4 bytes). */
  aleo2: EndianAwareInt32Field;
  /** 0x34 */
  unk9: number;
  /** 0x38 */
  unk10: number;
  /** 0x3c */
  unk11: number;
  /** 0x40 */
  unk12: number;
  /** 0x44 */
  unk13: number;
  /** 0x48 */
  unk14: number;
  /** 0x4c: setp / action / upward flight aleo (int32) */
  setpAndActionAelo: number;
  /** 0x50 */
  unk15: number;
  /** 0x54 */
  unk16: number;
  /** 0x58 */
  unk17: number;
  /** 0x5c */
  unk18: number;
  /** 0x60 */
  unk19: number;
  /** 0x64 */
  unk20: number;
  /** 0x68 */
  unk21: number;
  /** 0x6c */
  unk22: number;
  /** 0x70: bone_index (int32; display LE/BE if ambiguous) */
  boneIndex: EndianAwareInt32Field;
  /** 0x74 */
  unk23: number;
  /** 0x78 */
  unk24: number;
  /** 0x7c */
  unk25: number;
  /** 0x80: aleo_1 size (float) */
  aleo1Size: number;
  /** 0x84: model_id (int32; display LE/BE if ambiguous) */
  modelId: EndianAwareInt32Field;
  /** 0x88 */
  unk26: number;
  /** 0x8c */
  unk27: number;

  constructor(buffer: Buffer, rowStart: number, effectProjectId: number) {
    const o = rowStart;
    this.EffectProjectId = effectProjectId;
    this.unk0 = buffer.readInt32LE(o + 0x0);
    this.unk1 = buffer.readInt32LE(o + 0x4);
    this.aleo1 = readEndianAwareInt32(buffer, o + 0x8);
    this.keepActive = buffer.readInt32LE(o + 0xc);
    this.aleo2ZDistance = buffer.readFloatLE(o + 0x10);
    this.unk2 = buffer.readInt32LE(o + 0x14);
    this.unk3 = buffer.readInt32LE(o + 0x18);
    this.unk4 = buffer.readInt32LE(o + 0x1c);
    this.unk5 = buffer.readInt32LE(o + 0x20);
    this.unk6 = buffer.readInt32LE(o + 0x24);
    this.unk7 = buffer.readInt32LE(o + 0x28);
    this.aleo2Size = buffer.readFloatLE(o + 0x2c);
    this.aleo2 = readEndianAwareInt32(buffer, o + 0x30);
    this.unk9 = buffer.readInt32LE(o + 0x34);
    this.unk10 = buffer.readInt32LE(o + 0x38);
    this.unk11 = buffer.readInt32LE(o + 0x3c);
    this.unk12 = buffer.readInt32LE(o + 0x40);
    this.unk13 = buffer.readInt32LE(o + 0x44);
    this.unk14 = buffer.readInt32LE(o + 0x48);
    this.setpAndActionAelo = buffer.readInt32LE(o + 0x4c);
    this.unk15 = buffer.readInt32LE(o + 0x50);
    this.unk16 = buffer.readInt32LE(o + 0x54);
    this.unk17 = buffer.readInt32LE(o + 0x58);
    this.unk18 = buffer.readInt32LE(o + 0x5c);
    this.unk19 = buffer.readInt32LE(o + 0x60);
    this.unk20 = buffer.readInt32LE(o + 0x64);
    this.unk21 = buffer.readInt32LE(o + 0x68);
    this.unk22 = buffer.readInt32LE(o + 0x6c);
    this.boneIndex = readEndianAwareInt32(buffer, o + 0x70);
    this.unk23 = buffer.readInt32LE(o + 0x74);
    this.unk24 = buffer.readInt32LE(o + 0x78);
    this.unk25 = buffer.readInt32LE(o + 0x7c);
    this.aleo1Size = buffer.readFloatLE(o + 0x80);
    this.modelId = readEndianAwareInt32(buffer, o + 0x84);
    this.unk26 = buffer.readInt32LE(o + 0x88);
    this.unk27 = buffer.readInt32LE(o + 0x8c);
  }
}

export type EffectProjectEntrySnapshot = {
  EffectProjectId: number;
  unk0: number;
  unk1: number;
  aleo1Le: number;
  aleo1Be: number;
  keepActive: number;
  aleo2ZDistance: number;
  unk2: number;
  unk3: number;
  unk4: number;
  unk5: number;
  unk6: number;
  unk7: number;
  aleo2Size: number;
  aleo2Le: number;
  aleo2Be: number;
  unk9: number;
  unk10: number;
  unk11: number;
  unk12: number;
  unk13: number;
  unk14: number;
  setpAndActionAelo: number;
  unk15: number;
  unk16: number;
  unk17: number;
  unk18: number;
  unk19: number;
  unk20: number;
  unk21: number;
  unk22: number;
  boneIndexLe: number;
  boneIndexBe: number;
  unk23: number;
  unk24: number;
  unk25: number;
  aleo1Size: number;
  modelIdLe: number;
  modelIdBe: number;
  unk26: number;
  unk27: number;
};

/** Default row for a new effect_project entry (all zero payload; endian view fields match LE zero). */
export function createDefaultEffectProjectEntrySnapshot(effectProjectId: number): EffectProjectEntrySnapshot {
  return {
    EffectProjectId: effectProjectId,
    unk0: 0,
    unk1: 0,
    aleo1Le: 0,
    aleo1Be: 0,
    keepActive: 0,
    aleo2ZDistance: 0,
    unk2: 0,
    unk3: 0,
    unk4: 0,
    unk5: 0,
    unk6: 0,
    unk7: 0,
    aleo2Size: 0,
    aleo2Le: 0,
    aleo2Be: 0,
    unk9: 0,
    unk10: 0,
    unk11: 0,
    unk12: 0,
    unk13: 0,
    unk14: 0,
    setpAndActionAelo: 0,
    unk15: 0,
    unk16: 0,
    unk17: 0,
    unk18: 0,
    unk19: 0,
    unk20: 0,
    unk21: 0,
    unk22: 0,
    boneIndexLe: 0,
    boneIndexBe: 0,
    unk23: 0,
    unk24: 0,
    unk25: 0,
    aleo1Size: 0,
    modelIdLe: 0,
    modelIdBe: 0,
    unk26: 0,
    unk27: 0,
  };
}

export function effectProjectEntryToSnapshot(e: EffectProjectEntry): EffectProjectEntrySnapshot {
  return {
    EffectProjectId: e.EffectProjectId,
    unk0: e.unk0,
    unk1: e.unk1,
    aleo1Le: e.aleo1.valueLe,
    aleo1Be: e.aleo1.valueBe,
    keepActive: e.keepActive,
    aleo2ZDistance: e.aleo2ZDistance,
    unk2: e.unk2,
    unk3: e.unk3,
    unk4: e.unk4,
    unk5: e.unk5,
    unk6: e.unk6,
    unk7: e.unk7,
    aleo2Size: e.aleo2Size,
    aleo2Le: e.aleo2.valueLe,
    aleo2Be: e.aleo2.valueBe,
    unk9: e.unk9,
    unk10: e.unk10,
    unk11: e.unk11,
    unk12: e.unk12,
    unk13: e.unk13,
    unk14: e.unk14,
    setpAndActionAelo: e.setpAndActionAelo,
    unk15: e.unk15,
    unk16: e.unk16,
    unk17: e.unk17,
    unk18: e.unk18,
    unk19: e.unk19,
    unk20: e.unk20,
    unk21: e.unk21,
    unk22: e.unk22,
    boneIndexLe: e.boneIndex.valueLe,
    boneIndexBe: e.boneIndex.valueBe,
    unk23: e.unk23,
    unk24: e.unk24,
    unk25: e.unk25,
    aleo1Size: e.aleo1Size,
    modelIdLe: e.modelId.valueLe,
    modelIdBe: e.modelId.valueBe,
    unk26: e.unk26,
    unk27: e.unk27,
  };
}

function writeEffectProjectSnapshotToBuffer(target: Buffer, base: number, s: EffectProjectEntrySnapshot): void {
  const o = base;
  target.writeInt32LE(s.unk0, o + 0x0);
  target.writeInt32LE(s.unk1, o + 0x4);
  target.writeInt32LE(s.aleo1Le, o + 0x8);
  target.writeInt32LE(s.keepActive, o + 0xc);
  target.writeFloatLE(s.aleo2ZDistance, o + 0x10);
  target.writeInt32LE(s.unk2, o + 0x14);
  target.writeInt32LE(s.unk3, o + 0x18);
  target.writeInt32LE(s.unk4, o + 0x1c);
  target.writeInt32LE(s.unk5, o + 0x20);
  target.writeInt32LE(s.unk6, o + 0x24);
  target.writeInt32LE(s.unk7, o + 0x28);
  target.writeFloatLE(s.aleo2Size, o + 0x2c);
  target.writeInt32LE(s.aleo2Le, o + 0x30);
  target.writeInt32LE(s.unk9, o + 0x34);
  target.writeInt32LE(s.unk10, o + 0x38);
  target.writeInt32LE(s.unk11, o + 0x3c);
  target.writeInt32LE(s.unk12, o + 0x40);
  target.writeInt32LE(s.unk13, o + 0x44);
  target.writeInt32LE(s.unk14, o + 0x48);
  target.writeInt32LE(s.setpAndActionAelo, o + 0x4c);
  target.writeInt32LE(s.unk15, o + 0x50);
  target.writeInt32LE(s.unk16, o + 0x54);
  target.writeInt32LE(s.unk17, o + 0x58);
  target.writeInt32LE(s.unk18, o + 0x5c);
  target.writeInt32LE(s.unk19, o + 0x60);
  target.writeInt32LE(s.unk20, o + 0x64);
  target.writeInt32LE(s.unk21, o + 0x68);
  target.writeInt32LE(s.unk22, o + 0x6c);
  target.writeInt32LE(s.boneIndexLe, o + 0x70);
  target.writeInt32LE(s.unk23, o + 0x74);
  target.writeInt32LE(s.unk24, o + 0x78);
  target.writeInt32LE(s.unk25, o + 0x7c);
  target.writeFloatLE(s.aleo1Size, o + 0x80);
  target.writeInt32LE(s.modelIdLe, o + 0x84);
  target.writeInt32LE(s.unk26, o + 0x88);
  target.writeInt32LE(s.unk27, o + 0x8c);
}

export function buildCharacterEffectProjectBuffer(table: {
  Magic: string;
  CommandsData: CommandsData;
  EffectProjectCount: number;
  CommandsCount: number;
  EffectProjectData: EffectProjectEntrySnapshot[];
}): Buffer {
  const rowBytes = EFFECT_PROJECT_ENTRY_BYTES;
  const n = table.EffectProjectData.length;
  if (n !== table.EffectProjectCount) {
    throw new Error("EffectProjectCount does not match EffectProjectData length");
  }
  if (table.CommandsData.CommandsId.length !== table.CommandsCount) {
    throw new Error("CommandsCount does not match commands data");
  }

  const headerBuffer = Buffer.alloc(HEADER_SIZE);
  headerBuffer.write(table.Magic, 0x0, 0, "hex");
  headerBuffer.writeInt32LE(0, 0x4);
  headerBuffer.writeInt32LE(0, 0x8);
  headerBuffer.writeInt32LE(0, 0xc);
  headerBuffer.writeInt32LE(table.EffectProjectCount, 0x10);
  headerBuffer.writeInt32LE(table.CommandsCount, 0x14);
  headerBuffer.writeInt32LE(rowBytes, 0x18);
  headerBuffer.writeInt32LE(0, 0x1c);

  const commandsCount = table.CommandsCount;
  const commandsBuffer = Buffer.alloc(commandsCount * 0x4 + commandsCount * 0xc);
  for (let i = 0; i < commandsCount; i++) {
    commandsBuffer.writeInt32LE(table.CommandsData.CommandsId[i]!.readInt32LE(0), i * 0x4);
  }
  const commandsDataOffset = commandsCount * 0x4;
  for (let i = 0; i < commandsCount; i++) {
    table.CommandsData.CommandsData[i]!.copy(commandsBuffer, commandsDataOffset + i * 0xc);
  }

  const idBuffer = Buffer.alloc(n * 0x4);
  const dataBuffer = Buffer.alloc(n * rowBytes);
  for (let i = 0; i < n; i++) {
    const row = table.EffectProjectData[i]!;
    idBuffer.writeInt32LE(row.EffectProjectId, i * 0x4);
    writeEffectProjectSnapshotToBuffer(dataBuffer, i * rowBytes, row);
  }

  const outBuffer = Buffer.concat([headerBuffer, commandsBuffer, idBuffer, dataBuffer]);
  outBuffer.writeInt32LE(outBuffer.byteLength, 0x8);
  return outBuffer;
}
