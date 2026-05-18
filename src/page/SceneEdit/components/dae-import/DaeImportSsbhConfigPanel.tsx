import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SsbhImportConfig, SsbhDaeUpAxis } from "./daeImportTypes";

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
    <div className="space-y-3 rounded-md border border-border/50 p-3 ml-5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        SSBH Configuration
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Base filename</Label>
          <Input
            className="h-7 text-xs"
            value={config.baseFilename}
            onChange={(e) => update("baseFilename", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Scale factor</Label>
          <Input
            className="h-7 text-xs"
            type="number"
            step="0.1"
            min="0.01"
            value={config.scaleFactor}
            onChange={(e) =>
              update("scaleFactor", parseFloat(e.target.value) || 1)
            }
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Up axis</Label>
        <Select
          value={config.upAxis}
          onValueChange={(v) => update("upAxis", v as SsbhDaeUpAxis)}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="y_up">Y-Up</SelectItem>
            <SelectItem value="z_up">Z-Up</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-x-4 gap-y-1">
        {(
          [
            ["writeNumdlb", "numdlb"],
            ["writeNumshb", "numshb"],
            ["writeNusktb", "nusktb"],
            ["writeNumatb", "numatb"],
            ["writeJnttbl", "jnttbl"],
            ["writeMayaProfile", "Maya profile"],
          ] as const
        ).map(([key, label]) => (
          <label
            key={key}
            className="flex items-center gap-1.5 text-xs cursor-pointer"
          >
            <Checkbox
              checked={config[key]}
              onCheckedChange={(checked) => update(key, checked === true)}
              className="h-3.5 w-3.5"
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}
