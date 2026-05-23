import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SsbhImportConfig, SsbhDaeUpAxis } from "./daeImportTypes";
import {
  UnrealDetailsSection,
  UnrealPropertyBool,
  UnrealPropertyRow,
  unrealInputClass,
  unrealSelectTriggerClass,
} from "./daeImportUnrealUi";

interface DaeImportSsbhConfigPanelProps {
  config: SsbhImportConfig;
  onChange: (next: SsbhImportConfig) => void;
}

export function DaeImportSsbhConfigPanel({
  config,
  onChange,
}: DaeImportSsbhConfigPanelProps) {
  const update = <K extends keyof SsbhImportConfig>(
    key: K,
    value: SsbhImportConfig[K],
  ) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <>
      <UnrealDetailsSection title="SSBH Output">
        <UnrealPropertyRow label="Base Filename">
          <Input
            className={unrealInputClass}
            value={config.baseFilename}
            onChange={(e) => update("baseFilename", e.target.value)}
          />
        </UnrealPropertyRow>
        <UnrealPropertyRow label="Scale Factor">
          <Input
            className={unrealInputClass}
            type="number"
            step="0.1"
            min="0.01"
            value={config.scaleFactor}
            onChange={(e) => update("scaleFactor", parseFloat(e.target.value) || 1)}
          />
        </UnrealPropertyRow>
        <UnrealPropertyRow label="Up Axis">
          <Select
            value={config.upAxis}
            onValueChange={(v) => update("upAxis", v as SsbhDaeUpAxis)}
          >
            <SelectTrigger className={unrealSelectTriggerClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none border-[#3a3a3a] bg-[#151515] text-[#e8e8e8]">
              <SelectItem value="y_up" className="text-[11px] focus:bg-[#2a2a2a] focus:text-white">
                Y-Up
              </SelectItem>
              <SelectItem value="z_up" className="text-[11px] focus:bg-[#2a2a2a] focus:text-white">
                Z-Up
              </SelectItem>
            </SelectContent>
          </Select>
        </UnrealPropertyRow>
      </UnrealDetailsSection>

      <UnrealDetailsSection title="Write Targets">
        {(
          [
            ["writeNumdlb", "numdlb"],
            ["writeNumshb", "numshb"],
            ["writeNusktb", "nusktb"],
            ["writeNumatb", "numatb"],
            ["writeJnttbl", "jnttbl"],
            ["writeMayaProfile", "Maya Profile"],
          ] as const
        ).map(([key, label]) => (
          <UnrealPropertyBool
            key={key}
            label={label}
            checked={config[key]}
            onCheckedChange={(checked) => update(key, checked)}
          />
        ))}
      </UnrealDetailsSection>
    </>
  );
}
