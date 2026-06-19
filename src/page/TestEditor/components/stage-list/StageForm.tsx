import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DualValueProperty } from "@/components/ui/dual-value-property";
import { StageFileNameStatusIcons } from "./StageFileNameStatusIcons";
import { StageIconIndexPickerPopover } from "./StageIconIndexPickerPopover";
import { StageSaveToRegistryButton } from "./StageSaveToRegistryButton";
import { ResourceSeedField } from "../resource-registry/ResourceSeedField";
import type { UseResourceRegistryResult } from "@/hooks/useResourceRegistry";
import type { StageListEntry } from "@/models/stageListEntry";
import type { StageIconIndexPickerGroup } from "./StageIconIndexPickerPopover";
import { STAGE_HASH_SLOTS } from "@/services/resourceRegistry/types";
import { defaultStageSlotSeed, type StageHashSlot } from "@/services/resourceRegistry/stageRegistrySync";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";

const NUMERIC_FIELDS = [
  { name: "entryId" as const, label: "id" },
  { name: "fileName" as const, label: "fileName" },
  { name: "selectOrderDefault" as const, label: "selectOrderDefault (选关顺序)" },
  { name: "selectOrderAlt" as const, label: "selectOrderAlt (选关顺序-alt)" },
  { name: "recordLookupId" as const, label: "recordLookupId" },
  { name: "randomSelectWeightDefault" as const, label: "randomSelectWeightDefault (随机权重)" },
  { name: "randomSelectWeightAlt" as const, label: "randomSelectWeightAlt (随机权重-alt)" },
  { name: "seriesAltGroupId" as const, label: "seriesAltGroupId" },
  { name: "seriesDefaultGroupId" as const, label: "seriesDefaultGroupId" },
  { name: "vsSD" as const, label: "vs_s_d (加载背景-黑色)" },
  { name: "vsSL" as const, label: "vs_s_l (加载背景)" },
  { name: "vsSn" as const, label: "vs_sn (地图名称图片)" },
  { name: "unk0x0c" as const, label: "unk0x0c" },
  { name: "unk0x14" as const, label: "unk0x14" },
  { name: "unk0x34" as const, label: "unk0x34" },
  { name: "unk0x38" as const, label: "unk0x38" },
  { name: "iconIndex" as const, label: "Icon Index(同时索引两张图)" },
];

const FILE_NAME_FIELDS = new Set(["fileName", "vsSD", "vsSL", "vsSn"]);

interface StageFormProps {
  stage: StageListEntry;
  index: number;
  editable?: boolean;
  onChange: (updated: StageListEntry) => void;
  obDplCachePath?: string;
  obModPath?: string;
  workspaceRootPath?: string;
  stageModelRouteRootPath?: string;
  workspaceDocument?: TestEditorWorkspaceDocument;
  onReveal?: (path: string) => void;
  stageIconIndexPickerGroups?: StageIconIndexPickerGroup[];
  stageIconIndexPickerLoading?: boolean;
  stageIconIndexPickerError?: string | null;
  resourceRegistry?: UseResourceRegistryResult;
}

