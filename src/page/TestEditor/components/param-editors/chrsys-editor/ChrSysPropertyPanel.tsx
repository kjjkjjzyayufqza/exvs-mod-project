import { formatHash } from "@/models/commandTable";
import { Input } from "@/components/ui/input";
import { PropertyGroup } from "../shared/PropertyGroup";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";

interface ChrSysPropertyPanelProps {
  entry: TypedParamEntry | null;
  onFieldChange: (key: string, value: number) => void;
}

const FLOAT_BUF = new ArrayBuffer(4);
const FLOAT_DV = new DataView(FLOAT_BUF);

function reinterpretAsFloat(u32: number): number {
  FLOAT_DV.setUint32(0, u32 >>> 0, false);
  return FLOAT_DV.getFloat32(0, false);
}

function isReasonableFloat(f: number): boolean {
  if (!Number.isFinite(f)) return false;
  const abs = Math.abs(f);
  return abs > 1e-6 && abs < 1e6;
}

const VALUE_KEYS = ["valueA", "valueB", "valueC", "valueD"] as const;

function ValueRow({
  label,
  fieldKey,
  entry,
  onFieldChange,
}: {
  label: string;
  fieldKey: string;
  entry: TypedParamEntry;
  onFieldChange: (key: string, value: number) => void;
}) {
  const raw = entry[fieldKey];
  const numVal = typeof raw === "number" ? raw : 0;
  const u32 = numVal >>> 0;
  const floatVal = reinterpretAsFloat(u32);
  const showFloat = isReasonableFloat(floatVal);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] text-muted-foreground">{label}</label>
        <Input
          type="number"
          className="h-7 w-28 text-right font-mono text-[11px]"
          value={numVal}
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 10);
            if (Number.isFinite(parsed)) onFieldChange(fieldKey, parsed);
          }}
        />
      </div>
      <div className="flex items-center justify-end gap-3 text-[9px] text-muted-foreground">
        <span className="font-mono">
          0x{u32.toString(16).toUpperCase().padStart(8, "0")}
        </span>
        {showFloat && (
          <span className="font-mono text-blue-400">
            ~{floatVal.toFixed(4)}f
          </span>
        )}
      </div>
    </div>
  );
}

export function ChrSysPropertyPanel({
  entry,
  onFieldChange,
}: ChrSysPropertyPanelProps) {
  if (!entry) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No entry selected
      </div>
    );
  }

  const hashVal =
    typeof entry.entryId === "number" ? (entry.entryId as number) : 0;

  return (
    <div className="space-y-3 overflow-y-auto p-3">
      <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-1.5">
        <span className="text-[10px] text-muted-foreground">Hash</span>
        <span className="font-mono text-[11px]">{formatHash(hashVal)}</span>
      </div>

      <PropertyGroup label="Values">
        {VALUE_KEYS.map((key) => (
          <ValueRow
            key={key}
            label={key}
            fieldKey={key}
            entry={entry}
            onFieldChange={onFieldChange}
          />
        ))}
      </PropertyGroup>
    </div>
  );
}
