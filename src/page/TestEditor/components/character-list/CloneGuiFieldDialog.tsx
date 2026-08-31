import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";

import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Fhm2dMetadataSummary, Fhm2dNameField } from "@/components/fhm2d-metadata";
import { Button } from "@/components/ui/button";
import { useConfigStore } from "@/store/configStore";
import { sanitizeFhm2dStructureName } from "@/utils/fhm2dStructureMetadata";
import {
  formatGuiHashHex,
  guiCloneFieldLabel,
  guiCloneFieldNamePrefix,
  occupiedGuiCloneLeafNames,
  overlayClonedGuiPack,
  uniqueGuiCloneStructureName,
  type ClonedGuiPack,
} from "./guiClonePlan";
import {
  fallbackGuiPackagePath,
  normalizeGuiHash,
  vs2GuiExtractRelative,
  type GuiPackPickerItem,
} from "./guiPackIndex";

const CLONE_FIELD_MODAL_DIMENSIONS = {
  width: 560,
  height: 560,
  minWidth: 440,
  minHeight: 400,
};

function selectedItem(
  hash: number,
  items: readonly GuiPackPickerItem[],
): GuiPackPickerItem | null {
  const normalized = normalizeGuiHash(hash);
  return items.find((item) => normalizeGuiHash(item.hash) === normalized) ?? null;
}

function donorNameForField(
  fieldKey: string,
  hash: number,
  items: readonly GuiPackPickerItem[],
): string {
  const item = selectedItem(hash, items);
  if (item?.label.trim()) return sanitizeFhm2dStructureName(item.label);
  return `${guiCloneFieldNamePrefix(fieldKey)}${formatGuiHashHex(hash).slice(2).toLowerCase()}`;
}

export function CloneGuiFieldDialog(props: {
  open: boolean;
  fieldKey: string;
  donorHash: number;
  items: readonly GuiPackPickerItem[];
  targetEntryId: number;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (structureName: string) => void | Promise<void>;
}) {
  const testEditorFolder = useConfigStore((s) => s.testEditorFolder);
  const workspaceRoot = (testEditorFolder ?? "").trim();
  const workspaceGuiRoot = `${workspaceRoot.replace(/[\\/]+$/, "")}\\009gui`;

  const donorName = donorNameForField(props.fieldKey, props.donorHash, props.items);
  const occupiedNames = useMemo(
    () => occupiedGuiCloneLeafNames(props.items),
    [props.items],
  );
  const defaultName = useMemo(
    () => uniqueGuiCloneStructureName(props.fieldKey, props.targetEntryId, occupiedNames),
    [occupiedNames, props.fieldKey, props.targetEntryId],
  );
  const [customName, setCustomName] = useState(defaultName);

  useEffect(() => {
    if (!props.open) return;
    setCustomName(defaultName);
  }, [defaultName, props.open, props.donorHash, props.fieldKey, props.targetEntryId]);

  const previewPack = useMemo<ClonedGuiPack>(() => {
    const item = selectedItem(props.donorHash, props.items);
    const packagePath =
      (item?.packagePath && item.packagePath.trim()) ||
      fallbackGuiPackagePath(props.fieldKey, donorName);
    const workspaceRelative = vs2GuiExtractRelative(packagePath, donorName);
    return {
      fieldKey: props.fieldKey,
      donorName,
      donorHash: normalizeGuiHash(props.donorHash),
      newHash: 0,
      donorFileName: `${formatGuiHashHex(props.donorHash)}.fhm2d`,
      newFileName: "",
      bindTarget: `character_list.${props.fieldKey}`,
      sourcePath: item?.folderPath || item?.packagePath || packagePath,
      outputPath: `${workspaceGuiRoot}\\${workspaceRelative.replace(/\//g, "\\")}`,
      workspaceRelative,
      structureJsonPath: "",
      structureName: donorName,
      innerFileCount: 0,
      obModOutputPath: null,
      byteLen: 0,
    };
  }, [donorName, props.donorHash, props.fieldKey, props.items, workspaceGuiRoot]);

  const displayed = overlayClonedGuiPack(
    previewPack,
    customName,
    props.targetEntryId,
    workspaceGuiRoot,
  );
  const structureName = displayed.structureName;
  const folderTaken = occupiedNames.some(
    (name) => name.trim().toLowerCase() === structureName.toLowerCase(),
  );
  const canConfirm = Boolean(structureName) && !props.busy && props.targetEntryId !== 0;

  if (!props.open) return null;

  return (
    <AppRndModalShell
      titleId={`clone-gui-field-${props.fieldKey}-title`}
      title={`Clone ${guiCloneFieldLabel(props.fieldKey)}`}
      subtitle="Name is the 009gui folder. HashName is CRC32 of that Name. The current field stays on the original hash; pick the clone later if you want it."
      headerIcon={<Copy className="h-5 w-5 text-primary" />}
      dimensions={CLONE_FIELD_MODAL_DIMENSIONS}
      storageKey="app.rnd-size.character-gui-field-clone"
      onClose={() => props.onOpenChange(false)}
      closeDisabled={props.busy}
      footer={
        <div className="flex justify-end gap-2 bg-background px-6 py-4">
          <Button
            variant="outline"
            onClick={() => props.onOpenChange(false)}
            disabled={props.busy}
          >
            Cancel
          </Button>
          <Button
            onClick={() => props.onConfirm(structureName)}
            disabled={!canConfirm}
          >
            <Copy className="mr-2 h-4 w-4" />
            {props.busy ? "Cloning…" : "Clone pack"}
          </Button>
        </div>
      }
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
        <div className="rounded-md border bg-muted/20 p-3 text-sm">
          <div className="font-medium">{guiCloneFieldLabel(props.fieldKey)}</div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">{props.fieldKey}</div>
          <div className="mt-2 font-mono text-xs">
            {formatGuiHashHex(props.donorHash)}
            <span className="px-1 text-muted-foreground">→</span>
            {displayed.newFileName.replace(/\.fhm2d$/i, "")}
          </div>
        </div>
        <Fhm2dNameField
          id={`clone-gui-field-name-${props.fieldKey}`}
          value={customName}
          onChange={setCustomName}
          sourceNameOrPath={formatGuiHashHex(displayed.newHash)}
          routePrefix="009gui"
          folderPath={displayed.outputPath}
          structureJsonPath={displayed.structureJsonPath}
          disabled={props.busy}
          description="Type a readable Name. HashName updates from CRC32 of this Name (same seed as Clone GUI) and is the file the game loads after Repack."
        />
        <Fhm2dMetadataSummary
          compact
          name={structureName}
          hashName={formatGuiHashHex(displayed.newHash)}
          folderPath={displayed.outputPath}
          structureJsonPath={displayed.structureJsonPath}
          repackOutputPath={`${workspaceGuiRoot}\\${displayed.newFileName}`}
        />
        {folderTaken ? (
          <p className="text-sm text-amber-600">
            An extract folder with this Name already exists. Change the Name so the original pack is kept.
          </p>
        ) : null}
      </div>
    </AppRndModalShell>
  );
}
