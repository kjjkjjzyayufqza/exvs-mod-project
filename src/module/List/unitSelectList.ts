import { notifications } from "@mantine/notifications";
import { Buffer } from "buffer";

export function unitSelectList(stream: Buffer) {
  const bufferReader: Buffer = stream;
  const fileMagic: string = bufferReader
    .readUInt32BE(0)
    .toString(16)
    .toUpperCase();
  const fileSize: number = bufferReader.readUInt32LE(0x8);
  if (fileMagic !== "A9B8ABCD") {
    notifications.show({
      title: "Default notification",
      message: "Invalid file magic. Expected: A9B8ABCD",
      color: "red",
    });
  }
}
