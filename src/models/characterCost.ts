import { Buffer } from "buffer";
import { CommandsData } from "./commandsData";
import { ErrorMessage } from "./error";

const EXPECTED_MAGIC_HEX = "A9B8ABCD";
const HEADER_SIZE = 0x20;
const ENTRY_BYTES = 8;

export class CharacterCost {
  bufferData: Buffer;
  Magic: string;
  FileSzie: number;
  CharacterCount: number;
  CommandsCount: number;
  CharacterCostEachSize: number;
  CommandsData: CommandsData;
  CharacterData: CharacterCostData[];

  constructor(buffer: Buffer) {
    this.bufferData = buffer;
    this.Magic = this.readFileMagic();
    this.FileSzie = buffer.readInt32LE(0x8);
    this.CharacterCount = buffer.readInt32LE(0x10);
    this.CommandsCount = buffer.readInt32LE(0x14);
    this.CharacterCostEachSize = buffer.readInt32LE(0x18);

    if (this.CharacterCostEachSize !== ENTRY_BYTES) {
      throw new Error(
        `CharacterCost CharacterCostEachSize must be ${ENTRY_BYTES} (0x8), got ${this.CharacterCostEachSize}`
      );
    }

    const commandsStartOffset = HEADER_SIZE;
    const commandsEndOffset =
      HEADER_SIZE + (this.CommandsCount * 0x4 + this.CommandsCount * 0xc);
    const commandsBuffer = buffer.slice(commandsStartOffset, commandsEndOffset);
    this.CommandsData = new CommandsData(commandsBuffer, this.CommandsCount);

    this.CharacterData = [];
    const idsStartOffset = HEADER_SIZE + commandsBuffer.byteLength;
    const idPadding = this.CharacterCount * 0x4;
    const dataStartOffset = idsStartOffset + idPadding;

    for (let i = 0; i < this.CharacterCount; i++) {
      const characterId = this.bufferData.readInt32LE(idsStartOffset + i * 0x4);
      const entryOffset = dataStartOffset + i * this.CharacterCostEachSize;
      this.CharacterData.push(new CharacterCostData(this.bufferData, entryOffset, characterId));
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

export class CharacterCostData {
  CharacterId: number;
  Cost: number;
  Hp: number;

  constructor(buffer: Buffer, offset: number, characterId: number) {
    this.CharacterId = characterId;
    this.Cost = buffer.readInt32LE(offset + 0x0);
    this.Hp = buffer.readInt32LE(offset + 0x4);
  }
}

export function buildCharacterCostBuffer(table: CharacterCost): Buffer {
  const headerBuffer = Buffer.alloc(HEADER_SIZE);
  headerBuffer.write(table.Magic, 0x0, 0, "hex");
  headerBuffer.writeInt32LE(0, 0x4);
  headerBuffer.writeInt32LE(0, 0x8);
  headerBuffer.writeInt32LE(0, 0xc);
  headerBuffer.writeInt32LE(table.CharacterData.length, 0x10);
  headerBuffer.writeInt32LE(table.CommandsCount, 0x14);
  headerBuffer.writeInt32LE(ENTRY_BYTES, 0x18);
  headerBuffer.writeInt32LE(0, 0x1c);

  const commandsCount = table.CommandsCount;
  const commandsBuffer = Buffer.alloc(commandsCount * 0x4 + commandsCount * 0xc);
  for (let i = 0; i < commandsCount; i++) {
    commandsBuffer.writeInt32LE(table.CommandsData.CommandsId[i].readInt32LE(0), i * 0x4);
  }
  const commandsDataOffset = commandsCount * 0x4;
  for (let i = 0; i < commandsCount; i++) {
    table.CommandsData.CommandsData[i].copy(commandsBuffer, commandsDataOffset + i * 0xc);
  }

  const n = table.CharacterData.length;
  const idBuffer = Buffer.alloc(n * 0x4);
  const dataBuffer = Buffer.alloc(n * ENTRY_BYTES);
  for (let i = 0; i < n; i++) {
    const row = table.CharacterData[i];
    idBuffer.writeInt32LE(row.CharacterId, i * 0x4);
    const base = i * ENTRY_BYTES;
    dataBuffer.writeInt32LE(row.Cost, base + 0x0);
    dataBuffer.writeInt32LE(row.Hp, base + 0x4);
  }

  const outBuffer = Buffer.concat([headerBuffer, commandsBuffer, idBuffer, dataBuffer]);
  outBuffer.writeInt32LE(outBuffer.byteLength, 0x8);
  return outBuffer;
}
