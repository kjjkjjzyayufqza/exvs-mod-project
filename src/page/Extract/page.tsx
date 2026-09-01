import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, FolderArchive, Loader2, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { Buffer } from "buffer";

import {
  ExtractFHMData,
  ExtractType,
  Fhm2dData,
  Fhm2d_type_format,
  PS4FhmData,
} from "@/models/fhm2d";
import { IOReadFile } from "@/IO/fileSystem";
import { useConfigStore } from "@/store/configStore";
import { repackFolderUsingStructure } from "@/utils/repackRunner";
import {
  normalizeFhm2dHashName,
  sanitizeFhm2dStructureName,
} from "@/utils/fhm2dStructureMetadata";
import { suggestFhm2dStructureName } from "@/utils/fhm2dNameMapping";
import {
  Fhm2dMetadataSummary,
  Fhm2dNameField,
  basenameFromPath,
  joinPreviewPath,
  parentFromPath,
} from "@/components/fhm2d-metadata";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FilePathInput } from "@/components/ui/filePathInput";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  discoverStructureJsonBesideFolder,
  type StructureJsonDiscovery,
} from "./findStructureJson";
import { SectionBlock, SectionPanel } from "./components/SectionPanel";
import {
  ArchivePreviewPanel,
  type ArchivePreviewState,
} from "./components/ArchivePreviewPanel";

/** Formats currently supported by Rust `extract_fhm2d_to_folder` naming pipelines. */
const EXTRACT_FORMAT_OPTIONS: Array<{
  value: string;
  label: string;
  description: string;
  format?: Fhm2d_type_format;
}> = [
  {
    value: "generic",
    label: "Generic (no special naming)",
    description: "Extract files as-is without asset-type renames.",
  },
  {
    value: Fhm2d_type_format.fhm2d_character,
    label: "Character / unit model",
    description: "Full unit package naming (numdlb groups, materials, textures).",
    format: Fhm2d_type_format.fhm2d_character,
  },
  {
    value: Fhm2d_type_format.fhm2d_effect,
    label: "Effect",
    description: "Effect package layout (lighter naming than character).",
    format: Fhm2d_type_format.fhm2d_effect,
  },
  {
    value: Fhm2d_type_format.fhm2d_motion,
    label: "Motion",
    description: "Motion package naming.",
    format: Fhm2d_type_format.fhm2d_motion,
  },
  {
    value: Fhm2d_type_format.fhm2d_msc,
    label: "MSC",
    description: "MSC script package naming.",
    format: Fhm2d_type_format.fhm2d_msc,
  },
  {
    value: Fhm2d_type_format.fhm2d_sound,
    label: "Sound",
    description: "Sound package naming.",
    format: Fhm2d_type_format.fhm2d_sound,
  },
  {
    value: Fhm2d_type_format.fhm2d_character_param,
    label: "Character param",
    description: "Character parameter tables.",
    format: Fhm2d_type_format.fhm2d_character_param,
  },
  {
    value: Fhm2d_type_format.fhm2d_character_cost,
    label: "Character cost",
    description: "Out-of-game cost / HP balance tables.",
    format: Fhm2d_type_format.fhm2d_character_cost,
  },
  {
    value: Fhm2d_type_format.fhm2d_striker_table,
    label: "Striker table",
    description: "Host unit → striker slot table (0xFEEB79F0, vgsht1 stride 8).",
    format: Fhm2d_type_format.fhm2d_striker_table,
  },
  {
    value: Fhm2d_type_format.fhm2d_stage_list,
    label: "Stage list",
    description: "Stage list binary naming.",
    format: Fhm2d_type_format.fhm2d_stage_list,
  },
  {
    value: Fhm2d_type_format.fhm2d_list,
    label: "List (BGM list)",
    description: "Generic 012list payload rename (bgm_list.bin).",
    format: Fhm2d_type_format.fhm2d_list,
  },
  {
    value: Fhm2d_type_format.fhm2d_all_nutexb,
    label: "All nutexb",
    description: "Texture-list packages (icons, stage images).",
    format: Fhm2d_type_format.fhm2d_all_nutexb,
  },
];