export function StageForm({
  stage,
  index,
  editable = true,
  onChange,
  obDplCachePath = "",
  obModPath = "",
  workspaceRootPath = "",
  stageModelRouteRootPath = "",
  workspaceDocument,
  onReveal,
  stageIconIndexPickerGroups = [],
  stageIconIndexPickerLoading = false,
  stageIconIndexPickerError = null,
  resourceRegistry,
}: StageFormProps) {
  const [stageIconIndexPickerOpen, setStageIconIndexPickerOpen] = useState(false);
  const [slotSeeds, setSlotSeeds] = useState<Partial<Record<StageHashSlot, string>>>({});

  useEffect(() => {
    if (!resourceRegistry) {
      setSlotSeeds({});
      return;
    }
    const next: Partial<Record<StageHashSlot, string>> = {};
    for (const slot of STAGE_HASH_SLOTS) {
      const hashInt32 = stage[slot] ?? 0;
      if (!hashInt32) {
        continue;
      }
      const known = resourceRegistry.lookupMergedByHash("stage", slot, hashInt32);
      const draft = known?.seed || defaultStageSlotSeed(stage, slot);
      next[slot] = draft;
    }
    setSlotSeeds(next);
  }, [
    resourceRegistry,
    stage.entryId,
    stage.fileName,
    stage.vsSD,
    stage.vsSL,
    stage.vsSn,
  ]);

  const handleSlotSeedChange = useCallback((slot: StageHashSlot, seed: string) => {
    setSlotSeeds((prev) => ({ ...prev, [slot]: seed }));
  }, []);

  const handleFieldChange = useCallback(
    (fieldName: keyof StageListEntry, value: number) => {
      if (!editable) return;
      const updated = { ...stage, [fieldName]: value };
      onChange(updated);
    },
    [editable, stage, onChange]
  );

  const handleNameChange = useCallback(
    (value: string) => {
      if (!editable) return;
      onChange({ ...stage, name: value });
    },
    [editable, stage, onChange]
  );

  const getNumericValue = (fieldName: (typeof NUMERIC_FIELDS)[number]["name"]): number => {
    const value = stage[fieldName];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    return 0;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-muted-foreground">Stage #{index}</div>
          {stage.name?.trim() ? (
            <div className="text-sm font-semibold truncate">{stage.name}</div>
          ) : null}
          <div className="text-[11px] font-mono text-muted-foreground tabular-nums">
            ID: {stage.entryId}
          </div>
        </div>
        {resourceRegistry ? (
          <StageSaveToRegistryButton
            stage={stage}
            index={index}
            workspacePath={workspaceRootPath}
            resourceRegistry={resourceRegistry}
            slotSeeds={slotSeeds}
          />
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`name-${index}`} className="text-xs">name</Label>
        <Input
          id={`name-${index}`}
          type="text"
          value={stage.name ?? ""}
          onChange={(e) => handleNameChange(e.target.value)}
          disabled={!editable}
          className="h-8"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {NUMERIC_FIELDS.map((field) => (
          <DualValueProperty
            key={field.name}
            label={field.label}
            labelExtra={
              FILE_NAME_FIELDS.has(field.name) ? (
                <StageFileNameStatusIcons
                  fileNameValue={getNumericValue(field.name)}
                  obDplCachePath={obDplCachePath}
                  obModPath={obModPath}
                  workspacePath={stageModelRouteRootPath}
                  onReveal={onReveal}
                />
              ) : field.name === "iconIndex" ? (
                <StageIconIndexPickerPopover
                  onSelect={(idx) => handleFieldChange("iconIndex", idx)}
                  groups={stageIconIndexPickerGroups}
                  selectedValue={getNumericValue("iconIndex")}
                  isLoading={stageIconIndexPickerLoading}
                  error={stageIconIndexPickerError}
                  open={stageIconIndexPickerOpen}
                  onOpenChange={setStageIconIndexPickerOpen}
                />
              ) : undefined
            }
            value={getNumericValue(field.name)}
            property={`${field.name}-${index}`}
            editable={editable}
            editingProperty={null}
            editValue=""
            validationError=""
            onStartEdit={() => {}}
            onSaveEdit={() => {}}
            onCancelEdit={() => {}}
            onValueChange={() => {}}
            variant="compact"
            editOnRowClick={false}
            mode="live"
            showHex
            onCommit={(nextValue) => handleFieldChange(field.name, nextValue)}
            onLiveIntInputFocus={
              field.name === "iconIndex" ? () => setStageIconIndexPickerOpen(true) : undefined
            }
            onLiveIntInputClick={
              field.name === "iconIndex" ? () => setStageIconIndexPickerOpen(true) : undefined
            }
          />
        ))}
      </div>

      {resourceRegistry ? (
        <div className="space-y-2 border-t pt-3">
          <div className="text-xs font-medium text-muted-foreground">Resource seeds (CRC32)</div>
          <div className="grid grid-cols-1 gap-2">
            {(["fileName", "vsSD", "vsSL", "vsSn"] as const).map((slot) => (
              <ResourceSeedField
                key={slot}
                category="stage"
                slot={slot}
                label={slot}
                compact
                currentHashInt32={getNumericValue(slot)}
                initialSeed={slotSeeds[slot] ?? defaultStageSlotSeed(stage, slot)}
                obDplCachePath={obDplCachePath}
                obModPath={obModPath}
                workspacePath={workspaceRootPath}
                workspaceDocument={workspaceDocument}
                registry={resourceRegistry}
                onApplyHash={(hashInt32) => handleFieldChange(slot, hashInt32)}
                onSeedChange={(seed) => handleSlotSeedChange(slot, seed)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
