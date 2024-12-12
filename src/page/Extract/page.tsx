import { open } from '@tauri-apps/plugin-dialog';
import { useEffect, useState } from "react";
import JsonView from '@uiw/react-json-view';
import { FileWithPath } from "react-dropzone";
import {
  Fhm2dData,
  Fhm2dType,
  PS4FhmData,
  getFileType,
} from "../../models/fhm2d";
import {
  mkdir,
  exists,
  writeFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { Buffer } from "buffer";
import pako from "pako";
import Container from '../../layout/Container';

interface FromModel {
  inputFileUrl: string;
  outputFileUrl: string;
}

export default function ExtractFilePage() {
  const [fileData, setFileData] = useState<FileWithPath>();
  const [fhm2dData, setfhm2dData] = useState<PS4FhmData | Fhm2dData>(null!);
  const [progressbarValue, setProgressbarValue] = useState<{
    value: number;
    min: number;
    max: number;
  }>({
    value: 0,
    min: 0,
    max: 100,
  });
  const [previewData, setPreviewData] = useState<Object>({});

  const OpenFile = async (file: File | null) => {
    if (file) {
      setFileData(file);
      createFileInfo(file);
    }
  };

  const OpenPath = async () => {
    const path = await open({ directory: true });
    if (path) {
    }
  };

  const createFileInfo = async (file: FileWithPath) => {
    const contents: any = null
    const Magic = contents.slice(0, 0x4).toString("hex");
    let data!: Fhm2dData | PS4FhmData;
    if (Magic.toUpperCase() == "B9B7B2CD") {
      data = new Fhm2dData(contents);
    } else if (Magic.toUpperCase() == "9992CD90") {
      data = new PS4FhmData(contents);
    }

    const outDir = ``;

    // Create the meta file
    writeFile(`${outDir}_meta.bin`, data.MetaData)
      .then((res) => { })
      .catch((err) => {
        console.log("save error", err);
      });
    if (data) {
      setfhm2dData(data);
      // Create Preview Json
      createPreviewJson(data);
    } else {
      throw "cc";
    }
  };

  const createPreviewJson = (data: PS4FhmData | Fhm2dData) => {
    console.log(data);
    setPreviewData({
      __TYPE__: data._TYPE_,
      Magic: data.Magic,
      FileTypeCount: data.FileTypeCount,
      FileCount: data.FileCount,
      SubFileStructure: data.SubFileStructure,
    });
  };

  const startExtractFile = async () => {
    const outDir = ''
    const jsonDir = ''

    const dirExists = await exists(outDir);
    if (!dirExists) {
      await mkdir(outDir, { recursive: true });
    }
    // create list to store type
    let typeList: string[] = [];
    for (let i of fhm2dData.FileTypeData) {
      for (let k = 0; k < i.FileCount; k++) {
        typeList.push(getFileType(i.FileType));
      }
    }

    // Create each sub File
    // Sort The Array first
    let sortData: any[] = [];

    if (fhm2dData._TYPE_ == Fhm2dType.PS4GundamVersus) {
      sortData = fhm2dData.getSortSubFileData();
    } else if (fhm2dData._TYPE_ == Fhm2dType.Xboost) {
      sortData = fhm2dData.SubFileData;
    }

    let fileUrl: { fileName: string; fileUrl: string }[] = [];
    sortData.map((e, i) => {
      const outFileName = `${i}${typeList[i]}`;

      let BufferData!: Buffer;
      if (fhm2dData._TYPE_ == Fhm2dType.PS4GundamVersus) {
        BufferData = e.BufferData;
      } else if (fhm2dData._TYPE_ == Fhm2dType.Xboost) {
        //解压 Chunk
        let decompressData: Uint8Array[] = [];
        if (e._isNeedDeComp == false) {
          BufferData = e.CompBufferData[0].CompBufferData;
        } else {
          e.CompBufferData.map((_e: any) => {
            const temp = pako.inflateRaw(new Uint8Array(_e.CompBufferData));
            decompressData.push(temp);
          });
          BufferData = Buffer.concat(decompressData);
        }
      }
      fileUrl.push({
        fileName: outFileName,
        fileUrl: ''
      });
      writeFile(`${outDir}\\${outFileName}`, BufferData, {})
        .then((res) => {
          setProgressbarValue((prevValue) => ({
            ...prevValue,
            value: i + 1, // 更新 value 字段
            max: sortData.length,
          }));
        })
        .catch((err) => {
          console.log("save error", err);
        });
    });

    // 处理SubFileStructure ，因为后面打包需要所有文件从0开始排序，所以只能重新排序SubFileStructure
    // 先储存所有文件的FileIndex，用来做索引
    let originAllFileIndex: number[] = [];
    fhm2dData.SubFileData.map((e) => {
      originAllFileIndex.push(e.FileIndex);
    });

    // 然后开始进行更改SubFileStructure中的FileIndex
    fhm2dData.SubFileStructure.map((e) => {
      if (e.type == "Item") {
        const index = originAllFileIndex.indexOf(e.fileIndex!);
        if (index > -1) {
          e.originalFileIndex = e.fileIndex;
          e.fileIndex = index;
        }
      }
    });

    let outputMeta = {
      Magic: fhm2dData.MetaHeader,
      SubFileData: fhm2dData.SubFileData.map((e, i) => {
        return {
          id: i, //标识符
          fileType: typeList[i],
          fileName: fileUrl[i].fileName,
          originalFileIndex: e.FileIndex,
          newFileIndex: i, //分配一个新的
          isNeedComp: e._isNeedDeComp ? true : false,
          fileUrl: fileUrl[i].fileUrl,
        };
      }),
      SubFileStructure: fhm2dData.SubFileStructure,
    };
    writeTextFile(`${jsonDir}`, JSON.stringify(outputMeta), {})
      .then((res) => {
      })
      .catch((err) => {
        console.log("save error", err);
      });
  };

  const [form, setForm] = useState({
    initialValues: {
      inputFileUrl: "",
      outputFileUrl: "",
    },
  });

  useEffect(() => {
  }, []);

  return (
    <Container>
      <h1>Extract .FHM2D</h1>
      <div className="p-5">
        <JsonView
          value={previewData}
          displayDataTypes={false}
        />
      </div>
    </Container>
  );
}
