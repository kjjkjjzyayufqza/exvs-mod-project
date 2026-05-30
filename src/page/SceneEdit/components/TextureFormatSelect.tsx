import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DDS_FORMATS } from "@/lib/ddsFormats";

export type DdsFormat = (typeof DDS_FORMATS)[number]["value"];

export { DDS_FORMATS };

interface TextureFormatSelectProps {
  value: DdsFormat;
  onChange: (value: DdsFormat) => void;
  disabled?: boolean;
  triggerClassName?: string;
}

export function TextureFormatSelect({
  value,
  onChange,
  disabled,
  triggerClassName,
}: TextureFormatSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as DdsFormat)}
      disabled={disabled}
    >
      <SelectTrigger className={triggerClassName ?? "h-7 text-xs w-[180px]"}>
        <SelectValue placeholder="Select DDS format" />
      </SelectTrigger>
      <SelectContent>
        {DDS_FORMATS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} className="text-xs">
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
