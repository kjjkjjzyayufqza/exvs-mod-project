import { memo, useDeferredValue, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCheck,
  ChevronRight,
  Eraser,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  INSPECTOR_LABEL,
  INSPECTOR_ROW,
  INSPECTOR_ROW_COLOR,
  INSPECTOR_SECTION,
  INSPECTOR_SECTION_HEADER,
  INSPECTOR_SELECT_TRIGGER,
  INSPECTOR_VALUE,
  PROP_BTN_ICON,
  PROP_INPUT,
  PROP_PANEL,
} from "./propertyPanelStyles";
import { commitDecimalInput, sanitizeDecimalInput } from "../utils/numericFieldInput";
import {
  GRAPHIC_PARAM_CATEGORIES,
  formatGraphicParamLabel,
  graphicParamNumericConfig,
  groupIndexedGraphicParams,
  isGraphicParamBool,
  rgbPreviewCss,
  type GraphicParam,
  type GraphicParamInspectorRow,
  type IndexedGraphicParam,
} from "../utils/graphicParamInspector";

export type { GraphicParam } from "../utils/graphicParamInspector";

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

const LARGE_CATEGORY_SCROLL_THRESHOLD = 24;
const LARGE_CATEGORY_MAX_HEIGHT = "max-h-80";

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
  const [editKeys, setEditKeys] = useState(false);
  const deferredFilter = useDeferredValue(filter);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => new Set());

  const initialMap = useMemo(() => {
    if (!initialParams) return null;
    const m = new Map<string, string>();
    for (const p of initialParams) m.set(p.key, p.value);
    return m;
  }, [initialParams]);

  const grouped = useMemo(
    () => groupIndexedGraphicParams(params, deferredFilter),
    [params, deferredFilter],
  );

  const totalFilteredCount = useMemo(() => {
    let count = 0;
    for (const items of grouped.values()) count += items.length;
    return count;
  }, [grouped]);

  const appliedCount = appliedKeys.size;
  const filterActive = deferredFilter.trim().length > 0;
  const showNoFilterMatches = filterActive && totalFilteredCount === 0;

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
      <div
        data-testid="graphic-param-panel"
        className="flex min-h-0 flex-col py-2 text-center text-[10px] text-muted-foreground"
      >
        No parameters
      </div>
    );
  }

  return (
    <div data-testid="graphic-param-panel" className={`flex min-h-0 flex-col gap-2 ${PROP_PANEL}`}>
      <div className="flex min-w-0 items-center gap-1">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            placeholder="Search parameters..."
            className={cn(PROP_INPUT, "pl-6")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant={editKeys ? "secondary" : "ghost"}
              className={PROP_BTN_ICON}
              onClick={() => setEditKeys((v) => !v)}
              aria-pressed={editKeys}
            >
              <span className="text-[9px] font-bold tracking-tight">KEY</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[10px]">
            {editKeys ? "Hide raw CSV keys" : "Edit raw CSV keys"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" size="sm" variant="outline" className={PROP_BTN_ICON} onClick={onApplyAll}>
              <CheckCheck className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[10px]">
            Apply all to preview ({params.length})
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" size="sm" variant="outline" className={PROP_BTN_ICON} onClick={onClearApplied}>
              <Eraser className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[10px]">
            Clear preview overrides ({appliedCount})
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" size="sm" variant="outline" className={PROP_BTN_ICON} onClick={onAdd}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[10px]">
            Add parameter
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="flex items-center justify-between px-0.5 text-[9px] text-muted-foreground tabular-nums">
        <span>
          Preview <span className="text-foreground/80">{appliedCount}</span> / {params.length}
        </span>
        {filterActive && (
          <span>
            Showing {totalFilteredCount} match{totalFilteredCount === 1 ? "" : "es"}
          </span>
        )}
      </div>

      {showNoFilterMatches ? (
        <p
          data-testid="graphic-param-filter-empty"
          className="py-2 text-center text-[10px] text-muted-foreground"
        >
          No matching parameters
        </p>
      ) : (
        <div className="space-y-1.5">
          {GRAPHIC_PARAM_CATEGORIES.map((cat) => {
            const items = grouped.get(cat.id);
            if (!items || items.length === 0) return null;
            const collapsed = collapsedCategories.has(cat.id);
            const useBoundedScroll =
              !collapsed && items.length > LARGE_CATEGORY_SCROLL_THRESHOLD;
            return (
              <section key={cat.id} className={INSPECTOR_SECTION}>
                <button
                  type="button"
                  className={INSPECTOR_SECTION_HEADER}
                  onClick={() => toggleCategory(cat.id)}
                >
                  <ChevronRight
                    className={cn("h-3 w-3 shrink-0 transition-transform", !collapsed && "rotate-90")}
                  />
                  <span className="truncate">{cat.label}</span>
                  <span className="ml-auto font-mono text-[9px] opacity-60">{items.length}</span>
                </button>
                {!collapsed && (
                  <div
                    className={cn(
                      "divide-y divide-border/25 py-0.5",
                      useBoundedScroll && `${LARGE_CATEGORY_MAX_HEIGHT} overflow-y-auto overscroll-contain`,
                    )}
                  >
                    {items.map((row) => (
                      <InspectorRow
                        key={row.id}
                        row={row}
                        editKeys={editKeys}
                        appliedKeys={appliedKeys}
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
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface InspectorRowProps {
  row: GraphicParamInspectorRow;
  editKeys: boolean;
  appliedKeys: ReadonlySet<string>;
  initialMap: Map<string, string> | null;
  onValueChange: (index: number, value: string) => void;
  onKeyChange: (index: number, key: string) => void;
  onDelete: (index: number) => void;
  onToggleApplied: (key: string, applied: boolean) => void;
  onResetValue: (index: number) => void;
}

interface ScalarRowProps extends InspectorRowProps {
  param: IndexedGraphicParam;
  row: Extract<GraphicParamInspectorRow, { kind: "scalar" }>;
}

const ScalarInspectorRow = memo(function ScalarInspectorRow({
  param: p,
  editKeys,
  applied,
  initialMap,
  onValueChange,
  onKeyChange,
  onDelete,
  onToggleApplied,
  onResetValue,
}: ScalarRowProps & { applied: boolean }) {
  const slider = graphicParamNumericConfig(p.key, p.value);
  const isBool = isGraphicParamBool(p.key, p.value);
  const originalValue = initialMap?.get(p.key);
  const valueModified = originalValue !== undefined && p.value !== originalValue;
  const label = formatGraphicParamLabel(p.key);

  return (
    <div
      className={cn(
        INSPECTOR_ROW,
        applied && "bg-primary/8 ring-1 ring-inset ring-primary/25",
        valueModified && !applied && "bg-amber-500/8",
      )}
    >
      <ApplyPin checked={applied} onCheckedChange={(checked) => onToggleApplied(p.key, checked)} />
      <div className="min-w-0 self-center">
        {editKeys ? (
          <Input
            className="h-6 min-w-0 px-1 text-left text-[9px] font-mono"
            value={p.key}
            title={p.key}
            onChange={(e) => onKeyChange(p.originalIndex, e.target.value)}
          />
        ) : (
          <span className={INSPECTOR_LABEL} title={p.key}>
            {label}
          </span>
        )}
      </div>
      <div className="min-w-0 justify-self-stretch space-y-0.5">
        <ScalarValueControl
          param={p}
          slider={slider}
          isBool={isBool}
          originalValue={originalValue}
          onValueChange={onValueChange}
        />
        {slider && !isBool && (
          <Slider
            className="h-1 w-full opacity-80 group-hover:opacity-100"
            value={[slider.value]}
            min={slider.min}
            max={slider.max}
            step={slider.step}
            onValueChange={(values) =>
              onValueChange(p.originalIndex, String(values[0] ?? slider.value))
            }
          />
        )}
      </div>
      <RowActions
        valueModified={valueModified}
        originalValue={originalValue}
        onReset={() => onResetValue(p.originalIndex)}
        onDelete={() => onDelete(p.originalIndex)}
      />
    </div>
  );
}, scalarRowPropsAreEqual);

function scalarRowPropsAreEqual(
  prev: ScalarRowProps & { applied: boolean },
  next: ScalarRowProps & { applied: boolean },
): boolean {
  return (
    prev.editKeys === next.editKeys &&
    prev.applied === next.applied &&
    prev.initialMap === next.initialMap &&
    prev.param.originalIndex === next.param.originalIndex &&
    prev.param.key === next.param.key &&
    prev.param.value === next.param.value
  );
}

interface ColorRowProps extends InspectorRowProps {
  row: Extract<GraphicParamInspectorRow, { kind: "color" }>;
}

const ColorInspectorRow = memo(function ColorInspectorRow({
  row,
  editKeys,
  appliedKeys,
  initialMap,
  onValueChange,
  onKeyChange,
  onDelete,
  onToggleApplied,
  onResetValue,
}: ColorRowProps) {
  const { r, g, b } = row.channels;
  const preview = rgbPreviewCss(r.value, g.value, b.value);
  const anyApplied = appliedKeys.has(r.key) || appliedKeys.has(g.key) || appliedKeys.has(b.key);
  const anyModified =
    (initialMap?.get(r.key) !== undefined && r.value !== initialMap.get(r.key)) ||
    (initialMap?.get(g.key) !== undefined && g.value !== initialMap.get(g.key)) ||
    (initialMap?.get(b.key) !== undefined && b.value !== initialMap.get(b.key));

  const toggleAllApplied = (checked: boolean) => {
    onToggleApplied(r.key, checked);
    onToggleApplied(g.key, checked);
    onToggleApplied(b.key, checked);
  };

  return (
    <div
      className={cn(
        INSPECTOR_ROW_COLOR,
        anyApplied && "bg-primary/8 ring-1 ring-inset ring-primary/25",
        anyModified && !anyApplied && "bg-amber-500/8",
      )}
    >
      <ApplyPin
        checked={anyApplied}
        onCheckedChange={(checked) => toggleAllApplied(!!checked)}
      />
      <div className="min-w-0">
        {editKeys ? (
          <span className="truncate font-mono text-[9px] text-muted-foreground" title={r.key}>
            {r.key.replace(/_r$/i, "")}
          </span>
        ) : (
          <span className={INSPECTOR_LABEL} title={`${r.key}, ${g.key}, ${b.key}`}>
            {row.label}
          </span>
        )}
      </div>
      <div className="grid min-w-0 grid-cols-3 gap-0.5">
        {(
          [
            ["R", r, "text-red-400"],
            ["G", g, "text-emerald-400"],
            ["B", b, "text-blue-400"],
          ] as const
        ).map(([axis, channel, tone]) => (
          <div key={axis} className="min-w-0">
            <span className={cn("block text-center text-[8px] font-bold uppercase opacity-60", tone)}>
              {axis}
            </span>
            <ColorChannelInput
              channel={channel}
              editKeys={editKeys}
              initialMap={initialMap}
              onValueChange={onValueChange}
              onKeyChange={onKeyChange}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-0.5">
        <span
          className="h-6 w-6 shrink-0 rounded-sm border border-border/50"
          style={{ backgroundColor: preview }}
          title={preview}
          aria-hidden
        />
        <RowActions
          valueModified={anyModified}
          onReset={() => {
            onResetValue(r.originalIndex);
            onResetValue(g.originalIndex);
            onResetValue(b.originalIndex);
          }}
          onDelete={() => {
            for (const index of [r.originalIndex, g.originalIndex, b.originalIndex].sort(
              (a, b) => b - a,
            )) {
              onDelete(index);
            }
          }}
        />
      </div>
    </div>
  );
});

function InspectorRow(props: InspectorRowProps) {
  if (props.row.kind === "color") {
    return <ColorInspectorRow {...props} row={props.row} />;
  }
  const applied = props.appliedKeys.has(props.row.param.key);
  return <ScalarInspectorRow {...props} param={props.row.param} row={props.row} applied={applied} />;
}

function ApplyPin({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Checkbox
      checked={checked}
      onCheckedChange={(value) => onCheckedChange(!!value)}
      className="h-3.5 w-3.5 shrink-0 rounded-[3px] border-border/80 data-[state=checked]:border-primary data-[state=checked]:bg-primary"
      aria-label="Apply to preview"
    />
  );
}

function ScalarValueControl({
  param,
  slider,
  isBool,
  originalValue,
  onValueChange,
}: {
  param: IndexedGraphicParam;
  slider: ReturnType<typeof graphicParamNumericConfig>;
  isBool: boolean;
  originalValue: string | undefined;
  onValueChange: (index: number, value: string) => void;
}) {
  if (isBool) {
    const on = param.value !== "0" && param.value.toUpperCase() !== "FALSE";
    return (
      <Select
        value={on ? "1" : "0"}
        onValueChange={(value) => onValueChange(param.originalIndex, value)}
      >
        <SelectTrigger className={INSPECTOR_SELECT_TRIGGER}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">On</SelectItem>
          <SelectItem value="0">Off</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  return (
    <input
      className={INSPECTOR_VALUE}
      value={param.value}
      inputMode={slider ? "decimal" : "text"}
      title={param.value}
      onChange={(e) => {
        const next = slider ? sanitizeDecimalInput(e.target.value) : e.target.value;
        onValueChange(param.originalIndex, next);
      }}
      onBlur={(e) => {
        if (!slider) return;
        const next = commitDecimalInput(e.target.value, originalValue ?? param.value);
        if (next !== param.value) onValueChange(param.originalIndex, next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

function ColorChannelInput({
  channel,
  editKeys,
  initialMap,
  onValueChange,
  onKeyChange,
}: {
  channel: IndexedGraphicParam;
  editKeys: boolean;
  initialMap: Map<string, string> | null;
  onValueChange: (index: number, value: string) => void;
  onKeyChange: (index: number, key: string) => void;
}) {
  if (editKeys) {
    return (
      <Input
        className="h-5 min-w-0 px-0.5 text-[8px] font-mono"
        value={channel.key}
        onChange={(e) => onKeyChange(channel.originalIndex, e.target.value)}
      />
    );
  }

  const originalValue = initialMap?.get(channel.key);
  return (
    <input
      className={cn(INSPECTOR_VALUE, "h-5 px-0.5 text-[9px]")}
      value={channel.value}
      inputMode="decimal"
      onChange={(e) =>
        onValueChange(channel.originalIndex, sanitizeDecimalInput(e.target.value))
      }
      onBlur={(e) => {
        const next = commitDecimalInput(e.target.value, originalValue ?? channel.value);
        if (next !== channel.value) onValueChange(channel.originalIndex, next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

function RowActions({
  valueModified,
  originalValue,
  onReset,
  onDelete,
}: {
  valueModified: boolean;
  originalValue?: string;
  onReset: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      {valueModified && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={`inline-flex ${PROP_BTN_ICON} items-center justify-center rounded-sm text-muted-foreground hover:text-foreground`}
              onClick={onReset}
              aria-label="Reset value"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          {originalValue !== undefined && (
            <TooltipContent side="bottom" className="text-[10px]">
              Reset to {originalValue}
            </TooltipContent>
          )}
        </Tooltip>
      )}
      <button
        type="button"
        className={`inline-flex ${PROP_BTN_ICON} items-center justify-center rounded-sm text-muted-foreground hover:text-destructive`}
        onClick={onDelete}
        aria-label="Delete parameter"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