function buildArchivePreview(
  data: Fhm2dData | PS4FhmData,
  inputPath: string,
): Record<string, unknown> {
  return {
    file: inputPath,
    __TYPE__: data._TYPE_,
    Magic: data.Magic,
    FileTypeCount: data.FileTypeCount,
    FileCount: data.FileCount,
    SubFileData: data.SubFileData.map((subFile) => ({
      StartOffset: subFile.StartOffset,
      FileSize: subFile.FileSize,
      Unk1: subFile.Unk1,
      ChunkCount: subFile.ChunkCount,
      FileIndex: subFile.FileIndex,
      _Length: subFile._Length,
      _isNeedDeComp: subFile._isNeedDeComp,
    })),
    SubFileStructure: data.SubFileStructure,
  };
}

/** Compact source-to-destination strip so the exact effect of the action is visible up front. */
function FlowStrip({ from, to }: { from: string | null; to: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 font-mono text-[11px]">
      <span className={cn("min-w-0 break-all", from ? "text-foreground" : "text-muted-foreground")}>
        {from ?? "no source selected"}
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className={cn("min-w-0 break-all", to ? "text-foreground" : "text-muted-foreground")}>
        {to ?? "no destination resolved"}
      </span>
    </div>
  );
}

export default function SingleFhm2dPage() {
  const store = useConfigStore((s) => s.store);
  const getSetting = useConfigStore((s) => s.getSetting);

  // --- Unpack state ---
  const [inputFilePath, setInputFilePath] = useState("");
  const [outputFolderPath, setOutputFolderPath] = useState("");
  const [structureName, setStructureName] = useState("");
  const [createSubfolder, setCreateSubfolder] = useState(true);
  const [writeMetaBin, setWriteMetaBin] = useState(false);
  const [formatKey, setFormatKey] = useState<string>("generic");
  const [isExtracting, setIsExtracting] = useState(false);
  const [preview, setPreview] = useState<ArchivePreviewState>({ status: "idle" });

  // --- Repack state ---
  const [repackFolderPath, setRepackFolderPath] = useState("");
  const [repackDiscovery, setRepackDiscovery] = useState<StructureJsonDiscovery | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isRepacking, setIsRepacking] = useState(false);

  const selectedFormat = useMemo(
    () => EXTRACT_FORMAT_OPTIONS.find((o) => o.value === formatKey) ?? EXTRACT_FORMAT_OPTIONS[0]!,
    [formatKey],
  );

  const inputStem = useMemo(() => {
    const base = basenameFromPath(inputFilePath);
    return base.replace(/\.fhm2d$/i, "");
  }, [inputFilePath]);

  const requestedName = sanitizeFhm2dStructureName(structureName || inputStem);
  const selectedOutputFolderName = sanitizeFhm2dStructureName(
    basenameFromPath(outputFolderPath) || requestedName,
  );
  const effectiveName = createSubfolder ? requestedName : selectedOutputFolderName;
  const effectiveOutputFolderPath = outputFolderPath
    ? createSubfolder
      ? joinPreviewPath(outputFolderPath, effectiveName)
      : outputFolderPath
    : "";
  const effectiveStructureJsonPath = effectiveOutputFolderPath
    ? `${effectiveOutputFolderPath}_structure.json`
    : "";
  const hashPreview = normalizeFhm2dHashName(inputFilePath);
  const repackOutputPreview =
    hashPreview && effectiveOutputFolderPath
      ? joinPreviewPath(parentFromPath(effectiveOutputFolderPath), `${hashPreview}.fhm2d`)
      : null;

  const extractBlockedReason = !inputFilePath.trim()
    ? "Select a .fhm2d file."
    : !outputFolderPath.trim()
      ? "Select an output folder."
      : createSubfolder && !requestedName
        ? "Enter an extract name, or turn off subfolder creation."
        : null;

  const repackBlockedReason = !repackFolderPath.trim()
    ? "Select an extracted asset folder."
    : isDiscovering
      ? "Resolving the sibling structure JSON..."
      : !repackDiscovery
        ? "Structure JSON has not been resolved yet."
        : !repackDiscovery.ok
          ? repackDiscovery.error
          : null;

  const loadArchivePreview = useCallback(async (filePath: string) => {
    if (!filePath.trim()) {
      setPreview({ status: "idle" });
      return;
    }
    setPreview({ status: "loading" });
    try {
      const fileBuffer = Buffer.from(await IOReadFile(filePath));
      const magic = fileBuffer.slice(0, 0x4).toString("hex").toUpperCase();
      let data: Fhm2dData | PS4FhmData | null = null;
      if (magic === "B9B7B2CD") {
        data = new Fhm2dData(fileBuffer);
      } else if (magic === "9992CD90") {
        data = new PS4FhmData(fileBuffer);
      }
      if (!data) {
        setPreview({
          status: "error",
          message: "File magic does not match FHM2D (Xboost) or PS4 FHM. Preview unavailable.",
        });
        return;
      }
      setPreview({
        status: "ready",
        data: buildArchivePreview(data, filePath),
        typeLabel: data._TYPE_,
      });
    } catch (error) {
      setPreview({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  const applySuggestedName = useCallback((filePath: string) => {
    const stem = basenameFromPath(filePath).replace(/\.fhm2d$/i, "");
    if (!stem) return;
    setStructureName(
      suggestFhm2dStructureName(filePath, { fallbackName: stem }) ??
        sanitizeFhm2dStructureName(stem),
    );
  }, []);

  useEffect(() => {
    const init = async () => {
      const storedInput = (await store?.get<string>("inputFilePath")) ?? "";
      const storedOutput =
        (await store?.get<string>("outputFolderPath")) ||
        (await getSetting<string>("extractOutputPath")) ||
        "";
      const storedRepack = (await getSetting<string>("repackInputPath")) || "";
      if (storedInput) {
        setInputFilePath(storedInput);
        applySuggestedName(storedInput);
        void loadArchivePreview(storedInput);
      }
      if (storedOutput) setOutputFolderPath(storedOutput);
      if (storedRepack) setRepackFolderPath(storedRepack);
    };
    void init();
  }, [store, getSetting, applySuggestedName, loadArchivePreview]);

  useEffect(() => {
    let cancelled = false;
    const path = repackFolderPath.trim();
    setRepackDiscovery(null);
    if (!path) {
      setIsDiscovering(false);
      return;
    }
    setIsDiscovering(true);
    void discoverStructureJsonBesideFolder(path)
      .then((result) => {
        if (!cancelled) setRepackDiscovery(result);
      })
      .finally(() => {
        if (!cancelled) setIsDiscovering(false);
      });
    return () => {
      cancelled = true;
    };
  }, [repackFolderPath]);

  const handleExtract = async () => {
    if (isExtracting) return;
    if (extractBlockedReason) {
      toast.error(extractBlockedReason);
      return;
    }

    const outputName = sanitizeFhm2dStructureName(structureName || inputStem);
    let targetOutDir = outputFolderPath.trim();
    if (createSubfolder) {
      targetOutDir = joinPreviewPath(targetOutDir, outputName);
    }

    setIsExtracting(true);
    try {
      const extractResult = await ExtractFHMData(
        inputFilePath.trim(),
        targetOutDir,
        ExtractType.SingleFolder,
        selectedFormat.format,
        undefined,
        writeMetaBin,
      );
      if (extractResult.namingError) {
        toast.error("Unpack finished but FHM naming step failed (files were written)", {
          description: extractResult.namingError,
          duration: 20_000,
        });
      } else {
        toast.success("Unpack completed", {
          description: `${targetOutDir}\nStructure: ${targetOutDir}_structure.json`,
          duration: 12_000,
        });
      }
    } catch (error) {
      toast.error("Unpack failed", {
        description: error instanceof Error ? error.message : String(error),
        duration: 15_000,
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleRepack = async () => {
    if (isRepacking) return;
    if (repackBlockedReason || !repackDiscovery?.ok) {
      toast.error("Cannot repack", { description: repackBlockedReason ?? "Structure unresolved" });
      return;
    }

    setIsRepacking(true);
    try {
      const result = await repackFolderUsingStructure({
        structurePath: repackDiscovery.structureJsonPath,
        inputFolderPath: repackFolderPath.trim(),
      });
      toast.success("Repack completed", {
        description: `Structure: ${repackDiscovery.structureJsonPath}\nOutput: ${result.outputPath}\nFiles: ${result.totalFiles}, size: ${result.outputSize}`,
        duration: 15_000,
      });
    } catch (error) {
      toast.error("Repack failed", {
        description: error instanceof Error ? error.message : String(error),
        duration: 15_000,
      });
    } finally {
      setIsRepacking(false);
    }
  };

  return (
    <div className="h-full min-h-0 overflow-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-16">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Single FHM2D</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Handle one archive at a time: unpack a .fhm2d into a named folder plus its sibling
            structure JSON, or pack an already extracted folder back using that JSON.
          </p>
        </header>

        <Tabs defaultValue="unpack" className="flex min-h-0 flex-col gap-4">
          <TabsList className="grid w-full max-w-sm grid-cols-2">
            <TabsTrigger value="unpack" className="gap-2 text-xs">
              <PackageOpen className="h-3.5 w-3.5" />
              Unpack
            </TabsTrigger>
            <TabsTrigger value="repack" className="gap-2 text-xs">
              <FolderArchive className="h-3.5 w-3.5" />
              Repack
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="unpack"
            className="mt-0 space-y-4 focus-visible:outline-none"
          >
            <FlowStrip
              from={inputFilePath || null}
              to={effectiveOutputFolderPath || null}
            />

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
              <SectionPanel>
                <SectionBlock
                  title="Source"
                  description={
                    <>
                      Unpacked by the Rust{" "}
                      <code className="font-mono">extract_fhm2d_to_folder</code> command, not by
                      the JS parser used for the preview.
                    </>
                  }
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="extract-input" className="text-xs">
                      FHM2D file
                    </Label>
                    <FilePathInput
                      id="extract-input"
                      value={inputFilePath}
                      onChange={(e) => setInputFilePath(e.target.value)}
                      storeKey="inputFilePath"
                      placeholder="Select .fhm2d..."
                      picker={{ kind: "file", multiple: false }}
                      onPickedValue={(picked) => {
                        if (Array.isArray(picked)) return;
                        setInputFilePath(picked);
                        applySuggestedName(picked);
                        void loadArchivePreview(picked);
                      }}
                    />
                  </div>
                </SectionBlock>

                <SectionBlock
                  title="Destination"
                  description="Files land here; the structure JSON is written beside the folder."
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="extract-output" className="text-xs">
                      Output folder
                    </Label>
                    <FilePathInput
                      id="extract-output"
                      value={outputFolderPath}
                      onChange={(e) => setOutputFolderPath(e.target.value)}
                      storeKey="outputFolderPath"
                      placeholder="Select output directory..."
                      picker={{ kind: "folder", multiple: false }}
                    />
                  </div>

                  <Fhm2dNameField
                    id="extract-structure-name"
                    label="Extract name"
                    value={structureName}
                    onChange={setStructureName}
                    sourceNameOrPath={inputFilePath}
                    folderPath={effectiveOutputFolderPath || null}
                    structureJsonPath={effectiveStructureJsonPath || null}
                    description={
                      createSubfolder
                        ? "Used for the output folder and the sibling structure JSON name."
                        : "Subfolder creation is off, so the selected output folder name becomes Name."
                    }
                  />

                  <label className="flex items-start gap-2 text-xs">
                    <Checkbox
                      checked={createSubfolder}
                      onCheckedChange={(v) => setCreateSubfolder(v === true)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">Create subfolder using name</span>
                      <span className="block text-muted-foreground">
                        Writes into output/name/ and name_structure.json beside it.
                      </span>
                    </span>
                  </label>
                </SectionBlock>

                <SectionBlock
                  title="Naming"
                  description="Picks the rename pipeline the extractor applies to inner files."
                >
                  <div className="space-y-1.5">
                    <Label className="text-xs">Asset format</Label>
                    <Select value={formatKey} onValueChange={setFormatKey}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select format" />
                      </SelectTrigger>
                      <SelectContent>
                        {EXTRACT_FORMAT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{selectedFormat.description}</p>
                  </div>

                  <label className="flex items-start gap-2 text-xs">
                    <Checkbox
                      checked={writeMetaBin}
                      onCheckedChange={(v) => setWriteMetaBin(v === true)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">Write meta.bin</span>
                      <span className="block text-muted-foreground">
                        Handled by the Rust extractor when supported for this archive.
                      </span>
                    </span>
                  </label>
                </SectionBlock>

                <div className="flex flex-wrap items-center gap-3 p-4">
                  <Button
                    onClick={() => void handleExtract()}
                    disabled={isExtracting || extractBlockedReason !== null}
                  >
                    {isExtracting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Unpacking...
                      </>
                    ) : (
                      <>
                        <PackageOpen className="h-4 w-4" />
                        Unpack
                      </>
                    )}
                  </Button>
                  {extractBlockedReason && (
                    <p className="text-xs text-muted-foreground">{extractBlockedReason}</p>
                  )}
                </div>
              </SectionPanel>

              <div className="space-y-4">
                <Fhm2dMetadataSummary
                  name={effectiveName}
                  hashName={hashPreview}
                  folderPath={effectiveOutputFolderPath || null}
                  structureJsonPath={effectiveStructureJsonPath || null}
                  repackOutputPath={repackOutputPreview}
                  compact
                />
                <ArchivePreviewPanel
                  preview={preview}
                  canReload={Boolean(inputFilePath.trim())}
                  onReload={() => void loadArchivePreview(inputFilePath)}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent
            value="repack"
            className="mt-0 space-y-4 focus-visible:outline-none"
          >
            <FlowStrip
              from={repackFolderPath || null}
              to={repackDiscovery?.ok ? repackDiscovery.repackOutputPath : null}
            />

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
              <SectionPanel>
                <SectionBlock
                  title="Extracted folder"
                  description={
                    <>
                      The parent directory is searched for{" "}
                      <code className="font-mono">{"{folder}_structure.json"}</code> (or legacy{" "}
                      <code className="font-mono">{"{folder}.json"}</code> carrying
                      SubFileStructure), then the folder is packed through{" "}
                      <code className="font-mono">repack_fhm2d</code>.
                    </>
                  }
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="repack-folder" className="text-xs">
                      Asset folder
                    </Label>
                    <FilePathInput
                      id="repack-folder"
                      value={repackFolderPath}
                      onChange={(e) => setRepackFolderPath(e.target.value)}
                      storeKey="repackInputPath"
                      placeholder="Select extracted folder..."
                      picker={{ kind: "folder", multiple: false }}
                    />
                  </div>
                </SectionBlock>

                <div className="flex flex-wrap items-center gap-3 p-4">
                  <Button
                    onClick={() => void handleRepack()}
                    disabled={isRepacking || repackBlockedReason !== null}
                  >
                    {isRepacking ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Repacking...
                      </>
                    ) : (
                      <>
                        <FolderArchive className="h-4 w-4" />
                        Repack to parent
                      </>
                    )}
                  </Button>
                  {repackBlockedReason && (
                    <p className="text-xs text-muted-foreground">{repackBlockedReason}</p>
                  )}
                </div>
              </SectionPanel>

              <SectionPanel>
                <SectionBlock
                  title="Resolved structure"
                  description="Structure path and HashName-aware output written next to the folder."
                >
                  {!repackFolderPath.trim() && (
                    <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                      Choose an extracted folder to resolve its structure JSON.
                    </p>
                  )}

                  {repackFolderPath.trim() && isDiscovering && (
                    <p className="flex items-center gap-2 rounded-md border border-dashed p-6 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Looking for structure JSON in the parent directory...
                    </p>
                  )}

                  {repackDiscovery && !repackDiscovery.ok && !isDiscovering && (
                    <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                      {repackDiscovery.error}
                    </p>
                  )}

                  {repackDiscovery && repackDiscovery.ok && !isDiscovering && (
                    <div className="space-y-3">
                      <Fhm2dMetadataSummary
                        name={repackDiscovery.name}
                        hashName={repackDiscovery.hashName}
                        folderPath={repackDiscovery.folderPath}
                        structureJsonPath={repackDiscovery.structureJsonPath}
                        repackOutputPath={repackDiscovery.repackOutputPath}
                        compact
                      />
                      {repackDiscovery.missingMetadata && (
                        <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                          Structure JSON has no Name and/or HashName. Output falls back to the
                          structure file stem instead of a hash-based name.
                        </p>
                      )}
                      <dl className="space-y-2 text-[11px]">
                        <div>
                          <dt className="font-medium text-foreground">Match</dt>
                          <dd className="font-mono text-muted-foreground">
                            {repackDiscovery.matchKind}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-foreground">Structure</dt>
                          <dd className="break-all font-mono text-muted-foreground">
                            {repackDiscovery.structureJsonPath}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-foreground">Output</dt>
                          <dd className="break-all font-mono text-muted-foreground">
                            {repackDiscovery.repackOutputPath}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  )}
                </SectionBlock>
              </SectionPanel>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
