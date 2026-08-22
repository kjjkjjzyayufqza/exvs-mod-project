import { useCallback, useEffect, useMemo, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { open } from "@tauri-apps/plugin-dialog";
import { ChevronDown, Download, ExternalLink, FolderOpen, Loader2, Replace } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getStoredDialogDefaultPath,
  rememberStoredDialogSelection,
} from "@/utils/dialogDefaultPathStore";
import { TextureReplaceModal } from "@/page/SceneEdit/components/TextureReplaceModal";
import type { DdsFormat } from "@/page/SceneEdit/components/TextureFormatSelect";
import type { TextureManagerEntry } from "@/page/SceneEdit/store/sceneTextureManagerStore";
import {
  exportNutexbToPng,
  replaceNutexbInPlace,
} from "@/page/SceneEdit/utils/sceneTextureConvert";
import {
  updateEffectFolderItemHash,
  type EffectFolderHash,
  type EffectFolderInventory,
  type EffectFolderValidationResult,
} from "@/services/effectFolder/effectFolderService";
import type { EffectListItem } from "./effectFolderEditorUtils";
import { formatEffectFolderHash, parseHashInput } from "./effectFolderEditorUtils";
import {
  EFFECT_FOLDER_EXPORT_TEXTURE_DIALOG_PATH_KEY,
  EFFECT_FOLDER_REPLACE_TEXTURE_DIALOG_PATH_KEY,
} from "./effectFolderEditorSettings";
import { EffectFolder3dPreview } from "./EffectFolder3dPreview";
import { EffectFolderResolutionPanel } from "./EffectFolderResolutionPanel";
import {
  EffectNutexbPreview,
  invalidateEffectNutexbPreviewCache,
} from "./EffectNutexbPreview";
import { crc32Ieee } from "@/utils/crc32Ieee";

type EffectFolderDetailPanelProps = {
  item: EffectListItem | null;
  inventory: EffectFolderInventory | null;
  validation: EffectFolderValidationResult | null;
  /** True while the entry list is hidden, so the preview owns the full panel width. */
  previewExpanded?: boolean;
  previewSuspended?: boolean;
  onOpenAsEffectProject?: (filePath: string) => void;
  onEfxbnWritten?: () => void;
  onStructureMutated?: () => void;
};

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-muted/60 py-1.5 text-[11px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="break-all text-right font-mono">{value}</span>
    </div>
  );
}

function HashValue({ hash, align = "right" }: { hash: EffectFolderHash; align?: "left" | "right" }) {
  return (
    <div className={align === "right" ? "text-right font-mono" : "font-mono"}>
      <div className="text-[11px]">{hash.hex}</div>
      <div className="text-[10px] tabular-nums text-muted-foreground">{hash.signed}</div>
    </div>
  );
}

function HashMetadataRow({ label, hash }: { label: string; hash: EffectFolderHash }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-muted/60 py-1.5 text-[11px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <HashValue hash={hash} />
    </div>
  );
}

function HashBadge({ hash }: { hash: EffectFolderHash }) {
  return (
    <Badge variant="outline" className="h-auto max-w-full whitespace-normal px-2 py-1 font-mono text-[10px] leading-tight">
      <span className="block">{hash.hex}</span>
      <span className="block tabular-nums text-muted-foreground">{hash.signed}</span>
    </Badge>
  );
}

type HashEditMode = "value" | "crc32";

function hashPreviewFromSigned(signed: number): EffectFolderHash {
  const unsigned = signed >>> 0;
  return {
    signed: signed | 0,
    unsigned,
    hex: `0x${unsigned.toString(16).toUpperCase().padStart(8, "0")}`,
  };
}

