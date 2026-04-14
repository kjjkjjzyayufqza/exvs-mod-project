import { Buffer } from "buffer";

export class CommandsData {
  CommandsId: Buffer[];
  CommandsData: Buffer[];
  constructor(buffer: Buffer, commandsCount: number) {
    this.CommandsId = [];
    this.CommandsData = [];
    const idsBytes = commandsCount * 0x4;
    for (let i = 0; i < commandsCount; i++) {
      this.CommandsId.push(buffer.slice(i * 0x4, i * 0x4 + 0x4));
      const payloadStart = idsBytes + i * 0xc;
      this.CommandsData.push(buffer.slice(payloadStart, payloadStart + 0xc));
    }
  }
}
