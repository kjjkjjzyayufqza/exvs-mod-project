import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Plus, Trash2, RotateCcw, ChevronRight } from "lucide-react";
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

// ─── Auto-categorization by key prefix ───

interface CategoryDef {
  id: string;
  label: string;
  match: (key: string) => boolean;
}

const CATEGORIES: CategoryDef[] = [
  {
    id: "lighting",
    label: "Lighting",
    match: (k) => /^(light_|sun_|shadow_|ambient_)/.test(k),
  },
  {
    id: "postprocess",
    label: "Post Process",
    match: (k) => /^(bloom_|dof_|fog_|tonemap_|exposure_|vignette_)/.test(k),
  },
  {
    id: "color",
    label: "Color Grading",
    match: (k) => /^(color_|curveedit_|saturation_|contrast_)/.test(k),
  },
  {
    id: "misc",
    label: "Misc",
    match: () => true,
  },
];

function categorizeParam(key: string): string {
  const lower = key.toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.id !== "misc" && cat.match(lower)) return cat.id;
  }
  return "misc";
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

interface IndexedParam extends GraphicParam {
  originalIndex: number;
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
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => new Set());

  const initialMap = useMemo(() => {
    if (!initialParams) return null;
    const m = new Map<string, string>();
    for (const p of initialParams) m.set(p.key, p.value);
    return m;
  }, [initialParams]);

  const grouped = useMemo(() => {
    const lower = filter.toLowerCase();
    const indexed: IndexedParam[] = params
      .map((p, i) => ({ ...p, originalIndex: i }))
      .filter((p) => !lower || p.key.toLowerCase().includes(lower));

    const groups = new Map<string, IndexedParam[]>();
    for (const p of indexed) {
      const catId = categorizeParam(p.key);
      const arr = groups.get(catId) ?? [];
      arr.push(p);
      groups.set(catId, arr);
    }
    return groups;
  }, [params, filter]);

  const toggleCategory = (id: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

      <div className="space-y-1">
        {CATEGORIES.map((cat) => {
          const items = grouped.get(cat.id);
          if (!items || items.length === 0) return null;
          const collapsed = collapsedCategories.has(cat.id);
          return (
            <div key={cat.id}>
              <button
                type="button"
                className="flex w-full items-center gap-1 rounded-sm px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted/40"
                onClick={() => toggleCategory(cat.id)}
              >
                <ChevronRight
                  className={cn("h-3 w-3 transition-transform", !collapsed && "rotate-90")}
                />
                {cat.label}
                <span className="ml-auto font-mono text-[9px] opacity-60">{items.length}</span>
              </button>
              {!collapsed && (
                <div className="ml-1 space-y-1 border-l border-border/30 pl-2 pt-1">
                  {items.map((p) => (
                    <ParamRow
                      key={`${p.key}-${p.originalIndex}`}
                      param={p}
                      applied={appliedKeys.has(p.key)}
                      initialMap={initialMap}
                      onValueChange={onValueChange}
                      onKeyChange={onKeyChange}
                      onDelete={onDelete}
                      onToggleApplied={onToggleApplied}
                      onResetValue={onResetValue}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ParamRow({
  param: p,
  applied,
  initialMap,
  onValueChange,
  onKeyChange,
  onDelete,
  onToggleApplied,
  onResetValue,
}: {
  param: IndexedParam;
  applied: boolean;
  initialMap: Map<string, string> | null;
  onValueChange: (index: number, value: string) => void;
  onKeyChange: (index: number, key: string) => void;
  onDelete: (index: number) => void;
  onToggleApplied: (key: string, applied: boolean) => void;
  onResetValue: (index: number) => void;
}) {
  const slider = numericConfig(p.key, p.value);
  const originalValue = initialMap?.get(p.key);
  const valueModified = originalValue !== undefined && p.value !== originalValue;

  return (
    <div
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
}
