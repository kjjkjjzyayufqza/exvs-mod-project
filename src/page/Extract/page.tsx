import { useEffect, useState, useTransition } from "react";
import JsonView from '@uiw/react-json-view';
import { FileWithPath } from "react-dropzone";
import {
  ExtractFHMData,
  ExtractType,
  Fhm2dData,
  Fhm2d_type_format,
  PS4FhmData,
} from "../../models/fhm2d";
import {
  writeFile,
} from "@tauri-apps/plugin-fs";
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useForm } from 'react-hook-form';
import { FilePathInput } from '../../components/ui/filePathInput';
import { useConfigStore } from '../../store/configStore';
import { IOReadFile } from '../../IO/fileSystem';
import { Buffer } from 'buffer';
import { toast } from 'sonner';
import { Card, CardDescription, CardHeader } from '../../components/ui/card';
import { Checkbox } from '../../components/ui/checkbox';
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group';
import { vscodeTheme } from '@uiw/react-json-view/vscode';
import { Loader2 } from "lucide-react";

const formSchema = z.object({
  inputFilePath: z.string(),
  outputFolderPath: z.string(),
})


export default function ExtractFilePage() {
  const { store } = useConfigStore();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      inputFilePath: "",
      outputFolderPath: "",
    },
  })

  const [fileData, setFileData] = useState<FileWithPath>();
  const [fhm2dData, setfhm2dData] = useState<PS4FhmData | Fhm2dData>(null!);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [, startTransition] = useTransition();
  const [previewData, setPreviewData] = useState<Object>({});
  const [isExportMeta, setIsExportMeta] = useState(false);
  const [extractType, setExtractType] = useState<ExtractType>(ExtractType.SingleFolder);
  const [createSubfolder, setCreateSubfolder] = useState(true);

  useEffect(() => {
    if (!isExtracting) return;

    const timer = window.setInterval(() => {
      startTransition(() => {
        setExtractProgress((current) => {
          if (current >= 90) return current;
          const step = Math.floor(Math.random() * 4) + 1; // 1..4
          return Math.min(90, current + step);
        });
      });
    }, 120);

    return () => window.clearInterval(timer);
  }, [isExtracting, startTransition]);

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const createFileInfo = async (fileBuffer: Buffer) => {
    const Magic = fileBuffer.slice(0, 0x4).toString("hex");
    let data: Fhm2dData | PS4FhmData | null = null;
    if (Magic.toUpperCase() == "B9B7B2CD") {
      data = new Fhm2dData(fileBuffer);
    } else if (Magic.toUpperCase() == "9992CD90") {
      data = new PS4FhmData(fileBuffer);
    }

    const outDir = form.getValues("outputFolderPath");

    if (isExportMeta) {
      // Get input file basename
      const inputFilePath = form.getValues("inputFilePath");
      const parts = inputFilePath.split(/[/\\]/); // 分割路径，支持 '/' 和 '\'
      const fileNameWithExtension = parts[parts.length - 1]; // 获取最后一个部分
      const fileName = fileNameWithExtension.split('.').slice(0, -1).join('.'); // 去掉扩展名
      // Create the meta file
      if (data?.MetaData) {
        writeFile(`${outDir}/${fileName}_meta.bin`, data.MetaData)
          .then(() => {
            toast(`Meta file saved successfully in ${outDir}/${fileName}_meta.bin`);
          })
          .catch((err) => {
            console.log("save error", err);
          });
      }
    }

    if (data) {
      setfhm2dData(data);
      // Create Preview Json
      createPreviewJson(data);
    } else {
      toast("Error: File magic not match with FHM2D or PS4FHM");
    }
  };

  const createPreviewJson = (data: PS4FhmData | Fhm2dData) => {
    setPreviewData({
      file: form.getValues("inputFilePath"),
      __TYPE__: data._TYPE_,
      Magic: data.Magic,
      FileTypeCount: data.FileTypeCount,
      FileCount: data.FileCount,
      SubFileData: data.SubFileData.map((subFile) => {
        return {
          StartOffset: subFile.StartOffset,
          FileSize: subFile.FileSize,
          Unk1: subFile.Unk1,
          ChunkCount: subFile.ChunkCount,
          OriginChunkBinaryBuffer: subFile.OriginChunkBinaryBuffer,
          FileIndex: subFile.FileIndex,
          // BufferData: subFile.BufferData,
          // CompBufferData: subFile.CompBufferData,
          _Length: subFile._Length,
          _isNeedDeComp: subFile._isNeedDeComp,
        }
      }),
      SubFileStructure: data.SubFileStructure,
    });
  };

  const tryReadFHM2DFile = async (filePath: string) => {
    const fileBuffer = await IOReadFile(filePath); // return the array buffer
    createFileInfo(Buffer.from(fileBuffer));
  }

  const initFromData = async () => {
    const inputFilePath: any = await store?.get("inputFilePath")
    if (inputFilePath) {
      form.setValue("inputFilePath", inputFilePath);
      tryReadFHM2DFile(inputFilePath);
    }
    
    // Try to get the outputFolderPath from the form or fall back to the global setting
    const outputFolderPath: any = await store?.get("outputFolderPath") || await store?.get("extractOutputPath");
    form.setValue("outputFolderPath", outputFolderPath);
  }

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    if (isExtracting) return;

    // update output path if createSubfolder
    if(createSubfolder) {
      const inputPath = form.getValues("inputFilePath");
      if (inputPath) {
        const fileName = inputPath.split(/[/\\]/).pop()?.split('.').slice(0, -1).join('.');
        if (fileName) {
          data.outputFolderPath = `${data.outputFolderPath}/${fileName}`;
        }
      }
    }

    setIsExtracting(true);
    startTransition(() => setExtractProgress(0));
    try {
      await ExtractFHMData(fhm2dData, data.outputFolderPath, extractType, Fhm2d_type_format.fhm2d_character);
      toast.success(`Extract completed: ${data.outputFolderPath}`);
      startTransition(() => setExtractProgress(100));
      await sleep(600);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Extract failed: ${message}`);
      startTransition(() => setExtractProgress(100));
      await sleep(600);
    } finally {
      setIsExtracting(false);
      startTransition(() => setExtractProgress(0));
    }
  }

  useEffect(() => {
    initFromData()
  }, []);

  return (
    <div className="h-full flex flex-col">
      <h1>Extract .FHM2D</h1>
      <div className="grid grid-cols-2 flex-1 min-h-0">
        <div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <FormField
                control={form.control}
                name="inputFilePath"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select the fhm2d file</FormLabel>
                    <FormControl>
                      <FilePathInput
                        placeholder="..."
                        {...field}
                        storeKey="inputFilePath"
                        picker={{
                          kind: "file",
                          multiple: false,
                        }}
                        onPickedValue={(picked) => {
                          if (Array.isArray(picked)) return;
                          tryReadFHM2DFile(picked);
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      Drop or select the fhm2d file
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="outputFolderPath"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select output folder</FormLabel>
                    <FormControl>
                      <FilePathInput
                        placeholder="..."
                        {...field}
                        storeKey="outputFolderPath"
                        picker={{
                          kind: "folder",
                          multiple: false,
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div>
                <p className='py-1 font-medium'>Options</p>
                <div className='space-y-2'>
                  <div className="flex items-center space-x-2">
                    <Checkbox checked={isExportMeta}
                      onClick={() => {
                        setIsExportMeta(!isExportMeta)
                      }} />
                    <label
                      htmlFor="terms"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Export meta file
                    </label>
                  </div>
                  <div className="flex flex-col space-y-2">
                    <p className="text-sm font-medium">Extract Type</p>
                    <ToggleGroup type="single" value={extractType} onValueChange={(value) => setExtractType(value as ExtractType)} variant="outline" className="justify-start gap-1">
                      <ToggleGroupItem value={ExtractType.SingleFolder}>
                        Single Folder
                      </ToggleGroupItem>
                      <ToggleGroupItem value={ExtractType.FolderWithStructure}>
                        With Structure
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      checked={createSubfolder}
                      onClick={() => {
                        const newValue = !createSubfolder;
                        setCreateSubfolder(newValue);
                        // Update output path display
                        const currentPath = form.getValues("outputFolderPath");
                        if (currentPath) {
                          const inputPath = form.getValues("inputFilePath");
                          if (inputPath) {
                            const fileName = inputPath.split(/[/\\]/).pop()?.split('.').slice(0, -1).join('.');
                            if (fileName) {
                              const newPath = newValue 
                                ? `${currentPath}/${fileName}`
                                : currentPath.split('/').slice(0, -1).join('/');
                              form.setValue("outputFolderPath", newPath);
                            }
                          }
                        }
                      }}
                    />
                    <label
                      htmlFor="terms"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Create subfolder using input filename
                    </label>
                  </div>
                </div>
              </div>
              <Button type="submit" disabled={isExtracting}>
                {isExtracting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  "Extract"
                )}
              </Button>
              <Progress value={extractProgress} className="w-full" />
            </form>
          </Form>
        </div>
        <div className='mt-2 rounded-md p-4 overflow-auto'>
          <JsonView
            style={vscodeTheme}
            value={previewData}
            displayDataTypes={false}
            collapsed={true}
          />
        </div>
      </div>
    </div>
  );
}
