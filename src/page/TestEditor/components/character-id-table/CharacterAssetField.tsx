import React, { useEffect, useMemo, useState } from "react";
import { dirname } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ExternalLink,
  Download,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  Copy,
  Trash2,
} from "lucide-react";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AssetRefInfo } from "./assetRef";
import { extractAsset, getExtractOutputFolderCollisionInfo } from "./extractFhm2d";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { copyAssetAsNew } from "./copyAssetAsNew";
import { removeAssetWorkspace } from "./removeAssetWorkspace";
import { crc32Ieee } from "@/utils/crc32Ieee";
import type { UseResourceRegistryResult } from "@/hooks/useResourceRegistry";
import { UNIT_FIELD_KEY_TO_SLOT } from "@/services/resourceRegistry/types";
import { ResourceSeedField } from "../resource-registry/ResourceSeedField";
import {
  resolveFhm2dPackPaths,
  resolveWorkspaceRouteRoot,
  type ResolvedFhm2dPackPaths,
} from "@/services/testEditorWorkspace/paths";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";

const COPY_AS_NEW_MODAL_DIMENSIONS = {
  width: 520,
  height: 420,
  minWidth: 440,
  minHeight: 320,
};

function normalizePathKey(s: string): string {
  return s.trim().replace(/\\/g, "/").toLowerCase();
}

interface CharacterAssetFieldProps {
  asset: AssetRefInfo;
  /** Test Editor workspace root (e.g. com\file): hash folder + *_structure.json */
  projectRootDir: string;
  /** Extract output folder from settings: same layout as workspace root */
  extractOutputPath: string;
  /** OB dplcache path for CRC32 collision checks */
  obDplCachePath: string;
  /** OB mod folder (e.g. data\x64\mod): packaged .fhm2d */
  obModPath: string;
  workspaceDocument: TestEditorWorkspaceDocument;
  resourceRegistry?: UseResourceRegistryResult;
  onReveal?: (path: string) => void;
  onFieldUpdate?: (fieldKey: string, newValue: number) => void;
}

