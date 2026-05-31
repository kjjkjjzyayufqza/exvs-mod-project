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
  DaeImportBoolField,
  DaeImportFieldRow,
  DaeImportSection,
  daeImportModalSelectContentClass,
} from "./daeImportUi";

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
      <DaeImportSection title="SSBH Output">
        <DaeImportFieldRow label="Base Filename">
          <Input
            className="h-8 text-[11px]"
            value={config.baseFilename}
            onChange={(e) => update("baseFilename", e.target.value)}
          />
        </DaeImportFieldRow>
        <DaeImportFieldRow label="Scale Factor">
          <Input
            className="h-8 text-[11px]"
            type="number"
            step="0.1"
            min="0.01"
            value={config.scaleFactor}
            onChange={(e) => update("scaleFactor", parseFloat(e.target.value) || 1)}
          />
        </DaeImportFieldRow>
        <DaeImportFieldRow label="Up Axis">
          <Select
            value={config.upAxis}
            onValueChange={(v) => update("upAxis", v as SsbhDaeUpAxis)}
          >
            <SelectTrigger className="h-8 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={daeImportModalSelectContentClass}>
              <SelectItem value="y_up" className="text-[11px]">
                Y-Up
              </SelectItem>
              <SelectItem value="z_up" className="text-[11px]">
                Z-Up
              </SelectItem>
            </SelectContent>
          </Select>
        </DaeImportFieldRow>
      </DaeImportSection>

      <DaeImportSection title="Write Targets">
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
          <DaeImportBoolField
            key={key}
            label={label}
            checked={config[key]}
            onCheckedChange={(checked) => update(key, checked)}
          />
        ))}
      </DaeImportSection>
    </>
  );
}
