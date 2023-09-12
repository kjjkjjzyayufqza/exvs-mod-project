import { Buffer } from "buffer";

export class CommandsData {
  CommandsId: Buffer[];
  CommandsData: Buffer[];
  constructor(buffer: Buffer, commandsCount: number) {
    this.CommandsId = [];
    this.CommandsData = [];
    for (let i = 0; i < commandsCount; i++) {
      this.CommandsId.push(buffer.slice(i * 0x4));
      this.CommandsData.push(buffer.slice(commandsCount * 0x4 + i * 0xc));
    }
  }
}
