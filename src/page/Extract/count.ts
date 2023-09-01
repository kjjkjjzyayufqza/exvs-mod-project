// getData.ts

import { writeBinaryFile } from "@tauri-apps/api/fs";
import { createBinaryFile } from "../../module/fileManager";

/* eslint-disable no-restricted-globals */

interface DataModel {
  outDir: string;
  sortData: any[];
  typeList: string[];
}

self.onmessage = (data: MessageEvent<DataModel>) => {
  const outDir = data.data.outDir;
  const sortData = data.data.sortData;
  const typeList = data.data.typeList;
  //   self.postMessage(data);
  //   console.log("1")
  //   console.log(e.data);

  sortData.map((e, i) => {
    const outFileName = `${i}${typeList[i]}`;
    const fileContents = e.BufferData; // 文件内容，假设是一个 ArrayBuffer

    const blob = new Blob([new Uint8Array(fileContents)], {
      type: "application/octet-stream",
    });
    const fileUrl = URL.createObjectURL(blob);

    // 发送文件 URL 回主线程
    self.postMessage({ fileName: outFileName, fileUrl });
  });
};