export const CharacterAssetField: React.FC<CharacterAssetFieldProps> = ({
  asset,
  projectRootDir,
  extractOutputPath,
  obDplCachePath,
  obModPath,
  workspaceDocument,
  resourceRegistry,
  onReveal,
  onFieldUpdate,
}) => {
  const [sourceExists, setSourceExists] = useState<boolean | null>(null);
  const [modExists, setModExists] = useState<boolean | null>(null);
  const [workspaceExists, setWorkspaceExists] = useState<boolean | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copySeed, setCopySeed] = useState("");
  const [isCopyingAsNew, setIsCopyingAsNew] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeWorkspace, setRemoveWorkspace] = useState(true);
  const [removeExtractOutput, setRemoveExtractOutput] = useState(true);
  const [removeModFhm2d, setRemoveModFhm2d] = useState(true);
  const [writeMetaBin, setWriteMetaBin] = useState(false);
  const [extractOverwriteOpen, setExtractOverwriteOpen] = useState(false);
  const [extractCollisionPath, setExtractCollisionPath] = useState("");
  const [pendingExtractTarget, setPendingExtractTarget] = useState<ResolvedFhm2dPackPaths | null>(null);
  const workspaceAssetRootPath =
    asset.workspacePack.existing?.routeRootPath ?? asset.workspacePack.configured.routeRootPath;
  const trimmedSeed = copySeed.trim();
  const copySeedCrcPreview = useMemo(() => {
    const crc = crc32Ieee(trimmedSeed);
    return { hex: crc.hashHex, int32: crc.hashInt32 };
  }, [trimmedSeed]);

  const canCopyAsNew = Boolean(asset.workspacePack.existing && asset.workspacePack.configured.routeRootPath.trim());
  const canRemoveWorkspace = Boolean(projectRootDir?.trim() && workspaceAssetRootPath.trim());
  const canRemoveExtract = Boolean(extractOutputPath?.trim());
  const canRemoveMod = Boolean(obModPath?.trim());
  const extractOutputSameAsWorkspace =
    canRemoveWorkspace &&
    canRemoveExtract &&
    normalizePathKey(extractOutputPath) === normalizePathKey(projectRootDir);

  useEffect(() => {
    if (!removeDialogOpen) return;
    setRemoveWorkspace(canRemoveWorkspace);
    setRemoveExtractOutput(canRemoveExtract && !extractOutputSameAsWorkspace);
    setRemoveModFhm2d(canRemoveMod);
  }, [removeDialogOpen, canRemoveWorkspace, canRemoveExtract, canRemoveMod, extractOutputSameAsWorkspace]);

  useEffect(() => {
    const checkExists = async () => {
      if (asset.sourceFilePath) {
        setSourceExists(await exists(asset.sourceFilePath));
      } else {
        setSourceExists(false);
      }

      if (asset.workspaceFolderPath) {
        setWorkspaceExists(await exists(asset.workspaceFolderPath));
      } else {
        setWorkspaceExists(false);
      }

      if (asset.modFilePath) {
        setModExists(await exists(asset.modFilePath));
      } else {
        setModExists(false);
      }
    };
    checkExists();
  }, [asset.sourceFilePath, asset.workspaceFolderPath, asset.modFilePath]);

  const resolveExtractTarget = async () => {
    if (!extractOutputPath.trim()) {
      throw new Error("Extract output path not configured");
    }
    return resolveFhm2dPackPaths(
      extractOutputPath,
      workspaceDocument,
      asset.routeId,
      asset.hashHex,
    );
  };

  const runExtract = async (target: ResolvedFhm2dPackPaths) => {
    setIsExtracting(true);
    const result = await extractAsset(asset, target, { writeMetaBin });
    setIsExtracting(false);

    if (result.success) {
      if (result.namingWarning) {
        toast.error(`Extracted ${asset.fieldKey} but FHM naming failed`, {
          description: result.namingWarning,
          duration: 20_000,
          action: {
            label: "Open Folder",
            onClick: () => openPath(result.path!),
          },
        });
      } else {
        toast.success(`Extracted ${asset.fieldKey} to output folder`, {
          action: {
            label: "Open Folder",
            onClick: () => openPath(result.path!),
          },
        });
      }
      if (
        result.path &&
        normalizePathKey(result.path) === normalizePathKey(asset.workspacePack.configured.folderPath)
      ) {
        setWorkspaceExists(true);
      }
    } else {
      toast.error(result.error || "Extraction failed");
    }
  };

  const handleExtract = async () => {
    if (isExtracting) {
      return;
    }
    let target: ResolvedFhm2dPackPaths;
    try {
      target = await resolveExtractTarget();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return;
    }
    const { targetDir, folderExists } = await getExtractOutputFolderCollisionInfo(target);
    if (folderExists) {
      setExtractCollisionPath(targetDir);
      setPendingExtractTarget(target);
      setExtractOverwriteOpen(true);
      return;
    }
    await runExtract(target);
  };

  const handleConfirmExtractOverwrite = () => {
    setExtractOverwriteOpen(false);
    const target = pendingExtractTarget;
    setPendingExtractTarget(null);
    if (target) {
      void runExtract(target);
    }
  };

  const handleOpenSourceFolder = async () => {
    if (!asset.sourceFilePath) return;
    try {
      const folderPath = await dirname(asset.sourceFilePath);
      await openPath(folderPath);
    } catch (err) {
      console.error("Failed to open source folder:", err);
      toast.error("Failed to open source folder");
    }
  };

  const handleOpenModFolder = async () => {
    if (!asset.modFilePath) return;
    try {
      const folderPath = await dirname(asset.modFilePath);
      await openPath(folderPath);
    } catch (err) {
      console.error("Failed to open mod folder:", err);
      toast.error("Failed to open mod folder");
    }
  };

  const handleCopyPath = async (path: string) => {
    await writeText(path);
    toast.success("Path copied to clipboard");
  };

  const handleConfirmCopyAsNew = async () => {
    if (!trimmedSeed) {
      toast.error("Please enter a seed string");
      return;
    }
    if (!asset.workspacePack.existing) {
      toast.error("Workspace asset source was not found");
      return;
    }
    if (!asset.workspacePack.configured.routeRootPath.trim()) {
      toast.error("Workspace asset destination is not configured");
      return;
    }

    setIsCopyingAsNew(true);
    try {
      const result = await copyAssetAsNew({
        sourceAssetRootDir: asset.workspacePack.existing.routeRootPath,
        destinationAssetRootDir: asset.workspacePack.configured.routeRootPath,
        oldHashHex: asset.hashHex,
        seed: trimmedSeed,
        fieldKey: asset.fieldKey,
      });

      const unitSlot = UNIT_FIELD_KEY_TO_SLOT[asset.fieldKey] ?? asset.fieldKey.toLowerCase();
      let registrySaved = false;
      if (resourceRegistry) {
        const registerResult = await resourceRegistry.registerWorkspace({
          category: "unit",
          slot: unitSlot,
          seed: trimmedSeed,
          notes: `copy-as-new from ${asset.hashHex}`,
        });
        if (registerResult.ok) {
          registrySaved = true;
        } else if (registerResult.reason === "duplicate_hash") {
          toast.warning("Hash already registered under a different seed");
        }
      }

      onReveal?.(result.newFolderPath);
      setCopyDialogOpen(false);
      setCopySeed("");

      const descriptionParts = [
        `Current ${asset.fieldKey} left unchanged (${asset.hashHex}).`,
        registrySaved
          ? "Seed saved to workspace registry."
          : resourceRegistry
            ? "Seed was not saved to workspace registry."
            : "Workspace registry is unavailable.",
        `Updated fileUrl entries: ${result.updatedFileUrlCount}`,
      ];

      toast.success(`Copied as new: ${result.newHashHex}`, {
        description: descriptionParts.join(" "),
        action: {
          label: "Open New Folder",
          onClick: () => openPath(result.newFolderPath),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message || "Failed to copy as new");
    } finally {
      setIsCopyingAsNew(false);
    }
  };

  const handleConfirmRemove = async () => {
    const takeWorkspace = removeWorkspace && canRemoveWorkspace;
    const takeExtract = removeExtractOutput && canRemoveExtract;
    const takeMod = removeModFhm2d && canRemoveMod;

    if (!takeWorkspace && !takeExtract && !takeMod) {
      toast.error("Select at least one target with a configured path");
      return;
    }

    setIsRemoving(true);
    try {
      const extractOutputAssetRoot = takeExtract
        ? await resolveWorkspaceRouteRoot(extractOutputPath, workspaceDocument, asset.routeId)
        : undefined;
      await removeAssetWorkspace({
        hashHex: asset.hashHex,
        targets: {
          workspaceAssetRoot: takeWorkspace ? workspaceAssetRootPath : undefined,
          extractOutputAssetRoot,
          modDirectory: takeMod ? obModPath : undefined,
        },
      });

      const clearedWorkspaceRow =
        takeWorkspace || (takeExtract && extractOutputSameAsWorkspace);

      if (clearedWorkspaceRow) {
        onFieldUpdate?.(asset.fieldKey, 0);
        setWorkspaceExists(false);
      } else if (takeExtract) {
        setWorkspaceExists(await exists(asset.workspaceFolderPath));
      }

      if (takeMod) {
        setModExists(false);
      }

      setRemoveDialogOpen(false);
      toast.success(`Removed asset data for ${asset.hashHex}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message || "Failed to remove asset data");
    } finally {
      setIsRemoving(false);
    }
  };

  const isZero = asset.rawValue === 0;

  if (isZero) {
    return <span className="text-muted-foreground italic text-xs">None (0)</span>;
  }

  return (
    <div className="flex items-center gap-1 ml-auto">
      {/* Status Icons */}
      <div className="flex items-center gap-0.5 mr-1">
        <StatusIcon 
          exists={sourceExists} 
          label="OB" 
          tooltip={sourceExists ? "Source .fhm2d exists. Click to open folder." : "Source .fhm2d missing"} 
          onClick={sourceExists ? handleOpenSourceFolder : undefined}
        />
        <StatusIcon 
          exists={modExists} 
          label="MOD" 
          tooltip={modExists ? "Mod .fhm2d exists. Click to open folder." : "Mod .fhm2d missing"} 
          onClick={modExists ? handleOpenModFolder : undefined}
        />
        <StatusIcon 
          exists={workspaceExists} 
          label="WS" 
          tooltip={workspaceExists ? "Extracted folder exists in workspace. Click to filter the file tree." : "Not extracted in workspace"} 
          onClick={workspaceExists ? () => onReveal?.(asset.workspaceFolderPath) : undefined}
        />
      </div>

      {/* More Actions */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3" align="end">
          <div className="space-y-3">
            <div>
              <h4 className="font-medium text-sm mb-1">{asset.fieldKey} Asset</h4>
              <p className="text-xs text-muted-foreground font-mono break-all bg-muted p-1.5 rounded">
                {asset.hashHex} ({asset.rawValue})
              </p>
            </div>

            <div className="grid gap-2 overflow-hidden">
              <div className="flex flex-col gap-1 overflow-hidden">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Source (OB)</span>
                <div className="flex items-center justify-between gap-2 overflow-hidden">
                  <span className="text-xs truncate flex-1 bg-muted/30 p-1 rounded" title={asset.sourceFilePath}>
                    {asset.sourceFilePath || "Not configured"}
                  </span>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => handleCopyPath(asset.sourceFilePath)} disabled={!asset.sourceFilePath}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1 overflow-hidden">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Workspace (WS)</span>
                <div className="flex items-center justify-between gap-2 overflow-hidden">
                  <span className="text-xs truncate flex-1 bg-muted/30 p-1 rounded" title={asset.workspaceFolderPath}>
                    {asset.workspaceFolderPath || "Not configured"}
                  </span>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => handleCopyPath(asset.workspaceFolderPath)} disabled={!asset.workspaceFolderPath}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1 overflow-hidden">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Mod (MOD)</span>
                <div className="flex items-center justify-between gap-2 overflow-hidden">
                  <span className="text-xs truncate flex-1 bg-muted/30 p-1 rounded" title={asset.modFilePath}>
                    {asset.modFilePath || "Not configured"}
                  </span>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => handleCopyPath(asset.modFilePath)} disabled={!asset.modFilePath}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {resourceRegistry ? (
              <div className="pt-2 border-t">
                <ResourceSeedField
                  category="unit"
                  slot={UNIT_FIELD_KEY_TO_SLOT[asset.fieldKey] ?? asset.fieldKey.toLowerCase()}
                  label={`Set ${asset.fieldKey} from seed`}
                  compact
                  currentHashInt32={asset.rawValue}
                  obDplCachePath={obDplCachePath}
                  obModPath={obModPath}
                  workspacePath={projectRootDir}
                  workspaceDocument={workspaceDocument}
                  registry={resourceRegistry}
                  onApplyHash={(hashInt32) => onFieldUpdate?.(asset.fieldKey, hashInt32)}
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-2 pt-2 border-t">
              <div className="flex items-center gap-2 w-full min-w-0">
                <Button
                  size="sm"
                  className="flex-1 min-w-0 justify-start gap-2"
                  onClick={handleExtract}
                  disabled={isExtracting || !sourceExists}
                >
                  <Download className="h-3.5 w-3.5 shrink-0" />
                  {isExtracting ? "Extracting..." : "Extract to Output Folder"}
                </Button>
                <label
                  htmlFor={`write-meta-bin-${asset.fieldKey}`}
                  className="flex flex-col items-center justify-center gap-0.5 shrink-0 w-[52px] cursor-pointer select-none rounded border border-border bg-muted/30 px-1 py-1 hover:bg-muted/50"
                  title="Write decompressed FHM2D meta (inflate raw) to meta.bin in the output folder"
                >
                  <Checkbox
                    id={`write-meta-bin-${asset.fieldKey}`}
                    checked={writeMetaBin}
                    onCheckedChange={(v) => setWriteMetaBin(v === true)}
                    disabled={isExtracting || !sourceExists}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-[9px] leading-none text-center text-muted-foreground">meta.bin</span>
                </label>
              </div>
              
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start gap-2"
                onClick={() => openPath(asset.workspaceFolderPath)}
                disabled={!workspaceExists}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open Extracted Folder
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => setCopyDialogOpen(true)}
                disabled={!workspaceExists || !canCopyAsNew}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy as New
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2 text-destructive hover:text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={() => setRemoveDialogOpen(true)}
                disabled={
                  isRemoving ||
                  (!canRemoveWorkspace && !canRemoveExtract && !canRemoveMod)
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove asset data</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left text-sm text-muted-foreground">
                <p>
                  <span className="font-mono text-foreground">{asset.hashHex}</span> — choose what to delete.
                  Clearing the Test Editor workspace field or the same path as extract output sets this table
                  column to 0 (None).
                </p>
                <div className="space-y-2 rounded-md border border-border p-2">
                  <label className="flex cursor-pointer items-start gap-2">
                    <Checkbox
                      checked={removeWorkspace && canRemoveWorkspace}
                      onCheckedChange={(v) => setRemoveWorkspace(v === true)}
                      disabled={!canRemoveWorkspace || isRemoving}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-foreground">Test Editor workspace</span>
                      <span className="block break-all font-mono text-xs">{canRemoveWorkspace ? workspaceAssetRootPath : "(not set)"}</span>
                      <span className="block text-[11px]">Remove {asset.hashHex} folder and {asset.hashHex}_structure.json</span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2">
                    <Checkbox
                      checked={removeExtractOutput && canRemoveExtract}
                      onCheckedChange={(v) => setRemoveExtractOutput(v === true)}
                      disabled={!canRemoveExtract || isRemoving || extractOutputSameAsWorkspace}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-foreground">Extract output folder</span>
                      {extractOutputSameAsWorkspace && (
                        <span className="ml-1 text-[11px] text-amber-600 dark:text-amber-500">(same as workspace)</span>
                      )}
                      <span className="block break-all font-mono text-xs">{extractOutputPath || "(not set)"}</span>
                      <span className="block text-[11px]">Same folder + structure JSON as extract target</span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2">
                    <Checkbox
                      checked={removeModFhm2d && canRemoveMod}
                      onCheckedChange={(v) => setRemoveModFhm2d(v === true)}
                      disabled={!canRemoveMod || isRemoving}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-foreground">Mod (packaged .fhm2d)</span>
                      <span className="block break-all font-mono text-xs">{obModPath || "(not set)"}</span>
                      <span className="block text-[11px]">Remove {asset.hashHex}.fhm2d from mod path</span>
                    </span>
                  </label>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmRemove();
              }}
              disabled={
                isRemoving ||
                !(
                  (removeWorkspace && canRemoveWorkspace) ||
                  (removeExtractOutput && canRemoveExtract) ||
                  (removeModFhm2d && canRemoveMod)
                )
              }
            >
              {isRemoving ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={extractOverwriteOpen} onOpenChange={setExtractOverwriteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Folder already exists</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-left text-sm text-muted-foreground space-y-2">
                <p>
                  Re-extracting will write into the existing output folder. Files may be merged or
                  replaced.
                </p>
                <p className="font-mono text-xs break-all text-foreground">{extractCollisionPath}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isExtracting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmExtractOverwrite();
              }}
              disabled={isExtracting}
            >
              {isExtracting ? "Extracting..." : "Extract"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {copyDialogOpen ? (
        <AppRndModalShell
          titleId={`copy-as-new-${asset.fieldKey}-title`}
          title="Copy as New"
          subtitle="Create a new asset folder from the seed. The current row hash stays unchanged; the seed is saved to the workspace registry."
          headerIcon={<Copy className="h-5 w-5 text-primary" />}
          dimensions={COPY_AS_NEW_MODAL_DIMENSIONS}
          storageKey="app.rnd-size.character-asset-copy-as-new"
          onClose={() => setCopyDialogOpen(false)}
          closeDisabled={isCopyingAsNew}
          footer={
            <div className="flex justify-end gap-2 bg-background px-6 py-4">
              <Button variant="outline" onClick={() => setCopyDialogOpen(false)} disabled={isCopyingAsNew}>
                Cancel
              </Button>
              <Button onClick={() => void handleConfirmCopyAsNew()} disabled={isCopyingAsNew || !trimmedSeed}>
                {isCopyingAsNew ? "Copying..." : "Copy as New"}
              </Button>
            </div>
          }
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-6">
            <div className="space-y-1">
              <Label htmlFor={`copy-seed-${asset.fieldKey}`}>Seed String</Label>
              <Input
                id={`copy-seed-${asset.fieldKey}`}
                value={copySeed}
                onChange={(e) => setCopySeed(e.target.value)}
                placeholder="e.g. model_new_variant"
                disabled={isCopyingAsNew}
              />
            </div>

            <div className="text-xs rounded border bg-muted/40 p-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Current</span>
                <span className="font-mono">{asset.hashHex}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">CRC32 Preview</span>
                <span className="font-mono tabular-nums shrink-0 text-right">
                  {copySeedCrcPreview.hex} / {copySeedCrcPreview.int32}
                </span>
              </div>
            </div>
          </div>
        </AppRndModalShell>
      ) : null}
    </div>
  );
};

const StatusIcon = ({ exists, label, tooltip, onClick }: { exists: boolean | null, label: string, tooltip: string, onClick?: () => void }) => {
  if (exists === null) return <div className="w-3 h-3 animate-pulse bg-muted rounded-full" />;
  
  return (
    <div 
      className={cn(
        "flex items-center gap-0.5 px-1 py-0.5 rounded bg-muted/50 border text-[9px] font-bold transition-colors",
        onClick && "cursor-pointer hover:bg-accent hover:text-accent-foreground active:bg-accent/80"
      )}
      title={tooltip}
      onClick={onClick}
    >
      <span className="text-muted-foreground">{label}</span>
      {exists ? (
        <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />
      ) : (
        <XCircle className="h-2.5 w-2.5 text-destructive" />
      )}
    </div>
  );
};
