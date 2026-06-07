import { useCallback, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DualValueProperty } from "@/components/ui/dual-value-property";
import { StageFileNameStatusIcons } from "./StageFileNameStatusIcons";
import { StageIconIndexPickerPopover } from "./StageIconIndexPickerPopover";
import type { StageListEntry } from "@/models/stageListEntry";
import type { StageIconIndexPickerGroup } from "./StageIconIndexPickerPopover";

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
  onChange: (updated: StageListEntry) => void;
  obDplCachePath?: string;
  obModPath?: string;
  workspacePath?: string;
  onReveal?: (path: string) => void;
  stageIconIndexPickerGroups?: StageIconIndexPickerGroup[];
  stageIconIndexPickerLoading?: boolean;
  stageIconIndexPickerError?: string | null;
}

export function StageForm({
  stage,
  index,
  onChange,
  obDplCachePath = "",
  obModPath = "",
  workspacePath = "",
  onReveal,
  stageIconIndexPickerGroups = [],
  stageIconIndexPickerLoading = false,
  stageIconIndexPickerError = null,
}: StageFormProps) {
  const [stageIconIndexPickerOpen, setStageIconIndexPickerOpen] = useState(false);
  const handleFieldChange = useCallback(
    (fieldName: keyof StageListEntry, value: number) => {
      const updated = { ...stage, [fieldName]: value };
      onChange(updated);
    },
    [stage, onChange]
  );

  const handleNameChange = useCallback(
    (value: string) => {
      onChange({ ...stage, name: value });
    },
    [stage, onChange]
  );

  const getNumericValue = (fieldName: (typeof NUMERIC_FIELDS)[number]["name"]): number => {
    const value = stage[fieldName];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    return 0;
  };

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium text-muted-foreground">Stage #{index}</div>
      <div className="space-y-1.5">
        <Label htmlFor={`name-${index}`} className="text-xs">name</Label>
        <Input
          id={`name-${index}`}
          type="text"
          value={stage.name ?? ""}
          onChange={(e) => handleNameChange(e.target.value)}
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
                  workspacePath={workspacePath}
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
            editable
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
    </div>
  );
}
