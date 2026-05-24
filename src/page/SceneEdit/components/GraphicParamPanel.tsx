import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Plus, Trash2, RotateCcw } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  PROP_BTN,
  PROP_BTN_ICON,
  PROP_INPUT,
  PROP_PANEL,
} from "./propertyPanelStyles";
import { commitDecimalInput, sanitizeDecimalInput } from "../utils/numericFieldInput";

export interface GraphicParam {
  key: string;
  value: string;
}

interface GraphicParamPanelProps {
  params: GraphicParam[];
  initialParams: GraphicParam[] | null;
  appliedKeys: ReadonlySet<string>;
  onValueChange: (index: number, value: string) => void;
  onKeyChange: (index: number, key: string) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
  onToggleApplied: (key: string, applied: boolean) => void;
  onApplyAll: () => void;
  onClearApplied: () => void;
  onResetValue: (index: number) => void;
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
  initialParams,
  appliedKeys,
  onValueChange,
  onKeyChange,
  onAdd,
  onDelete,
  onToggleApplied,
  onApplyAll,
  onClearApplied,
  onResetValue,
}: GraphicParamPanelProps) {
  const [filter, setFilter] = useState("");

  const initialMap = useMemo(() => {
    if (!initialParams) return null;
    const m = new Map<string, string>();
    for (const p of initialParams) m.set(p.key, p.value);
    return m;
  }, [initialParams]);

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
    <div data-testid="graphic-param-panel" className={`flex min-h-0 flex-col gap-2 ${PROP_PANEL}`}>
      <div className="flex min-w-0 items-center gap-1">
        <Button type="button" size="sm" variant="outline" className={PROP_BTN} onClick={onApplyAll}>
          Apply all
        </Button>
        <Button type="button" size="sm" variant="outline" className={PROP_BTN} onClick={onClearApplied}>
          Clear
        </Button>
        <Button type="button" size="sm" variant="outline" className={`${PROP_BTN_ICON} ml-auto`} onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {params.length > 6 && (
        <Input
          placeholder="Filter..."
          className={PROP_INPUT}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}

      <div className="space-y-1.5">
        {filteredParams.map((p) => {
          const applied = appliedKeys.has(p.key);
          const slider = numericConfig(p.key, p.value);
          const originalValue = initialMap?.get(p.key);
          const valueModified = originalValue !== undefined && p.value !== originalValue;
          return (
            <div
              key={`${p.key}-${p.originalIndex}`}
              className={cn(
                "min-w-0 space-y-1.5 rounded-sm border border-transparent px-1 py-1.5 hover:bg-muted/40 group",
                applied && "border-primary/30 bg-primary/5",
                valueModified && "bg-yellow-500/10",
              )}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <Checkbox
                  checked={applied}
                  onCheckedChange={(checked) => onToggleApplied(p.key, !!checked)}
                  className="h-4 w-4 shrink-0"
                />
                <Input
                  className={`${PROP_INPUT} flex-1`}
                  value={p.key}
                  onChange={(e) => onKeyChange(p.originalIndex, e.target.value)}
                />
                {valueModified && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className={`inline-flex ${PROP_BTN_ICON} items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground`}
                        onClick={() => onResetValue(p.originalIndex)}
                      >
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-[10px]">Reset to: {originalValue}</TooltipContent>
                  </Tooltip>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={`${PROP_BTN_ICON} text-muted-foreground hover:text-destructive`}
                  onClick={() => onDelete(p.originalIndex)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Input
                  className={PROP_INPUT}
                  value={p.value}
                  inputMode={slider ? "decimal" : "text"}
                  onChange={(e) => {
                    const next = slider
                      ? sanitizeDecimalInput(e.target.value)
                      : e.target.value;
                    onValueChange(p.originalIndex, next);
                  }}
                  onBlur={(e) => {
                    if (!slider) return;
                    const next = commitDecimalInput(
                      e.target.value,
                      originalValue ?? p.value,
                    );
                    if (next !== p.value) onValueChange(p.originalIndex, next);
                  }}
                />
                {slider && (
                  <Slider
                    className="w-full"
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