function EditableFileHashEditor({
  hash,
  fileIndex,
  effectRoot,
  structureJsonPath,
  onSaved,
}: {
  hash: EffectFolderHash | null;
  fileIndex: number;
  effectRoot: string;
  structureJsonPath: string;
  onSaved?: () => void;
}) {
  const [mode, setMode] = useState<HashEditMode>("value");
  const [valueInput, setValueInput] = useState(hash?.hex ?? "");
  const [crcSeed, setCrcSeed] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValueInput(hash?.hex ?? "");
    setCrcSeed("");
    setMode("value");
  }, [fileIndex, hash?.hex, hash?.signed]);

  const resolvedSigned = useMemo(() => {
    if (mode === "value") {
      return parseHashInput(valueInput);
    }
    const seed = crcSeed.trim();
    if (!seed) return null;
    return crc32Ieee(seed).hashInt32;
  }, [crcSeed, mode, valueInput]);

  const resolvedHash =
    resolvedSigned == null ? null : hashPreviewFromSigned(resolvedSigned);
  const dirty =
    resolvedSigned != null &&
    (hash == null || (resolvedSigned | 0) !== (hash.signed | 0));

  const handleApply = useCallback(async () => {
    if (resolvedSigned == null) {
      toast.error(
        mode === "crc32"
          ? "Enter a non-empty string to compute CRC32."
          : "Enter a valid hash (decimal or 0xHEX).",
      );
      return;
    }
    if (!effectRoot.trim() || !structureJsonPath.trim()) {
      toast.error("Effect folder paths are not available.");
      return;
    }

    setBusy(true);
    try {
      const hashId = resolvedSigned | 0;
      await updateEffectFolderItemHash({
        effectRoot,
        structureJsonPath,
        fileIndex,
        hashId,
      });
      const preview = hashPreviewFromSigned(hashId);
      toast.success(`Hash updated to ${preview.hex} (${preview.signed})`);
      onSaved?.();
    } catch (error) {
      toast.error("Failed to update file hash", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  }, [
    effectRoot,
    fileIndex,
    mode,
    onSaved,
    resolvedSigned,
    structureJsonPath,
  ]);

  return (
    <div className="space-y-2 border-b border-muted/60 py-2 text-[11px]">
      <div className="flex items-start justify-between gap-3">
        <span className="shrink-0 text-muted-foreground">Hash</span>
        {hash ? <HashValue hash={hash} /> : (
          <span className="font-mono text-muted-foreground">unset</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          size="sm"
          variant={mode === "value" ? "secondary" : "outline"}
          className="h-7 px-2 text-[10px]"
          disabled={busy}
          onClick={() => setMode("value")}
        >
          Direct value
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "crc32" ? "secondary" : "outline"}
          className="h-7 px-2 text-[10px]"
          disabled={busy}
          onClick={() => setMode("crc32")}
        >
          CRC32 string
        </Button>
      </div>

      {mode === "value" ? (
        <div className="space-y-1">
          <Label htmlFor={`effect-file-hash-value-${fileIndex}`} className="text-[10px] text-muted-foreground">
            Hex or signed/unsigned int
          </Label>
          <Input
            id={`effect-file-hash-value-${fileIndex}`}
            value={valueInput}
            onChange={(event) => setValueInput(event.target.value)}
            placeholder="0xDEADBEEF or -559038737"
            className="h-8 font-mono text-[11px]"
            disabled={busy}
            spellCheck={false}
          />
        </div>
      ) : (
        <div className="space-y-1">
          <Label htmlFor={`effect-file-hash-crc-${fileIndex}`} className="text-[10px] text-muted-foreground">
            Seed string → IEEE CRC32 (UTF-8)
          </Label>
          <Input
            id={`effect-file-hash-crc-${fileIndex}`}
            value={crcSeed}
            onChange={(event) => setCrcSeed(event.target.value)}
            placeholder="resource name seed"
            className="h-8 font-mono text-[11px]"
            disabled={busy}
            spellCheck={false}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 font-mono text-[10px] text-muted-foreground">
          {resolvedHash ? (
            <span>
              Will store int{" "}
              <span className="text-foreground">{resolvedHash.signed}</span>
              {" · "}
              <span className="text-foreground">{resolvedHash.hex}</span>
              {" "}(JSON number)
            </span>
          ) : (
            <span>Preview unavailable until input is valid.</span>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          className="h-7 px-2 text-[10px]"
          disabled={busy || resolvedSigned == null || !dirty}
          onClick={() => void handleApply()}
        >
          {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
          Apply hash
        </Button>
      </div>
    </div>
  );
}

function ModelIdTable({ hashes }: { hashes: EffectFolderHash[] }) {
  if (hashes.length === 0) {
    return <p className="text-[11px] text-muted-foreground">No model IDs.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="h-8 text-[10px]">Hex</TableHead>
            <TableHead className="h-8 text-[10px]">Int32</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {hashes.map((hash, index) => (
            <TableRow key={`${hash.hex}-${hash.signed}-${index}`}>
              <TableCell className="py-1 font-mono text-[10px]">{hash.hex}</TableCell>
              <TableCell className="py-1 font-mono text-[10px] tabular-nums">{hash.signed}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function EffectFolderDetailPanel({
  item,
  inventory,
  validation,
  previewExpanded = false,
  previewSuspended = false,
  onOpenAsEffectProject,
  onEfxbnWritten,
  onStructureMutated,
}: EffectFolderDetailPanelProps) {
  const [fileDetailsOpen, setFileDetailsOpen] = useState(false);
  const focusedItemKey =
    item == null
      ? ""
      : item.category === "models"
        ? `models:${item.model.entryIndex}:${item.model.name}`
        : item.item.path;

  useEffect(() => {
    setFileDetailsOpen(false);
  }, [focusedItemKey]);

  if (!item) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="custom-scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
          <p className="text-xs text-muted-foreground">Select an entry to inspect details.</p>
          {inventory ? <EffectFolderResolutionPanel inventory={inventory} /> : null}
          {validation ? <ValidationResultPanel validation={validation} /> : null}
        </div>
      </div>
    );
  }

  const hashEditContext =
    inventory != null
      ? {
          effectRoot: inventory.effectRoot,
          structureJsonPath: inventory.structureJsonPath,
          onSaved: onStructureMutated,
        }
      : null;

  if (item.category === "efxbn" && inventory) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <EffectFolder3dPreview
            item={item}
            inventory={inventory}
            previewExpanded={previewExpanded}
            previewSuspended={previewSuspended}
            onEfxbnWritten={onEfxbnWritten}
          />
        </div>
        <Collapsible open={fileDetailsOpen} onOpenChange={setFileDetailsOpen} className="shrink-0 border-t bg-background">
          <div className="flex h-9 items-center gap-2 px-3">
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${fileDetailsOpen ? "rotate-0" : "-rotate-90"}`}
                />
                File details
              </Button>
            </CollapsibleTrigger>
            <Badge variant="secondary" className="text-[10px]">
              efxbn
            </Badge>
          </div>
          <CollapsibleContent>
            <div className="custom-scrollbar-thin max-h-[min(40vh,360px)] space-y-4 overflow-y-auto overscroll-contain px-4 pb-4">
              <EfxbnDetail
                item={item}
                onOpenAsEffectProject={onOpenAsEffectProject}
                hashEdit={hashEditContext}
              />
              <EffectFolderResolutionPanel inventory={inventory} />
              {validation ? <ValidationResultPanel validation={validation} /> : null}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="custom-scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-4 p-4">
          {inventory && item.category === "models" ? (
            <EffectFolder3dPreview
              item={item}
              inventory={inventory}
              previewExpanded={previewExpanded}
              previewSuspended={previewSuspended}
              onEfxbnWritten={onEfxbnWritten}
            />
          ) : null}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-semibold">{item.category.toUpperCase()} details</h3>
              <Badge variant="secondary" className="text-[10px]">
                {item.category}
              </Badge>
            </div>

            {item.category === "models" ? <ModelDetail item={item} /> : null}
            {item.category === "textures" || item.category === "other" ? (
              <FileDetail
                item={item}
                onOpenAsEffectProject={onOpenAsEffectProject}
                hashEdit={hashEditContext}
              />
            ) : null}
          </div>

          {inventory ? <EffectFolderResolutionPanel inventory={inventory} /> : null}
          {validation ? <ValidationResultPanel validation={validation} /> : null}
        </div>
      </div>
    </div>
  );
}

function isNutexbFile(path: string, actualExt: string): boolean {
  const lowerPath = path.toLowerCase();
  const lowerExt = actualExt.trim().toLowerCase().replace(/^\./, "");
  return lowerPath.endsWith(".nutexb") || lowerExt === "nutexb";
}

function fileBasename(path: string, fallback: string): string {
  const fromPath = path.replace(/\\/g, "/").split("/").filter(Boolean).pop();
  return (fromPath && fromPath.trim()) || fallback || "texture.nutexb";
}

function toTextureManagerEntry(path: string, filename: string): TextureManagerEntry {
  return {
    id: path,
    filename,
    status: "existing",
    scope: "model",
    infoCategory: null,
    format: "",
    width: 0,
    height: 0,
    sizeBytes: 0,
    referencedBy: [],
    thumbnailDataUrl: null,
    nutexbPath: path,
    sourceImagePath: null,
  };
}

type FileHashEditContext = {
  effectRoot: string;
  structureJsonPath: string;
  onSaved?: () => void;
};

function FileDetail({
  item,
  onOpenAsEffectProject,
  hashEdit,
}: {
  item: Extract<EffectListItem, { category: "textures" | "other" | "efxbn" }>;
  onOpenAsEffectProject?: (filePath: string) => void;
  hashEdit?: FileHashEditContext | null;
}) {
  const file = item.item;
  const lowerPath = file.path.toLowerCase();
  const isEffectProject = lowerPath.endsWith(".effect_project");
  const filename = file.name || file.fileBaseName || fileBasename(file.path, "texture.nutexb");
  const isNutexb = isNutexbFile(file.path, file.actualExt);
  const canEditTexture = isNutexb && !file.missing;

  const [busy, setBusy] = useState<"replace" | "export" | null>(null);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);

  const replaceEntry = useMemo(
    () => (canEditTexture ? toTextureManagerEntry(file.path, filename) : null),
    [canEditTexture, file.path, filename],
  );

  const handleExportPng = useCallback(async () => {
    if (!canEditTexture) return;
    setBusy("export");
    try {
      const output = await exportNutexbToPng({
        nutexbPath: file.path,
        suggestedFilename: filename.replace(/\.nutexb$/i, ".png"),
        dialogPathKey: EFFECT_FOLDER_EXPORT_TEXTURE_DIALOG_PATH_KEY,
      });
      if (output) {
        toast.success(`Exported ${fileBasename(output, "texture.png")}`);
      }
    } catch (error) {
      toast.error("Failed to export nutexb to PNG", { description: String(error) });
    } finally {
      setBusy(null);
    }
  }, [canEditTexture, file.path, filename]);

  const handleReplaceConfirm = useCallback(
    async (ddsFormat: DdsFormat) => {
      if (!canEditTexture) return;
      setReplaceOpen(false);

      const selected = await open({
        title: `Replace ${filename}`,
        multiple: false,
        filters: [{ name: "Images", extensions: ["png", "dds", "tga"] }],
        defaultPath:
          (await getStoredDialogDefaultPath(EFFECT_FOLDER_REPLACE_TEXTURE_DIALOG_PATH_KEY)) ??
          undefined,
      });
      if (typeof selected !== "string" || !selected.trim()) return;

      const sourcePath = selected.trim();
      await rememberStoredDialogSelection(
        EFFECT_FOLDER_REPLACE_TEXTURE_DIALOG_PATH_KEY,
        sourcePath,
        "file",
      );

      setBusy("replace");
      try {
        // Existing target nutexb keeps its footer internal name via convert path.
        await replaceNutexbInPlace({
          sourcePath,
          targetNutexbPath: file.path,
          ddsFormat,
        });
        invalidateEffectNutexbPreviewCache(file.path);
        setPreviewRevision((value) => value + 1);
        toast.success(`Replaced ${filename}`);
      } catch (error) {
        toast.error("Failed to replace effect texture", { description: String(error) });
      } finally {
        setBusy(null);
      }
    },
    [canEditTexture, file.path, filename],
  );

  return (
    <div className="space-y-3">
      {(item.category === "textures" || canEditTexture) && !file.missing ? (
        <EffectNutexbPreview
          path={file.path}
          label={filename}
          revision={previewRevision}
        />
      ) : null}

      <div className="rounded-md border p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-medium">File identity</h4>
          {file.hash ? <HashBadge hash={file.hash} /> : null}
        </div>
        <MetadataRow label="Name" value={file.name || file.fileBaseName} />
        <MetadataRow label="Path" value={file.path} />
        <MetadataRow label="Extension" value={file.actualExt} />
        <MetadataRow label="File index" value={String(file.fileIndex)} />
        {hashEdit ? (
          <EditableFileHashEditor
            hash={file.hash}
            fileIndex={file.fileIndex}
            effectRoot={hashEdit.effectRoot}
            structureJsonPath={hashEdit.structureJsonPath}
            onSaved={hashEdit.onSaved}
          />
        ) : file.hash ? (
          <HashMetadataRow label="Hash" hash={file.hash} />
        ) : null}
        {file.unk2 ? <MetadataRow label="unk2" value={file.unk2} /> : null}
        <MetadataRow label="Missing" value={file.missing ? "yes" : "no"} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void openPath(file.path)}>
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
          Open file
        </Button>
        {canEditTexture ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void handleExportPng()}
              title="Export nutexb to PNG"
            >
              {busy === "export" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-3.5 w-3.5" />
              )}
              Export PNG
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => setReplaceOpen(true)}
              title="Replace texture (keeps nutexb internal name)"
            >
              {busy === "replace" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Replace className="mr-1.5 h-3.5 w-3.5" />
              )}
              Replace
            </Button>
          </>
        ) : null}
        {isEffectProject && onOpenAsEffectProject ? (
          <Button type="button" size="sm" variant="outline" onClick={() => onOpenAsEffectProject(file.path)}>
            Open effect project
          </Button>
        ) : null}
      </div>

      {replaceOpen && replaceEntry ? (
        <TextureReplaceModal
          entry={replaceEntry}
          onClose={() => {
            if (busy === null) setReplaceOpen(false);
          }}
          onConfirm={(ddsFormat) => {
            void handleReplaceConfirm(ddsFormat);
          }}
        />
      ) : null}
    </div>
  );
}

function EfxbnDetail({
  item,
  onOpenAsEffectProject,
  hashEdit,
}: {
  item: Extract<EffectListItem, { category: "efxbn" }>;
  onOpenAsEffectProject?: (filePath: string) => void;
  hashEdit?: FileHashEditContext | null;
}) {
  const file = item.item;
  const summary = file.efxbn;

  return (
    <div className="space-y-3">
      <div className="rounded-md border p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-xs font-medium">Effect resource</h4>
          {file.hash ? <HashBadge hash={file.hash} /> : null}
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px] md:grid-cols-4">
          <div className="rounded-md bg-muted/50 p-2">
            <div className="text-muted-foreground">Effects</div>
            <div className="font-mono text-sm">{summary?.effectCount ?? "-"}</div>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <div className="text-muted-foreground">Model refs</div>
            <div className="font-mono text-sm">{summary?.modelIds.filter((hash) => hash.signed !== 0).length ?? "-"}</div>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <div className="text-muted-foreground">Texture params</div>
            <div className="font-mono text-sm">{summary?.textureParameters.length ?? "-"}</div>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <div className="text-muted-foreground">Unknowns</div>
            <div className="font-mono text-sm">{summary?.todo.unknowns.length ?? "-"}</div>
          </div>
        </div>
      </div>
      <FileDetail
        item={item}
        onOpenAsEffectProject={onOpenAsEffectProject}
        hashEdit={hashEdit}
      />
      {summary ? (
        <div className="space-y-2 rounded-md border p-3">
          <h4 className="text-xs font-medium">EFXBN parse</h4>
          <MetadataRow label="Magic" value={summary.magic} />
          <MetadataRow label="Version/flags" value={String(summary.versionOrFlags)} />
          <MetadataRow label="Effect count" value={String(summary.effectCount)} />
          <MetadataRow label="Model controls" value={String(summary.modelControlConfigCount)} />
          <MetadataRow label="Curve keys" value={`${summary.curveKeyCount} keys`} />
          <MetadataRow label="Texture parameters" value={String(summary.textureParameters.length)} />
          <div className="space-y-2">
            <h5 className="text-[11px] font-medium text-muted-foreground">Model IDs</h5>
            <ModelIdTable hashes={summary.modelIds} />
          </div>
          {summary.effects.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-8 text-[10px]">#</TableHead>
                    <TableHead className="h-8 text-[10px]">Model</TableHead>
                    <TableHead className="h-8 text-[10px]">Animation</TableHead>
                    <TableHead className="h-8 text-[10px]">Control refs</TableHead>
                    <TableHead className="h-8 text-[10px]">textureHandle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.effects.map((effect) => (
                    <TableRow key={effect.index}>
                      <TableCell className="py-1 font-mono text-[10px]">{effect.index}</TableCell>
                      <TableCell className="py-1 font-mono text-[10px]">{effect.modelHash.hex}</TableCell>
                      <TableCell className="py-1 font-mono text-[10px]">{effect.animationHash.hex}</TableCell>
                      <TableCell className="py-1 font-mono text-[10px]">
                        {effect.controlReferences.filter((ref) => ref.selector !== 0 || ref.lookupIndex !== 0).length} active
                      </TableCell>
                      <TableCell className="py-1 font-mono text-[10px] tabular-nums">{effect.textureHandle}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
          {summary.textureParameters.length > 0 ? (
            <div className="space-y-2">
              <h5 className="text-[11px] font-medium text-muted-foreground">Texture parameters</h5>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8 text-[10px]">#</TableHead>
                      <TableHead className="h-8 text-[10px]">Texture</TableHead>
                      <TableHead className="h-8 text-[10px]">Addressing</TableHead>
                      <TableHead className="h-8 text-[10px]">UV pattern</TableHead>
                      <TableHead className="h-8 text-[10px]">Flags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.textureParameters.map((parameter) => (
                      <TableRow key={parameter.index}>
                        <TableCell className="py-1 font-mono text-[10px]">{parameter.index}</TableCell>
                        <TableCell className="py-1 font-mono text-[10px]">{parameter.colorMapHash.hex}</TableCell>
                        <TableCell className="py-1 font-mono text-[10px] tabular-nums">{parameter.addressingMode}</TableCell>
                        <TableCell className="py-1 font-mono text-[10px] tabular-nums">{parameter.uvPatternType}</TableCell>
                        <TableCell className="py-1 font-mono text-[10px]">0x{parameter.textureSettingFlags.toString(16).toUpperCase()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
          {summary.todo.unknowns.length > 0 ? (
            <div className="space-y-2">
              <h5 className="text-[11px] font-medium text-muted-foreground">Unknown follow-up</h5>
              <div className="rounded-md border">
                {summary.todo.unknowns.slice(0, 6).map((item) => (
                  <div key={item.field} className="border-b px-2 py-1.5 text-[11px] last:border-b-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono">{item.field}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {item.status}
                      </Badge>
                    </div>
                    <div className="mt-1 text-muted-foreground">{item.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ModelDetail({ item }: { item: Extract<EffectListItem, { category: "models" }> }) {
  const model = item.model;

  return (
    <div>
      <MetadataRow label="Name" value={model.name} />
      <HashMetadataRow label="Hash" hash={model.hash} />
      <MetadataRow label="Folder unk3" value={String(model.folderUnk3)} />
      <MetadataRow
        label="Missing required"
        value={model.missingRequiredExts.length > 0 ? model.missingRequiredExts.join(", ") : "none"}
      />

      <div className="mt-3">
        <h4 className="mb-2 text-xs font-medium">Model files ({model.files.length})</h4>
        <ul className="space-y-1">
          {model.files.map((file) => (
            <li
              key={file.fileIndex}
              className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-[11px]"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{file.name || file.fileBaseName}</p>
                <p className="truncate font-mono text-[10px] text-muted-foreground">{file.actualExt}</p>
                {file.hash ? (
                  <p className="truncate font-mono text-[10px] text-muted-foreground">{formatEffectFolderHash(file.hash)}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {file.missing ? (
                  <Badge variant="destructive" className="text-[10px]">
                    missing
                  </Badge>
                ) : null}
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => void openPath(file.path)}>
                  <FolderOpen className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ValidationResultPanel({ validation }: { validation: EffectFolderValidationResult }) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-medium">Last validation</h4>
        <Badge variant={validation.valid ? "default" : "destructive"} className="text-[10px]">
          {validation.valid ? "valid" : "invalid"}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
        <span>EFXBN: {validation.summary.efxbnCount}</span>
        <span>Models: {validation.summary.modelCount}</span>
        <span>Textures: {validation.summary.textureCount}</span>
        <span>Unresolved models: {validation.summary.unresolvedModelIdCount}</span>
      </div>
      {validation.errors.length > 0 ? (
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-[11px] text-destructive">
          {validation.errors.map((error, index) => (
            <li key={`${error.phase}-${error.message}-${index}`}>
              [{error.phase}] {error.message}
            </li>
          ))}
        </ul>
      ) : null}
      {validation.warnings.length > 0 ? (
        <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-[11px] text-amber-700 dark:text-amber-300">
          {validation.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
