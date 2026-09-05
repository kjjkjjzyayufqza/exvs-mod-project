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
import { useTranslation } from "react-i18next";

const NUMERIC_FIELD_NAMES = [
  "entryId",
  "fileName",
  "selectOrderDefault",
  "selectOrderAlt",
  "recordLookupId",
  "randomSelectWeightDefault",
  "randomSelectWeightAlt",
  "seriesAltGroupId",
  "seriesDefaultGroupId",
  "vsSD",
  "vsSL",
  "vsSn",
  "unk0x0c",
  "unk0x14",
  "unk0x34",
  "unk0x38",
  "iconIndex",
] as const;

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
  const { t } = useTranslation("test-stage-list-view");
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

  const getNumericValue = (fieldName: (typeof NUMERIC_FIELD_NAMES)[number]): number => {
    const value = stage[fieldName];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    return 0;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-muted-foreground">{t("form.stageNumber", { index })}</div>
          {stage.name?.trim() ? (
            <div className="text-sm font-semibold truncate">{stage.name}</div>
          ) : null}
          <div className="text-[11px] font-mono text-muted-foreground tabular-nums" data-i18n-ignore="">
            {t("form.idLabel", { id: stage.entryId })}
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
        <Label htmlFor={`name-${index}`} className="text-xs">{t("form.name")}</Label>
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
        {NUMERIC_FIELD_NAMES.map((name) => (
          <DualValueProperty
            key={name}
            label={t(`form.fields.${name}`)}
            labelExtra={
              FILE_NAME_FIELDS.has(name) ? (
                <StageFileNameStatusIcons
                  fileNameValue={getNumericValue(name)}
                  obDplCachePath={obDplCachePath}
                  obModPath={obModPath}
                  stageModelRouteRootPath={stageModelRouteRootPath}
                  onReveal={onReveal}
                />
              ) : name === "iconIndex" ? (
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
            value={getNumericValue(name)}
            property={`${name}-${index}`}
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
            onCommit={(nextValue) => handleFieldChange(name, nextValue)}
            onLiveIntInputFocus={
              name === "iconIndex" ? () => setStageIconIndexPickerOpen(true) : undefined
            }
            onLiveIntInputClick={
              name === "iconIndex" ? () => setStageIconIndexPickerOpen(true) : undefined
            }
          />
        ))}
      </div>

      {resourceRegistry ? (
        <div className="space-y-2 border-t pt-3">
          <div className="text-xs font-medium text-muted-foreground">{t("form.resourceSeeds")}</div>
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
