import { Card, CardBody } from "@chakra-ui/react";
import React, { FC, useEffect, useState } from "react";
import { Buffer } from "buffer";
import { readBinaryFile, BaseDirectory } from "@tauri-apps/api/fs";

export const NutexbCard: FC<{ file: File }> = ({ file }) => {
  if (!file) {
    return <></>;
  }

  const [fileData, setFileData] = useState<any>();
  useEffect(() => {
    const reader = new FileReader();
    reader.onabort = () => console.log("file reading was aborted");
    reader.onerror = () => console.log("file reading has failed");
    reader.onload = () => {
      // Do whatever you want with the file contents
      const binaryStr: any = reader.result;
      const dataBuffer = Buffer.from(new Uint8Array(binaryStr));
      console.log(dataBuffer.readInt32LE(0));
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const getMetaData = () => {};

  return (
    <Card>
      <CardBody>
        {file.name} - {file.size} bytes
      </CardBody>
    </Card>
  );
};
