import { formatHash } from "@/models/commandTable";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import { PropertyGroup } from "../shared/PropertyGroup";

interface HashCategoryPanelProps {
  entry: TypedParamEntry | null;
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

export function HashCategoryPanel({ entry }: HashCategoryPanelProps) {
  if (!entry) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Select an entry to view its data
      </div>
    );
  }

  const hash =
    typeof entry.entryId === "number" ? (entry.entryId as number) : 0;

  return (
    <div className="space-y-3 overflow-y-auto p-3">
      <PropertyGroup label="Entry Data">
        <div className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-[11px] hover:bg-muted/30">
          <span className="font-medium text-muted-foreground">Hash</span>
          <span className="font-mono">{formatHash(hash)}</span>
        </div>

        {VALUE_KEYS.map((key) => {
          const raw = entry[key];
          const numVal = typeof raw === "number" ? raw : 0;
          const u32 = numVal >>> 0;
          const floatVal = reinterpretAsFloat(u32);
          const showFloat = isReasonableFloat(floatVal);

          return (
            <div
              key={key}
              className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-[11px] hover:bg-muted/30"
            >
              <span className="font-medium text-muted-foreground">{key}</span>
              <div className="flex items-center gap-3 text-right">
                <span className="font-mono">{numVal}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  0x{u32.toString(16).toUpperCase().padStart(8, "0")}
                </span>
                {showFloat && (
                  <span className="font-mono text-[10px] text-blue-400">
                    ~{floatVal.toFixed(4)}f
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </PropertyGroup>
    </div>
  );
}
