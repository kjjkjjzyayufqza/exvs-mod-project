import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  PROP_BTN,
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
  onAdd: (entries: GraphicParam[]) => void;
  onDelete: (index: number) => void;
  onToggleApplied: (key: string, applied: boolean) => void;
  onApplyAll: () => void;
  onClearApplied: () => void;
  onResetValue: (index: number) => void;
}

const LARGE_CATEGORY_SCROLL_THRESHOLD = 24;
const LARGE_CATEGORY_MAX_HEIGHT = "max-h-80";
const GRAPHIC_PARAM_ROW_ESTIMATE_PX = 34;
const DEFAULT_ADD_GROUP_ID = "lighting";
type GraphicParamAddMode = "scalar" | "rgb";

const GRAPHIC_PARAM_ADD_PRESETS: Record<
  string,
  { scalarKey: string; colorStem: string; value: string; note: string }
> = {
  lighting: {
    scalarKey: "light_custom_param",
    colorStem: "light_custom_color",
    value: "0",
    note: "Stage light, sun, shadow, and ambient controls.",
  },
  postprocess: {
    scalarKey: "fog_custom_param",
    colorStem: "fog_custom_color",
    value: "0",
    note: "Fog, bloom, exposure, tone mapping, and screen effects.",
  },
  color: {
    scalarKey: "color_custom_param",
    colorStem: "color_custom_grade",
    value: "1",
    note: "Color grading, curve edit, saturation, and contrast values.",
  },
  misc: {
    scalarKey: "custom_param",
    colorStem: "custom_color",
    value: "0",
    note: "Use only when the key does not belong to a known renderer group.",
  },
};

function getGraphicParamAddPreset(groupId: string) {
  return GRAPHIC_PARAM_ADD_PRESETS[groupId] ?? GRAPHIC_PARAM_ADD_PRESETS.misc;
}

