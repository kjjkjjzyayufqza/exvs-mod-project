import { FileWithPath } from "react-dropzone";
import { Buffer } from "buffer";
export function bufferReader(file: FileWithPath): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onabort = () => console.log("file reading was aborted");
    reader.onerror = () => console.log("file reading has failed");
    reader.onload = () => {
      // Do whatever you want with the file contents
      const binaryStr: any = reader.result;
      const dataBuffer = Buffer.from(new Uint8Array(binaryStr));
      if (dataBuffer) {
        resolve(dataBuffer);
      } else {
        reject("Error");
      }
    };
    reader.readAsArrayBuffer(file);
  });
}
