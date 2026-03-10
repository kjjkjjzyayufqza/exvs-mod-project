import { useCallback, useState } from "react";
import { Buffer } from "buffer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DualValueProperty } from "@/components/ui/dual-value-property";
import { StageFileNameStatusIcons } from "./StageFileNameStatusIcons";
import { StageIconIndexPickerPopover } from "./StageIconIndexPickerPopover";
import type { StageDataEntry } from "@/models/stageList";
import type { StageIconIndexPickerItem } from "./StageIconIndexPickerPopover";

const NUMERIC_FIELDS = [
  { name: "id" as const, label: "id" },
  { name: "fileName" as const, label: "fileName" },
  { name: "uniqueIndex" as const, label: "uniqueIndex" },
  { name: "unk1" as const, label: "unk1" },
  { name: "unk2" as const, label: "unk2" },
  { name: "unk3" as const, label: "unk3" },
  { name: "unk4" as const, label: "unk4" },
  { name: "unk5" as const, label: "unk5" },
  { name: "unk6" as const, label: "unk6" },
  { name: "vs_s_d" as const, label: "vs_s_d (加载背景-黑色)" },
  { name: "unk9" as const, label: "unk9" },
  { name: "vs_s_l" as const, label: "vs_s_l (加载背景)" },
  { name: "unk11" as const, label: "unk11" },
  { name: "unk13" as const, label: "unk13" },
  { name: "unk14" as const, label: "unk14" },
  { name: "unk15" as const, label: "unk15" },
  { name: "vs_sn" as const, label: "vs_sn (地图名称图片)" },
  { name: "iconIndex" as const, label: "Icon Index(同时索引两张图)" },
];

interface StageFormProps {
  stage: StageDataEntry;
  index: number;
  onChange: (updated: StageDataEntry) => void;
  obDplCachePath?: string;
  obModPath?: string;
  workspacePath?: string;
  onReveal?: (path: string) => void;
  stageIconIndexPickerItems?: StageIconIndexPickerItem[];
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
  stageIconIndexPickerItems = [],
  stageIconIndexPickerLoading = false,
  stageIconIndexPickerError = null,
}: StageFormProps) {
  const [stageIconIndexPickerOpen, setStageIconIndexPickerOpen] = useState(false);
  const handleFieldChange = useCallback(
    (fieldName: keyof StageDataEntry, value: number) => {
      const updated = { ...stage, [fieldName]: value };
      onChange(updated);
    },
    [stage, onChange]
  );

  const handleNameChange = useCallback(
    (value: string) => {
      const nameData = stage.name;
      const updated = {
        ...stage,
        name: nameData
          ? { ...nameData, Utf8String: value }
          : { Offset: 0, StringBufferData: Buffer.from([0]), Utf8String: value },
      };
      onChange(updated);
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
          value={stage.name?.Utf8String ?? ""}
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
              field.name === "fileName" || field.name === "vs_s_d" || field.name === "vs_s_l" || field.name === "vs_sn" ? (
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
                  items={stageIconIndexPickerItems}
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
