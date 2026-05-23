import { useCallback, useMemo, useState } from "react";
import { FolderOpen, ImagePlus, Link2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSceneAssetStore } from "../store/sceneAssetStore";
import { importPngAsNutexb } from "../utils/sceneTextureConvert";
import { TextureFormatSelect, type DdsFormat } from "./TextureFormatSelect";
import {
  PROP_BTN,
  PROP_BTN_ICON,
  PROP_INPUT,
  PROP_LABEL,
  PROP_PANEL,
} from "./propertyPanelStyles";
import { NumatbMaterialEntryEditor } from "@/page/TestEditor/components/ssbh-model-preview/components/NumatbMaterialEntryEditor";
import type { MatlDataJson, MatlEntryJson } from "@/page/TestEditor/components/ssbh-model-preview/types";
import {
  addEntryAttribute,
  removeEntryAttribute,
  updateEntryAttribute,
  updateMaterialLabel,
  updateShaderLabel,
} from "@/page/TestEditor/components/ssbh-model-preview/store/numatbTemplateStoreHelpers";

interface SceneAssetConfigPanelProps {
  assetId: string;
}

export function SceneAssetConfigPanel({ assetId }: SceneAssetConfigPanelProps) {
  const asset = useSceneAssetStore((s) => s.assets[assetId]);
  const setNumatb = useSceneAssetStore((s) => s.setNumatb);
  const setTextureSlot = useSceneAssetStore((s) => s.setTextureSlot);
  const setOutputDir = useSceneAssetStore((s) => s.setOutputDir);
  const propagateFromParent = useSceneAssetStore((s) => s.propagateFromParent);
  const getChildren = useSceneAssetStore((s) => s.getChildren);

  const [ddsFormat, setDdsFormat] = useState<DdsFormat>("BC7_UNORM");
  const [textureName, setTextureName] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<"maya" | "nust">("nust");
  const [selectedEntryIdx, setSelectedEntryIdx] = useState(0);

  const children = useMemo(() => getChildren(assetId), [assetId, getChildren]);

  const currentFile: MatlDataJson | null = useMemo(() => {
    if (!asset) return null;
    return selectedProfile === "maya" ? asset.numatbMaya : asset.numatbNust;
  }, [asset, selectedProfile]);

  const currentEntry: MatlEntryJson | null = useMemo(() => {
    if (!currentFile) return null;
    return currentFile.entries[selectedEntryIdx] ?? null;
  }, [currentFile, selectedEntryIdx]);

  const handleUpdateProfile = useCallback(
    (nextFile: MatlDataJson) => {
      setNumatb(assetId, selectedProfile, nextFile);
      // Propagate to children
      propagateFromParent(assetId);
    },
    [assetId, selectedProfile, setNumatb, propagateFromParent],
  );

  const handleImportTexture = useCallback(async () => {
    if (!asset?.outputDir) {
      toast.error("Set output directory first");
      return;
    }
    const name = textureName.trim() || `texture_${Date.now()}`;
    try {
      const result = await importPngAsNutexb({
        outputDir: asset.outputDir,
        textureName: name,
        ddsFormat,
      });
      if (!result) return;
      setTextureSlot(assetId, name, result.outputNutexbPath);
      propagateFromParent(assetId);
      toast.success(`Imported texture: ${result.nutexbName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [asset?.outputDir, textureName, ddsFormat, assetId, setTextureSlot, propagateFromParent]);

  if (!asset) {
    return (
      <div className="py-2 text-[11px] text-muted-foreground">
        No asset config for this object. Select an imported model or register it as a scene asset.
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${PROP_PANEL}`}>
      <div className="rounded border border-border/60 p-2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <p className={`${PROP_LABEL} truncate`} title={assetId}>
            Asset: {assetId}
          </p>
          {asset.parentAssetId && (
            <span className="flex shrink-0 items-center gap-1 text-[10px] text-blue-400">
              <Link2 className="h-3 w-3" />
              {asset.parentAssetId}
            </span>
          )}
        </div>
        {children.length > 0 && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            {children.length} child clone(s) will inherit changes
          </p>
        )}
      </div>

      <div className="rounded border border-border/60 p-2">
        <Label className={PROP_LABEL}>Output Directory</Label>
        <div className="mt-1 flex min-w-0 gap-1">
          <Input
            value={asset.outputDir ?? ""}
            onChange={(e) => setOutputDir(assetId, e.target.value)}
            className={`${PROP_INPUT} min-w-0 flex-1`}
            placeholder="Set output folder for textures/ssbh..."
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={PROP_BTN_ICON}
            onClick={async () => {
              const dir = await open({ directory: true, title: "Asset output directory" });
              if (typeof dir === "string" && dir.trim()) setOutputDir(assetId, dir.trim());
            }}
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="rounded border border-border/60 p-2">
        <p className={PROP_LABEL}>Import Texture (PNG → nutexb)</p>
        <div className="mt-1 space-y-1.5">
          <div className="flex min-w-0 gap-1">
            <Input
              value={textureName}
              onChange={(e) => setTextureName(e.target.value)}
              className={`${PROP_INPUT} min-w-0 flex-1`}
              placeholder="Texture name (e.g. basecolor)"
            />
            <TextureFormatSelect
              value={ddsFormat}
              onChange={setDdsFormat}
              triggerClassName={`${PROP_INPUT} w-[7.5rem] shrink-0 px-2`}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`${PROP_BTN} w-full`}
            onClick={handleImportTexture}
          >
            <ImagePlus className="mr-1 h-3.5 w-3.5" />
            Pick PNG & Convert to nutexb
          </Button>
        </div>

        {Object.keys(asset.textureOverrides).length > 0 && (
          <div className="mt-2 space-y-0.5">
            <p className="text-[10px] text-muted-foreground">Texture Slots:</p>
            {Object.entries(asset.textureOverrides).map(([paramId, path]) => (
              <div key={paramId} className="flex min-w-0 items-center gap-1 text-[10px]">
                <span className="shrink-0 font-mono text-muted-foreground">{paramId}</span>
                <span className="min-w-0 truncate text-muted-foreground/80">{path.split(/[/\\]/).pop()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded border border-border/60 p-2">
        <p className={PROP_LABEL}>Material (numatb)</p>
        <Tabs value={selectedProfile} onValueChange={(v) => setSelectedProfile(v as "maya" | "nust")}>
          <TabsList className="mt-1 grid h-7 w-full grid-cols-2">
            <TabsTrigger value="nust" className="h-6 text-[10px]">__nust__</TabsTrigger>
            <TabsTrigger value="maya" className="h-6 text-[10px]">__maya__</TabsTrigger>
          </TabsList>
        </Tabs>

        {currentFile && currentFile.entries.length > 0 && (
          <div className="mt-1.5">
            <select
              className={`${PROP_INPUT} w-full appearance-none rounded-md border border-input`}
              value={selectedEntryIdx}
              onChange={(e) => setSelectedEntryIdx(Number(e.target.value))}
            >
              {currentFile.entries.map((entry, i) => (
                <option key={i} value={i}>{entry.material_label}</option>
              ))}
            </select>
          </div>
        )}

        {currentFile && currentEntry && (
          <ScrollArea className="mt-1.5 max-h-[280px]">
            <NumatbMaterialEntryEditor
              entry={currentEntry}
              onChangeMaterialLabel={(label) => {
                handleUpdateProfile(updateMaterialLabel(currentFile, selectedEntryIdx, label));
              }}
              onChangeShaderLabel={(shader) => {
                handleUpdateProfile(updateShaderLabel(currentFile, selectedEntryIdx, shader));
              }}
              onUpdateAttribute={(attrIdx, data) => {
                handleUpdateProfile(updateEntryAttribute(currentFile, selectedEntryIdx, attrIdx, data));
              }}
              onAddAttribute={(paramId, kind) => {
                handleUpdateProfile(addEntryAttribute(currentFile, selectedEntryIdx, paramId, kind));
              }}
              onRemoveAttribute={(attrIdx) => {
                handleUpdateProfile(removeEntryAttribute(currentFile, selectedEntryIdx, attrIdx));
              }}
            />
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
