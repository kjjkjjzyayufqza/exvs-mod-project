import React, { FC, useEffect, useState } from "react";
import { Buffer } from "buffer";
import { writeFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import { NUTEXImageFormat, NutexbFileModel } from "../../models/nutexb";
import { ConvertFormat, DDSFormat } from "../../models/dds";

export const NutexbCard: FC<{ file: File }> = ({ file }) => {
  if (!file) {
    return <></>;
  }

  const [fileData, setFileData] = useState<NutexbFileModel>();
  useEffect(() => {
    const reader = new FileReader();
    reader.onabort = () => console.log("file reading was aborted");
    reader.onerror = () => console.log("file reading has failed");
    reader.onload = () => {
      // Do whatever you want with the file contents
      const binaryStr: any = reader.result;
      const dataBuffer = Buffer.from(new Uint8Array(binaryStr));
      if (dataBuffer) {
        getMetaData(dataBuffer);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const getMetaData = (bufferData: Buffer) => {
    const MetaData = bufferData.slice(
      bufferData.byteLength - 0xb0,
      bufferData.byteLength
    );
    const BodyData = bufferData.slice(0, bufferData.byteLength - 0xb0);
    const MetaDataSize = MetaData.byteLength;

    const Version = MetaData.slice(MetaDataSize - 0x4).readInt32LE(0);

    const Magic = Buffer.from(
      MetaData.slice(MetaDataSize - 0x8, MetaDataSize - 0x4)
    );
    if (Magic.toString().trim() != "XET") {
    }

    const Name = Buffer.from(MetaData.slice(0x40, 0x70).filter((e) => e != 0))
      .toString()
      .trim(); // don't need 0x0

    const subDataReader = MetaData.slice(0x80);
    const Padding2 = subDataReader.readUInt32LE(0);
    const Width = subDataReader.readUInt32LE(0x4);
    const Height = subDataReader.readUInt32LE(0x8);
    const Depth = subDataReader.readUInt32LE(0xc); //3d textures
    const NutFormat: DDSFormat = ConvertFormat(
      subDataReader.readUInt16LE(0x10)
    );
    const Padding3 = subDataReader.readUInt16LE(0x12);
    const Unk2 = subDataReader.readInt32LE(0x14);
    const MipCount = subDataReader.readUInt32LE(0x18);
    const Alignment = subDataReader.readInt32LE(0x1c);
    const ArrayCount = subDataReader.readUInt32LE(0x20); //6 for cubemaps
    const ImageSize = subDataReader.readInt32LE(0x24);

    const headDataReader = MetaData.slice();
    const MipSizes: any[] = [];
    let offset = 0;
    let subOffset = 0;
    for (let arrayLevel = 0; arrayLevel < ArrayCount; arrayLevel++) {
      let mips: number[] = [];
      for (let i = 0; i < MipCount; i++) {
        mips.push(headDataReader.readInt32LE(subOffset));
        subOffset += 0x4;
      }
      MipSizes.push(mips);

      //Each mip section is 0x40 size for each array
      //Seek to next one
      offset += 0x40;
      subOffset = 0;
    }

    const data: NutexbFileModel = {
      Version,
      Padding2,
      Width,
      Height,
      Depth,
      Format: NutFormat,
      Padding3,
      Unk2,
      MipCount,
      Alignment,
      ArrayCount,
      ImageSize,
      Name: Name,
      Buffer: BodyData,
      MipSizes,
    };
    setFileData(data);
    console.log(data);
  };

  return (
    <div>
      {file.name} - {file.size} bytes
    </div>
  );
};
