import { open } from "@tauri-apps/api/dialog";
import { useForm } from "@mantine/form";
import {
  Button,
  TextInput,
  Code,
  Text,
  Box,
  Grid,
  Group,
  FileButton,
} from "@mantine/core";
import ReactJson from "react-json-view";
import { useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../hooks";
import { setOutputFileUrl } from "../../stateManager/configStore/configStore";
import { updateConfig } from "../../module/storeConfig";
import { bufferReader } from "../../module/reader";
import { FileWithPath } from "react-dropzone";
import { Fhm2dData, PS4FhmData, getFileType } from "../../models/fhm2d";
import {
  createDir,
  exists,
  writeBinaryFile,
  writeTextFile,
} from "@tauri-apps/api/fs";
import { CusProgressBar } from "../../components/CusProgressBar";
import { invoke } from "@tauri-apps/api/tauri";
import {
  notificationsType,
  showNotification,
} from "../../module/notifications";

interface FromModel {
  inputFileUrl: string;
  outputFileUrl: string;
}

export default function ExtractFilePage() {
  const dispatch = useAppDispatch();
  const config = useAppSelector((state) => state.configStore);
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

  // const counter: Worker = useMemo(
  //   () => new Worker(new URL("count.ts", import.meta.url), { type: "module" }),
  //   []
  // );

  const OpenFile = async (file: File) => {
    if (file) {
      form.setFieldValue("inputFileUrl", file.name);
      setFileData(file);
      createFileInfo(file);
    }
  };

  const OpenPath = async () => {
    const path = await open({ directory: true });
    if (path) {
      form.setFieldValue("outputFileUrl", path as string);
      dispatch(setOutputFileUrl(path as string));
      dispatch(updateConfig({ key: "outputFileUrl", value: path }));
    }
  };

  const createFileInfo = async (file: FileWithPath) => {
    const contents = await bufferReader(file);

    const Magic = contents.slice(0, 0x4).toString("hex");
    let data!: Fhm2dData | PS4FhmData;
    if (Magic.toUpperCase() == "B9B7B2CD") {
      data = new Fhm2dData(contents);
    } else if (Magic.toUpperCase() == "9992CD90") {
      data = new PS4FhmData(contents);
    }
    setfhm2dData(data);
    // Create Preview Json
    createPreviewJson(data);
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
    const outDir = `${form.values.outputFileUrl}\\${
      form.values.inputFileUrl.split(".")[0]
    }`;
    const jsonDir = `${form.values.outputFileUrl}\\${
      form.values.inputFileUrl.split(".")[0]
    }.json`;

    const dirExists = await exists(outDir);
    if (!dirExists) {
      await createDir(outDir, { recursive: true });
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
    const sortData = fhm2dData.getSortSubFileData();

    

    sortData.map((e, i) => {
      const outFileName = `${i}${typeList[i]}`;
      // invoke("save_buffer_to_file", {
      //   path: `${outDir}\\${outFileName}`,
      //   buffer: Array.from(e.BufferData),
      // }).then((e) => {
      //   setProgressbarValue((prevValue) => ({
      //     ...prevValue,
      //     value: i + 1, // 更新 value 字段
      //     max: sortData.length,
      //   }));
      // });
      
      
      writeBinaryFile(`${outDir}\\${outFileName}`, e.BufferData, {})
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

      let outputMeta = {
        SubFileData: fhm2dData.SubFileData.map((e, i) => {
          return {
            fileName: i,
            fileIndex: e.FileIndex,
          };
        }),
        SubFileStructure: fhm2dData.SubFileStructure,
      };
      writeTextFile(`${jsonDir}`, JSON.stringify(outputMeta), {})
        .then((res) => {
          showNotification(notificationsType.Success);
        })
        .catch((err) => {
          console.log("save error", err);
        });
    });
  };

  const form = useForm<FromModel>({
    initialValues: {
      inputFileUrl: "",
      outputFileUrl: "",
    },
  });

  useEffect(() => {
    // form.setFieldValue("inputFileUrl", config.inputFileUrl);
    form.setFieldValue("outputFileUrl", config.outputFileUrl);
  }, [config]);

  return (
    <div>
      <h1>Extract .FHM2D</h1>
      <div className="p-5">
        <Grid>
          <Grid.Col span={6}>
            <Box>
              <TextInput
                label="Input File Url"
                placeholder="inputFileUrl"
                {...form.getInputProps("inputFileUrl")}
              />

              <Group position="right" mt="md">
                <FileButton onChange={OpenFile}>
                  {(props) => (
                    <Button variant="outline" {...props}>
                      Select File
                    </Button>
                  )}
                </FileButton>
              </Group>
            </Box>
            <Box>
              <TextInput
                label="Output File Url"
                placeholder="outputFileUrl"
                mt="md"
                {...form.getInputProps("outputFileUrl")}
              />

              <Group position="right" mt="md">
                <Button variant="outline" onClick={() => OpenPath()}>
                  Select Path
                </Button>
              </Group>
            </Box>
            <Group>
              <Button
                disabled={form.values.inputFileUrl == ""}
                onClick={async () => {
                  await startExtractFile();
                }}
              >
                Extract
              </Button>
            </Group>
            <Box mt={10}>
              <CusProgressBar
                value={progressbarValue.value}
                min={progressbarValue.min}
                max={progressbarValue.max}
              />
            </Box>
          </Grid.Col>
          <Grid.Col span={6}>
            <Box>
              <Text size="sm" weight={500} mt="xl">
                Form values:
              </Text>
              <Code block mt={5}>
                <ReactJson
                  src={form.values}
                  displayDataTypes={false}
                  name={null}
                />
              </Code>
            </Box>
            <Box>
              <Text size="sm" weight={500} mt="xl">
                Data values:
              </Text>
              <Code block mt={5} className="overflow-auto h-auto">
                <ReactJson
                  src={previewData}
                  displayDataTypes={false}
                  name={null}
                />
              </Code>
            </Box>
          </Grid.Col>
        </Grid>
      </div>
    </div>
  );
}
