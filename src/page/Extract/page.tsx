import { useCallback, useEffect, useMemo, useState } from "react";
import JsonView from "@uiw/react-json-view";
import { vscodeTheme } from "@uiw/react-json-view/vscode";
import {
  Archive,
  FolderArchive,
  Loader2,
  PackageOpen,
  RefreshCw,
} from "lucide-react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { discoverStructureJsonBesideFolder, type StructureJsonDiscovery } from "./findStructureJson";

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
    value: Fhm2d_type_format.fhm2d_stage_list,
    label: "Stage list",
    description: "Stage list binary naming.",
    format: Fhm2d_type_format.fhm2d_stage_list,
  },
  {
    value: Fhm2d_type_format.fhm2d_all_nutexb,
    label: "All nutexb",
    description: "Texture-list packages (icons, stage images).",
    format: Fhm2d_type_format.fhm2d_all_nutexb,
  },
];

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: Record<string, unknown>; typeLabel: string }
  | { status: "error"; message: string };

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

export default function ExtractFilePage() {
  const { store, getSetting } = useConfigStore();

  // --- Extract tab state ---
  const [inputFilePath, setInputFilePath] = useState("");
  const [outputFolderPath, setOutputFolderPath] = useState("");
  const [structureName, setStructureName] = useState("");
  const [createSubfolder, setCreateSubfolder] = useState(true);
  const [writeMetaBin, setWriteMetaBin] = useState(false);
  const [formatKey, setFormatKey] = useState<string>("generic");
  const [isExtracting, setIsExtracting] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });

  // --- Repack tab state ---
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
    if (!inputFilePath.trim()) {
      toast.error("Select a .fhm2d file first");
      return;
    }
    if (!outputFolderPath.trim()) {
      toast.error("Select an output folder first");
      return;
    }

    const outputName = sanitizeFhm2dStructureName(structureName || inputStem);
    let targetOutDir = outputFolderPath.trim();
    if (createSubfolder) {
      if (!outputName) {
        toast.error("Extract name is required when creating a subfolder");
        return;
      }
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
        toast.error("Extract finished but FHM naming step failed (files were written)", {
          description: extractResult.namingError,
          duration: 20_000,
        });
      } else {
        toast.success("Extract completed", {
          description: `${targetOutDir}\nStructure: ${targetOutDir}_structure.json`,
          duration: 12_000,
        });
      }
    } catch (error) {
      toast.error("Extract failed", {
        description: error instanceof Error ? error.message : String(error),
        duration: 15_000,
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleRepack = async () => {
    if (isRepacking) return;
    const folder = repackFolderPath.trim();
    if (!folder) {
      toast.error("Select an extracted asset folder first");
      return;
    }
    if (!repackDiscovery || !repackDiscovery.ok) {
      toast.error("Cannot repack", {
        description:
          repackDiscovery && !repackDiscovery.ok
            ? repackDiscovery.error
            : "Structure JSON has not been resolved yet",
      });
      return;
    }

    setIsRepacking(true);
    try {
      const result = await repackFolderUsingStructure({
        structurePath: repackDiscovery.structureJsonPath,
        inputFolderPath: folder,
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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Extract &amp; Repack FHM2D</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Unpack game archives into a named folder with a sibling structure JSON, or repack a
            previously extracted folder using the structure JSON in its parent directory.
          </p>
        </header>

        <Tabs defaultValue="extract" className="flex min-h-0 flex-1 flex-col gap-4">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="extract" className="gap-2">
              <PackageOpen className="h-4 w-4" />
              Extract
            </TabsTrigger>
            <TabsTrigger value="repack" className="gap-2">
              <FolderArchive className="h-4 w-4" />
              Repack
            </TabsTrigger>
          </TabsList>

          <TabsContent value="extract" className="mt-0 space-y-4 focus-visible:outline-none">
            <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Source &amp; output</CardTitle>
                  <CardDescription>
                    Uses the Rust extractor (<code className="text-xs">extract_fhm2d_to_folder</code>
                    ). Choose a format so naming matches the asset type.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="extract-input">FHM2D file</Label>
                    <FilePathInput
                      id="extract-input"
                      value={inputFilePath}
                      onChange={(e) => setInputFilePath(e.target.value)}
                      storeKey="inputFilePath"
                      placeholder="Select .fhm2d…"
                      picker={{ kind: "file", multiple: false }}
                      onPickedValue={(picked) => {
                        if (Array.isArray(picked)) return;
                        setInputFilePath(picked);
                        applySuggestedName(picked);
                        void loadArchivePreview(picked);
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="extract-output">Output folder</Label>
                    <FilePathInput
                      id="extract-output"
                      value={outputFolderPath}
                      onChange={(e) => setOutputFolderPath(e.target.value)}
                      storeKey="outputFolderPath"
                      placeholder="Select output directory…"
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
                        ? "Used for the output folder and sibling structure JSON name."
                        : "Subfolder creation is off, so the selected output folder name becomes Name."
                    }
                  />

                  <div className="space-y-2">
                    <Label>Asset format</Label>
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

                  <Separator />

                  <div className="space-y-3">
                    <p className="text-sm font-medium">Options</p>
                    <label className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={createSubfolder}
                        onCheckedChange={(v) => setCreateSubfolder(v === true)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-medium">Create subfolder using name</span>
                        <span className="block text-xs text-muted-foreground">
                          Writes into output/name/ and name_structure.json beside it.
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={writeMetaBin}
                        onCheckedChange={(v) => setWriteMetaBin(v === true)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-medium">Write meta.bin</span>
                        <span className="block text-xs text-muted-foreground">
                          Handled by the Rust extractor when supported for this archive.
                        </span>
                      </span>
                    </label>
                  </div>

                  <Fhm2dMetadataSummary
                    name={effectiveName}
                    hashName={hashPreview}
                    folderPath={effectiveOutputFolderPath || null}
                    structureJsonPath={effectiveStructureJsonPath || null}
                    repackOutputPath={repackOutputPreview}
                    compact
                  />

                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => void handleExtract()}
                    disabled={isExtracting || !inputFilePath.trim() || !outputFolderPath.trim()}
                  >
                    {isExtracting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Extracting…
                      </>
                    ) : (
                      <>
                        <PackageOpen className="h-4 w-4" />
                        Extract
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              <Card className="min-h-[320px] flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Archive className="h-4 w-4" />
                        Archive preview
                      </CardTitle>
                      <CardDescription>
                        Header and structure from the selected FHM2D (JS parse for inspection only).
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!inputFilePath.trim() || preview.status === "loading"}
                      onClick={() => void loadArchivePreview(inputFilePath)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Reload
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="min-h-0 flex-1 overflow-hidden">
                  {preview.status === "idle" && (
                    <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                      Select a FHM2D file to preview archive metadata.
                    </div>
                  )}
                  {preview.status === "loading" && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Reading archive…
                    </div>
                  )}
                  {preview.status === "error" && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                      {preview.message}
                    </div>
                  )}
                  {preview.status === "ready" && (
                    <div className="h-[min(480px,50vh)] overflow-auto rounded-md border bg-muted/10 p-2">
                      <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Type: {preview.typeLabel}
                      </p>
                      <JsonView
                        style={vscodeTheme}
                        value={preview.data}
                        displayDataTypes={false}
                        collapsed={true}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="repack" className="mt-0 space-y-4 focus-visible:outline-none">
            <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Extracted folder</CardTitle>
                  <CardDescription>
                    Select a folder produced by Extract. The app looks in the parent directory for
                    <code className="mx-1 text-xs">{"{folder}_structure.json"}</code>
                    (or legacy
                    <code className="mx-1 text-xs">{"{folder}.json"}</code>
                    with SubFileStructure), then packs via
                    <code className="mx-1 text-xs">repack_fhm2d</code>.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="repack-folder">Asset folder</Label>
                    <FilePathInput
                      id="repack-folder"
                      value={repackFolderPath}
                      onChange={(e) => setRepackFolderPath(e.target.value)}
                      storeKey="repackInputPath"
                      placeholder="Select extracted folder…"
                      picker={{ kind: "folder", multiple: false }}
                    />
                  </div>

                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => void handleRepack()}
                    disabled={
                      isRepacking ||
                      isDiscovering ||
                      !repackFolderPath.trim() ||
                      !repackDiscovery?.ok
                    }
                  >
                    {isRepacking ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Repacking…
                      </>
                    ) : (
                      <>
                        <FolderArchive className="h-4 w-4" />
                        Repack to parent
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Resolved structure</CardTitle>
                  <CardDescription>
                    Structure path and HashName-aware output next to the folder.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!repackFolderPath.trim() && (
                    <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                      Choose an extracted folder to resolve its structure JSON.
                    </div>
                  )}
                  {repackFolderPath.trim() && isDiscovering && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Looking for structure JSON in parent directory…
                    </div>
                  )}
                  {repackDiscovery && !repackDiscovery.ok && !isDiscovering && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                      {repackDiscovery.error}
                    </div>
                  )}
                  {repackDiscovery && repackDiscovery.ok && !isDiscovering && (
                    <>
                      <Fhm2dMetadataSummary
                        name={repackDiscovery.name}
                        hashName={repackDiscovery.hashName}
                        folderPath={repackDiscovery.folderPath}
                        structureJsonPath={repackDiscovery.structureJsonPath}
                        repackOutputPath={repackDiscovery.repackOutputPath}
                      />
                      {repackDiscovery.missingMetadata && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          Structure JSON is missing Name and/or HashName. Output will use the structure
                          file stem instead of a hash-based name.
                        </p>
                      )}
                      <dl className="grid gap-2 text-xs font-mono text-muted-foreground">
                        <div>
                          <dt className="font-sans font-medium text-foreground">Match</dt>
                          <dd>{repackDiscovery.matchKind}</dd>
                        </div>
                        <div>
                          <dt className="font-sans font-medium text-foreground">Structure</dt>
                          <dd className="break-all">{repackDiscovery.structureJsonPath}</dd>
                        </div>
                        <div>
                          <dt className="font-sans font-medium text-foreground">Output</dt>
                          <dd className="break-all">{repackDiscovery.repackOutputPath}</dd>
                        </div>
                      </dl>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
