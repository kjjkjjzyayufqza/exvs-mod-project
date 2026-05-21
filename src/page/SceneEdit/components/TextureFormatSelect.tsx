import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const DDS_FORMATS = [
  { value: "BC7_UNORM", label: "BC7 UNORM", description: "High quality color" },
  { value: "BC7_UNORM_SRGB", label: "BC7 sRGB", description: "sRGB color space" },
  { value: "BC5_UNORM", label: "BC5 UNORM", description: "Normal maps (2 ch)" },
  { value: "BC4_UNORM", label: "BC4 UNORM", description: "Single channel (roughness, AO)" },
  { value: "BC1_UNORM", label: "BC1 UNORM", description: "Low quality, small size" },
  { value: "BC3_UNORM", label: "BC3 UNORM", description: "Color + alpha" },
] as const;

export type DdsFormat = (typeof DDS_FORMATS)[number]["value"];

interface TextureFormatSelectProps {
  value: DdsFormat;
  onChange: (value: DdsFormat) => void;
  disabled?: boolean;
}

export function TextureFormatSelect({ value, onChange, disabled }: TextureFormatSelectProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as DdsFormat)} disabled={disabled}>
      <SelectTrigger className="h-7 text-xs w-[180px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DDS_FORMATS.map((fmt) => (
          <SelectItem key={fmt.value} value={fmt.value} className="text-xs">
            <div className="flex items-center gap-2">
              <span className="font-mono">{fmt.label}</span>
              <span className="text-muted-foreground">{fmt.description}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