function normalizeGraphicParamDraftKey(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function makeUniqueGraphicParamKey(existingKeys: ReadonlySet<string>, baseKey: string): string {
  if (!baseKey) return "";
  if (!existingKeys.has(baseKey)) return baseKey;
  let suffix = 2;
  while (existingKeys.has(`${baseKey}_${suffix}`)) suffix += 1;
  return `${baseKey}_${suffix}`;
}

function makeUniqueGraphicParamStem(existingKeys: ReadonlySet<string>, baseStem: string): string {
  if (!baseStem) return "";
  const hasRgb = (stem: string) =>
    existingKeys.has(`${stem}_r`) ||
    existingKeys.has(`${stem}_g`) ||
    existingKeys.has(`${stem}_b`);
  if (!hasRgb(baseStem)) return baseStem;
  let suffix = 2;
  while (hasRgb(`${baseStem}_${suffix}`)) suffix += 1;
  return `${baseStem}_${suffix}`;
}

function buildGraphicParamAddEntries(
  params: readonly GraphicParam[],
  mode: GraphicParamAddMode,
  keyDraft: string,
  valueDraft: string,
): GraphicParam[] {
  const existingKeys = new Set(params.map((param) => param.key));
  const normalizedKey = normalizeGraphicParamDraftKey(keyDraft);
  if (!normalizedKey) return [];

  if (mode === "rgb") {
    const stem = makeUniqueGraphicParamStem(existingKeys, normalizedKey.replace(/_[rgb]$/i, ""));
    if (!stem) return [];
    return (["r", "g", "b"] as const).map((channel) => ({
      key: `${stem}_${channel}`,
      value: valueDraft || "0",
    }));
  }

  return [
    {
      key: makeUniqueGraphicParamKey(existingKeys, normalizedKey),
      value: valueDraft || "0",
    },
  ];
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
  const { t } = useTranslation("scene-structure-graphic");
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
        className={`flex min-h-0 flex-col items-center gap-2 py-3 text-center text-[10px] text-muted-foreground ${PROP_PANEL}`}
      >
        <span>{t("graphic.noParameters")}</span>
        <AddParameterPopover params={params} initialGroupId={DEFAULT_ADD_GROUP_ID} onAdd={onAdd}>
          <Button type="button" size="sm" variant="outline" className={cn(PROP_BTN, "gap-1")}>
            <Plus className="h-3.5 w-3.5" />
            {t("graphic.addParameter")}
          </Button>
        </AddParameterPopover>
      </div>
    );
  }

  return (
    <div data-testid="graphic-param-panel" className={`flex min-h-0 flex-col gap-2 ${PROP_PANEL}`}>
      <div className="flex min-w-0 items-center gap-1">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            placeholder={t("graphic.searchPlaceholder")}
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
            {editKeys ? t("graphic.hideRawKeys") : t("graphic.editRawKeys")}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" size="sm" variant="outline" className={PROP_BTN_ICON} onClick={onApplyAll}>
              <CheckCheck className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[10px]">
            {t("graphic.applyAll", { count: params.length })}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" size="sm" variant="outline" className={PROP_BTN_ICON} onClick={onClearApplied}>
              <Eraser className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[10px]">
            {t("graphic.clearApplied", { count: appliedCount })}
          </TooltipContent>
        </Tooltip>
        <AddParameterPopover params={params} initialGroupId={DEFAULT_ADD_GROUP_ID} onAdd={onAdd}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={PROP_BTN_ICON}
            aria-label={t("graphic.addParameter")}
            title={t("graphic.addParameter")}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </AddParameterPopover>
      </div>

      <div className="flex items-center justify-between px-0.5 text-[9px] text-muted-foreground tabular-nums">
        <span>
          {t("graphic.previewCount", { applied: appliedCount, total: params.length })}
        </span>
        {filterActive && (
          <span>
            {t("graphic.showingMatches", { count: totalFilteredCount })}
          </span>
        )}
      </div>

      {showNoFilterMatches ? (
        <p
          data-testid="graphic-param-filter-empty"
          className="py-2 text-center text-[10px] text-muted-foreground"
        >
          {t("graphic.noMatchingParameters")}
        </p>
      ) : (
        <div className="space-y-1.5">
          {GRAPHIC_PARAM_CATEGORIES.map((cat) => {
            const items = grouped.get(cat.id);
            if (!items || items.length === 0) return null;
            const collapsed = collapsedCategories.has(cat.id);
            return (
              <section key={cat.id} className={INSPECTOR_SECTION}>
                <div className={INSPECTOR_SECTION_HEADER}>
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    onClick={() => toggleCategory(cat.id)}
                  >
                    <ChevronRight
                      className={cn("h-3 w-3 shrink-0 transition-transform", !collapsed && "rotate-90")}
                    />
                    <span className="truncate">{t(`graphic.categories.${cat.id}`)}</span>
                    <span className="ml-auto font-mono text-[9px] opacity-60">{items.length}</span>
                  </button>
                  <AddParameterPopover params={params} initialGroupId={cat.id} onAdd={onAdd} align="end">
                    <button
                      type="button"
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-70 hover:bg-background/80 hover:text-foreground hover:opacity-100"
                      aria-label={t("graphic.addCategoryParameter", { category: t(`graphic.categories.${cat.id}`) })}
                      title={t("graphic.addCategoryParameter", { category: t(`graphic.categories.${cat.id}`) })}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </AddParameterPopover>
                </div>
                {!collapsed && (
                  <GraphicParamCategoryRows
                    items={items}
                    editKeys={editKeys}
                    appliedKeys={appliedKeys}
                    initialMap={initialMap}
                    onValueChange={onValueChange}
                    onKeyChange={onKeyChange}
                    onDelete={onDelete}
                    onToggleApplied={onToggleApplied}
                    onResetValue={onResetValue}
                  />
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GraphicParamCategoryRows({
  items,
  editKeys,
  appliedKeys,
  initialMap,
  onValueChange,
  onKeyChange,
  onDelete,
  onToggleApplied,
  onResetValue,
}: {
  items: GraphicParamInspectorRow[];
  editKeys: boolean;
  appliedKeys: ReadonlySet<string>;
  initialMap: Map<string, string> | null;
  onValueChange: (index: number, value: string) => void;
  onKeyChange: (index: number, key: string) => void;
  onDelete: (index: number) => void;
  onToggleApplied: (key: string, applied: boolean) => void;
  onResetValue: (index: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const getScrollElement = useCallback(() => scrollRef.current, []);
  const shouldVirtualize = items.length > LARGE_CATEGORY_SCROLL_THRESHOLD;
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement,
    estimateSize: () => GRAPHIC_PARAM_ROW_ESTIMATE_PX,
    overscan: 8,
  });

  if (!shouldVirtualize) {
    return (
      <div className="divide-y divide-border/25 py-0.5">
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
    );
  }

  return (
    <div ref={scrollRef} className={cn(LARGE_CATEGORY_MAX_HEIGHT, "overflow-y-auto overscroll-contain py-0.5")}>
      <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const row = items[virtualRow.index];
          if (!row) return null;
          return (
            <div
              key={row.id}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute left-0 top-0 w-full border-b border-border/25"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <InspectorRow
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddParameterPopover({
  params,
  initialGroupId,
  onAdd,
  align = "end",
  children,
}: {
  params: readonly GraphicParam[];
  initialGroupId: string;
  onAdd: (entries: GraphicParam[]) => void;
  align?: "start" | "center" | "end";
  children: ReactNode;
}) {
  const { t } = useTranslation("scene-structure-graphic");
  const [open, setOpen] = useState(false);
  const [groupId, setGroupId] = useState(initialGroupId);
  const [mode, setMode] = useState<GraphicParamAddMode>("scalar");
  const [keyDraft, setKeyDraft] = useState(() =>
    getGraphicParamAddPreset(initialGroupId).scalarKey
  );
  const [valueDraft, setValueDraft] = useState(() =>
    getGraphicParamAddPreset(initialGroupId).value
  );

  const resetDraft = (nextGroupId: string, nextMode: GraphicParamAddMode = "scalar") => {
    const preset = getGraphicParamAddPreset(nextGroupId);
    setGroupId(nextGroupId);
    setMode(nextMode);
    setKeyDraft(nextMode === "rgb" ? preset.colorStem : preset.scalarKey);
    setValueDraft(preset.value);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) resetDraft(initialGroupId);
  };

  const preset = getGraphicParamAddPreset(groupId);
  const entries = useMemo(
    () => buildGraphicParamAddEntries(params, mode, keyDraft, valueDraft),
    [params, mode, keyDraft, valueDraft],
  );
  const canAdd = entries.length > 0;

  const handleSubmit = () => {
    if (!canAdd) return;
    onAdd(entries);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} side="bottom" className="w-72 p-2">
        <div className="space-y-2">
          <div className="space-y-0.5">
            <div className="text-[11px] font-semibold text-foreground">{t("graphic.addParameter")}</div>
            <p className="text-[9px] leading-snug text-muted-foreground">
              {t("graphic.addDescription")}
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("graphic.group")}
            </label>
            <Select
              value={groupId}
              onValueChange={(value) => resetDraft(value, mode)}
            >
              <SelectTrigger className={INSPECTOR_SELECT_TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRAPHIC_PARAM_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id} className="text-[10px]">
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[9px] leading-snug text-muted-foreground">{t(`graphic.notes.${groupId}`)}</p>
          </div>

          <div className="grid grid-cols-2 gap-1">
            {(["scalar", "rgb"] as const).map((nextMode) => (
              <button
                key={nextMode}
                type="button"
                className={cn(
                  "h-7 rounded-sm border px-2 text-[10px] font-medium transition-colors",
                  mode === nextMode
                    ? "border-primary/45 bg-primary/10 text-primary"
                    : "border-border/60 bg-muted/15 text-muted-foreground hover:bg-muted/35 hover:text-foreground",
                )}
                onClick={() => {
                  const nextPreset = getGraphicParamAddPreset(groupId);
                  setMode(nextMode);
                  setKeyDraft(nextMode === "rgb" ? nextPreset.colorStem : nextPreset.scalarKey);
                  setValueDraft(nextPreset.value);
                }}
              >
                {nextMode === "scalar" ? t("graphic.scalar") : t("graphic.rgbSet")}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_4.5rem] gap-1">
            <div className="space-y-1">
              <label className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                {mode === "rgb" ? t("graphic.keyStem") : t("graphic.key")}
              </label>
              <Input
                className={PROP_INPUT}
                value={keyDraft}
                spellCheck={false}
                onChange={(e) => setKeyDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("graphic.value")}
              </label>
              <Input
                className={cn(PROP_INPUT, "text-right")}
                value={valueDraft}
                inputMode="decimal"
                onChange={(e) => setValueDraft(sanitizeDecimalInput(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                }}
              />
            </div>
          </div>

          <div className="rounded-sm border border-border/45 bg-muted/15 px-2 py-1.5">
            <div className="mb-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("graphic.willCreate")}
            </div>
            {canAdd ? (
              <div className="space-y-0.5 font-mono text-[9px] text-foreground/85">
                {entries.map((entry) => (
                  <div key={entry.key} className="flex min-w-0 items-center justify-between gap-2">
                    <span className="truncate">{entry.key}</span>
                    <span className="shrink-0 text-muted-foreground">{entry.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[9px] text-muted-foreground">{t("graphic.enterKey")}</div>
            )}
          </div>

          <div className="flex justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={PROP_BTN}
              onClick={() => setOpen(false)}
            >
              {t("graphic.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              className={PROP_BTN}
              disabled={!canAdd}
              onClick={handleSubmit}
            >
              {t("graphic.add")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
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
          originalValue={originalValue}
          onValueChange={onValueChange}
        />
        {slider && (
          <GraphicParamSlider
            slider={slider}
            onCommit={(value) => onValueChange(p.originalIndex, String(value))}
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
          <span className={INSPECTOR_LABEL} data-i18n-ignore="" title={`${r.key}, ${g.key}, ${b.key}`}>
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
      aria-label={useTranslation("scene-structure-graphic").t("graphic.applyToPreview")}
    />
  );
}

function ScalarValueControl({
  param,
  slider,
  originalValue,
  onValueChange,
}: {
  param: IndexedGraphicParam;
  slider: ReturnType<typeof graphicParamNumericConfig>;
  originalValue: string | undefined;
  onValueChange: (index: number, value: string) => void;
}) {
  const [draft, setDraft] = useState(param.value);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    setDraft(param.value);
  }, [param.value]);

  const commit = () => {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false;
      return;
    }
    const next = slider
      ? commitDecimalInput(draft, originalValue ?? param.value)
      : draft;
    setDraft(next);
    if (next !== param.value) {
      onValueChange(param.originalIndex, next);
    }
  };

  return (
    <input
      className={INSPECTOR_VALUE}
      value={draft}
      inputMode={slider ? "decimal" : "text"}
      title={draft}
      onChange={(e) => {
        const next = slider ? sanitizeDecimalInput(e.target.value) : e.target.value;
        setDraft(next);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          const target = e.currentTarget;
          skipBlurCommitRef.current = true;
          setDraft(param.value);
          if (document.activeElement === target) {
            target.blur();
          } else {
            skipBlurCommitRef.current = false;
          }
        }
      }}
    />
  );
}

function GraphicParamSlider({
  slider,
  onCommit,
}: {
  slider: NonNullable<ReturnType<typeof graphicParamNumericConfig>>;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(slider.value);

  useEffect(() => {
    setDraft(slider.value);
  }, [slider.value]);

  return (
    <Slider
      className="h-1 w-full opacity-80 group-hover:opacity-100"
      value={[draft]}
      min={slider.min}
      max={slider.max}
      step={slider.step}
      onValueChange={(values) => setDraft(values[0] ?? slider.value)}
      onValueCommit={(values) => {
        const next = values[0] ?? slider.value;
        setDraft(next);
        if (next !== slider.value) onCommit(next);
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
  const originalValue = initialMap?.get(channel.key);
  const [draft, setDraft] = useState(channel.value);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    setDraft(channel.value);
  }, [channel.value]);

  const commit = () => {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false;
      return;
    }
    const next = commitDecimalInput(draft, originalValue ?? channel.value);
    setDraft(next);
    if (next !== channel.value) {
      onValueChange(channel.originalIndex, next);
    }
  };

  if (editKeys) {
    return (
      <Input
        className="h-5 min-w-0 px-0.5 text-[8px] font-mono"
        value={channel.key}
        onChange={(e) => onKeyChange(channel.originalIndex, e.target.value)}
      />
    );
  }

  return (
    <input
      className={cn(INSPECTOR_VALUE, "h-5 px-0.5 text-[9px]")}
      value={draft}
      inputMode="decimal"
      onChange={(e) => setDraft(sanitizeDecimalInput(e.target.value))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          const target = e.currentTarget;
          skipBlurCommitRef.current = true;
          setDraft(channel.value);
          if (document.activeElement === target) {
            target.blur();
          } else {
            skipBlurCommitRef.current = false;
          }
        }
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
              aria-label={useTranslation("scene-structure-graphic").t("graphic.resetValue")}
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          {originalValue !== undefined && (
            <TooltipContent side="bottom" className="text-[10px]">
              {useTranslation("scene-structure-graphic").t("graphic.resetTo", { value: originalValue })}
            </TooltipContent>
          )}
        </Tooltip>
      )}
      <button
        type="button"
        className={`inline-flex ${PROP_BTN_ICON} items-center justify-center rounded-sm text-muted-foreground hover:text-destructive`}
        onClick={onDelete}
        aria-label={useTranslation("scene-structure-graphic").t("graphic.deleteParameter")}
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
