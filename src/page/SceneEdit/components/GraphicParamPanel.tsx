import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GraphicParam {
  key: string;
  value: string;
}

interface GraphicParamPanelProps {
  params: GraphicParam[];
  appliedKeys: ReadonlySet<string>;
  onValueChange: (index: number, value: string) => void;
  onKeyChange: (index: number, key: string) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
  onToggleApplied: (key: string, applied: boolean) => void;
  onApplyAll: () => void;
  onClearApplied: () => void;
}

function numericConfig(key: string, value: string): { value: number; min: number; max: number; step: number } | null {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return null;
  const lower = key.toLowerCase();
  if (lower.includes("_enable") || value === "0" || value === "1") {
    return { value: n, min: 0, max: 1, step: 1 };
  }
  if (lower.includes("_rot_")) {
    return { value: n, min: -360, max: 360, step: 0.1 };
  }
  if (lower.includes("color") || lower.includes("boost") || lower.includes("intensity") || lower.includes("threshold")) {
    return { value: n, min: Math.min(0, n), max: Math.max(8, n), step: 0.01 };
  }
  if (lower.startsWith("curveedit_")) {
    return { value: n, min: 0, max: Math.max(1, n), step: 0.001 };
  }
  return { value: n, min: Math.min(-10000, n), max: Math.max(10000, n), step: 0.1 };
}

export function GraphicParamPanel({
  params,
  appliedKeys,
  onValueChange,
  onKeyChange,
  onAdd,
  onDelete,
  onToggleApplied,
  onApplyAll,
  onClearApplied,
}: GraphicParamPanelProps) {
  const [filter, setFilter] = useState("");

  const filteredParams = useMemo(() => {
    if (!filter) return params.map((p, i) => ({ ...p, originalIndex: i }));
    const lower = filter.toLowerCase();
    return params
      .map((p, i) => ({ ...p, originalIndex: i }))
      .filter((p) => p.key.toLowerCase().includes(lower));
  }, [params, filter]);

  if (params.length === 0) {
    return (
      <div data-testid="graphic-param-panel" className="flex min-h-0 flex-col py-2 text-center text-[10px] text-muted-foreground">
        No parameters
      </div>
    );
  }

  return (
    <div data-testid="graphic-param-panel" className="flex min-h-0 flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={onApplyAll}>
          Apply all
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={onClearApplied}>
          Clear
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-6 w-6 p-0 ml-auto" onClick={onAdd}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      {params.length > 6 && (
        <Input
          placeholder="Filter..."
          className="h-5 text-[10px]"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}

      <div className="space-y-1">
        {filteredParams.map((p) => {
          const applied = appliedKeys.has(p.key);
          const slider = numericConfig(p.key, p.value);
          return (
            <div
              key={`${p.key}-${p.originalIndex}`}
              className={cn(
                "space-y-1 rounded-sm border border-transparent px-1 py-1 hover:bg-muted/40 group",
                applied && "border-primary/30 bg-primary/5",
              )}
            >
              <div className="flex items-center gap-1.5">
                <Checkbox
                  checked={applied}
                  onCheckedChange={(checked) => onToggleApplied(p.key, !!checked)}
                  className="h-3.5 w-3.5"
                />
                <Input
                  className="h-6 min-w-0 flex-1 text-[10px] font-mono bg-background/60"
                  value={p.key}
                  onChange={(e) => onKeyChange(p.originalIndex, e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onDelete(p.originalIndex)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  className="h-6 w-24 text-[10px] font-mono bg-background/60"
                  value={p.value}
                  onChange={(e) => onValueChange(p.originalIndex, e.target.value)}
                />
                {slider && (
                  <Slider
                    value={[slider.value]}
                    min={slider.min}
                    max={slider.max}
                    step={slider.step}
                    onValueChange={(values) => onValueChange(p.originalIndex, String(values[0] ?? slider.value))}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
