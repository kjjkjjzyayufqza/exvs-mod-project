import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { Search, Sparkles, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { NumdlbMappingRow } from "../daeSsbhTypes";
import { MaterialLabelCombobox } from "./MaterialLabelCombobox";
import { SsbhEditorThemeScope, type SsbhEditorThemeVariant } from "./ssbhEditorTheme";

const MAPPING_ROW_HEIGHT = 49;

type NumdlbMaterialMappingEditorProps = {
  rows: NumdlbMappingRow[];
  /** numatb-sourced material labels (maya+nust union) offered as combobox suggestions. */
  availableMaterialLabels?: string[];
  onChangeMaterialLabel: (rowIndex: number, nextLabel: string) => void;
  onReplaceAll: (nextLabel: string, rowIndices: number[]) => void;
  /**
   * Snap every row's material label to its mesh name (drops the generated __partN suffix).
   * The "Auto apply" button is rendered only when this handler is provided.
   */
  onAutoApply?: () => void;
  /** When true, table body is not in a nested ScrollArea (parent provides scroll). */
  embedTableWithoutInnerScroll?: boolean;
  themeVariant?: SsbhEditorThemeVariant;
};

export function NumdlbMaterialMappingEditor({
  rows,
  availableMaterialLabels = [],
  onChangeMaterialLabel,
  onReplaceAll,
  onAutoApply,
  embedTableWithoutInnerScroll = false,
  themeVariant = "default",
}: NumdlbMaterialMappingEditorProps) {
  const [filter, setFilter] = useState("");
  const [replaceAllValue, setReplaceAllValue] = useState("");
  const deferredFilter = useDeferredValue(filter);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const materialLabels = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.materialLabel.trim()).filter(Boolean))).sort((left, right) =>
      left.localeCompare(right),
    );
  }, [rows]);

  /** Combobox options = numatb-sourced labels (maya+nust) unioned with labels already in use. */
  const comboboxOptions = useMemo(() => {
    const set = new Set<string>();
    for (const label of availableMaterialLabels) {
      const trimmed = label.trim();
      if (trimmed) set.add(trimmed);
    }
    for (const label of materialLabels) set.add(label);
    return Array.from(set).sort((left, right) => left.localeCompare(right));
  }, [availableMaterialLabels, materialLabels]);

  const filteredEntries = useMemo(() => {
    const normalized = deferredFilter.trim().toLowerCase();
    const out: { row: NumdlbMappingRow; rowIndex: number }[] = [];
    rows.forEach((row, rowIndex) => {
      if (!normalized) {
        out.push({ row, rowIndex });
        return;
      }
      if (
        row.meshObjectName.toLowerCase().includes(normalized) ||
        row.materialLabel.toLowerCase().includes(normalized)
      ) {
        out.push({ row, rowIndex });
      }
    });
    return out;
  }, [deferredFilter, rows]);

  const getTableScrollElement = useCallback(() => tableScrollRef.current, []);
  const tableVirtualizer = useVirtualizer({
    count: filteredEntries.length,
    getScrollElement: getTableScrollElement,
    estimateSize: () => MAPPING_ROW_HEIGHT,
    getItemKey: (entryIndex) => {
      const entry = filteredEntries[entryIndex];
      return entry ? `${entry.row.meshObjectName}:${entry.row.meshObjectSubindex}:${entry.rowIndex}` : entryIndex;
    },
    overscan: 10,
  });

  const virtualRows = tableVirtualizer.getVirtualItems();

  const tableBody = (
    <div
      ref={tableScrollRef}
      className={
        embedTableWithoutInnerScroll
          ? "max-h-[360px] overflow-auto overscroll-contain"
          : "h-[280px] overflow-auto overscroll-contain"
      }
    >
      {filteredEntries.length === 0 ? (
        <div className="px-3 py-8 text-center text-[11px] text-muted-foreground">
          No mapping rows match the current filter.
        </div>
      ) : (
        <div className="relative w-full" style={{ height: tableVirtualizer.getTotalSize() }}>
          {virtualRows.map((virtualRow) => {
            const entry = filteredEntries[virtualRow.index];
            if (!entry) return null;
            const { row, rowIndex } = entry;
            return (
              <div
                key={virtualRow.key}
                className="absolute left-0 top-0 w-full border-b px-3 py-2"
                style={{
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-[11px]" title={row.meshObjectName}>
                      {row.meshObjectName}
                    </div>
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground">{row.meshObjectSubindex}</div>
                  <MaterialLabelCombobox
                    value={row.materialLabel}
                    options={comboboxOptions}
                    onChange={(next) => onChangeMaterialLabel(rowIndex, next)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <SsbhEditorThemeScope variant={themeVariant}>
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Filter mesh or material</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="h-8 pl-7 text-[11px]"
                placeholder="Search mesh or material"
              />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-1">
              <Label className="text-[11px] text-muted-foreground">Replace all material labels</Label>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                Will rename: {filteredEntries.length}
              </span>
            </div>
            <div className="flex gap-2">
              <MaterialLabelCombobox
                value={replaceAllValue}
                options={comboboxOptions}
                onChange={setReplaceAllValue}
                placeholder="New material label"
              />
              <Button
                type="button"
                size="sm"
                className="h-8 px-3 text-[10px] uppercase tracking-wide"
                onClick={() =>
                  onReplaceAll(
                    replaceAllValue.trim(),
                    filteredEntries.map((entry) => entry.rowIndex),
                  )
                }
                disabled={!replaceAllValue.trim() || filteredEntries.length === 0}
              >
                <WandSparkles className="mr-1 h-3.5 w-3.5" />
                Apply
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            Meshes: {rows.length}
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            Materials: {materialLabels.length}
          </Badge>
          {onAutoApply ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto h-8 px-3 text-[10px] uppercase tracking-wide"
              onClick={onAutoApply}
              disabled={rows.length === 0}
              title="Set every material label to its mesh name (drops the generated __partN suffix)"
            >
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              Auto apply
            </Button>
          ) : null}
        </div>

        <div className="rounded-md border">
          <div className="grid grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] gap-2 border-b bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Mesh Object</span>
            <span>Subindex</span>
            <span>Material Label</span>
          </div>
          {tableBody}
        </div>
      </div>
    </SsbhEditorThemeScope>
  );
}
