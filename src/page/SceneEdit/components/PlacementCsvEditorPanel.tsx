import { useDeferredValue, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Plus,
  Trash2,
  Box,
  Sparkles,
  Cloud,
  Package,
  RotateCcw,
  Search,
} from "lucide-react";
import type { PlacementRow } from "../types/placement";
import { PLACEMENT_VDK_TYPES, type PlacementVdkType } from "../utils/placementFieldCatalog";
import { listPlacementFields } from "../utils/placementFieldModel";
import {
  getPlacementDisplayName,
  summarizePlacementRow,
} from "../utils/placementInspector";
import { PlacementFieldEditor } from "./PlacementFieldEditor";
import { VirtualizedList } from "./VirtualizedList";
import {
  INSPECTOR_SECTION,
  INSPECTOR_SECTION_HEADER,
  PROP_BTN,
  PROP_BTN_ICON,
  PROP_INPUT,
  PROP_PANEL,
} from "./propertyPanelStyles";

const PLACEMENT_ROW_HEIGHT = 32;

interface PlacementCsvEditorPanelProps {
  entries: PlacementRow[];
  initialEntries: PlacementRow[] | null;
  placementHeader: string[];
  selectedIndex: number | null;
  subModels: Array<{ folderName: string; objectIndex: number }>;
  onSelectEntry: (index: number) => void;
  onFieldPreview: (index: number, fieldIndex: number, value: string) => void;
  onFieldCommit: (index: number, fieldIndex: number, value: string) => void;
  onAddField: (index: number, key: string, value: string) => void;
  onRemoveFieldPair: (index: number, fieldIndex: number) => void;
  onAddTyped: (vdkType: string) => void;
  onDeleteRow: (index: number) => void;
  onResetRow: (index: number) => void;
  onResetField: (index: number, fieldIndex: number) => void;
}

const VDK_TYPE_ICONS: Record<PlacementVdkType, typeof Box> = {
  OBJECT: Box,
  EFFECT: Sparkles,
  SKY: Cloud,
  PROP: Package,
};

const VDK_TYPE_LABELS: Record<PlacementVdkType, string> = {
  OBJECT: "Object",
  EFFECT: "Effect",
  SKY: "Sky",
  PROP: "Prop",
};

const VDK_TYPE_TONE: Record<PlacementVdkType, string> = {
  OBJECT: "text-muted-foreground",
  EFFECT: "text-amber-400",
  SKY: "text-sky-400",
  PROP: "text-purple-400",
};

export function PlacementCsvEditorPanel({
  entries,
  initialEntries,
  placementHeader,
  selectedIndex,
  subModels,
  onSelectEntry,
  onFieldPreview,
  onFieldCommit,
  onAddField,
  onRemoveFieldPair,
  onAddTyped,
  onDeleteRow,
  onResetRow,
  onResetField,
}: PlacementCsvEditorPanelProps) {
  const { t } = useTranslation("scene-toolbar");
  const [filter, setFilter] = useState("");
  const deferredFilter = useDeferredValue(filter);

  const rows = useMemo(() => {
    const lower = deferredFilter.trim().toLowerCase();
    return entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry, index }) => {
        if (!lower) return true;
        const summary = listPlacementFields(entry, placementHeader)
          .map((field) => `${field.key} ${field.value}`)
          .join(" ");
        const title = summarizePlacementRow(entry, index, subModels);
        return `${index} ${entry.vdkType} ${entry.objectNumber ?? ""} ${title} ${summary}`
          .toLowerCase()
          .includes(lower);
      });
  }, [entries, deferredFilter, placementHeader, subModels]);

  const selectedEntry = selectedIndex !== null ? entries[selectedIndex] : null;
  const selectedInitial = selectedIndex !== null ? initialEntries?.[selectedIndex] ?? null : null;
  const selectedTitle =
    selectedEntry && selectedIndex !== null
      ? summarizePlacementRow(selectedEntry, selectedIndex, subModels)
      : null;
  const selectedType = (selectedEntry?.vdkType?.toUpperCase() ?? "") as PlacementVdkType;
  const SelectedIcon = VDK_TYPE_ICONS[selectedType] ?? Box;

  const rowModified =
    selectedEntry &&
    selectedInitial &&
    JSON.stringify(selectedEntry.rawFields) !== JSON.stringify(selectedInitial.rawFields);

  if (entries.length === 0) {
    return (
      <div data-testid="placement-csv-editor-panel" className="flex min-h-0 flex-col gap-2">
        <AddTypedMenu onAddTyped={onAddTyped} />
          <div className="py-2 text-center text-[10px] text-muted-foreground">{t("placement.noData")}</div>
      </div>
    );
  }

  return (
    <div
      data-testid="placement-csv-editor-panel"
      className={`flex min-h-0 flex-1 flex-col gap-2 ${PROP_PANEL}`}
    >
      <div className="flex min-w-0 items-center gap-1">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            className={cn(PROP_INPUT, "pl-6")}
            placeholder={t("placement.searchPlaceholder")}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        <AddTypedMenu onAddTyped={onAddTyped} />
      </div>

      <div className="flex items-center justify-between px-0.5 text-[9px] text-muted-foreground tabular-nums">
        <span>
          {t("placement.rowCount", { count: entries.length })}
          {selectedIndex !== null && (
            <>
              {" "}
              · {t("placement.selected")} <span className="text-foreground/80">#{selectedIndex}</span>
            </>
          )}
        </span>
        {deferredFilter.trim() && (
          <span>
            {t("placement.matchCount", { count: rows.length })}
          </span>
        )}
      </div>

      <section className={cn(INSPECTOR_SECTION, "shrink-0")}>
        <div className={cn(INSPECTOR_SECTION_HEADER, "cursor-default")}>
          <span className="truncate">{t("placement.rows")}</span>
          <span className="ml-auto font-mono text-[9px] opacity-60">{rows.length}</span>
        </div>
        <VirtualizedList
          items={rows}
          rowHeight={PLACEMENT_ROW_HEIGHT}
          getItemKey={(row) => row.index}
          className="max-h-36 overflow-y-auto overscroll-contain p-0.5"
          emptyState={
            <div className="py-2 text-center text-[10px] text-muted-foreground">
              {t("placement.noMatches")}
            </div>
          }
          renderRow={({ entry, index }) => (
            <PlacementRowItem
              entry={entry}
              initialEntry={initialEntries?.[index] ?? null}
              index={index}
              selected={selectedIndex === index}
              subModels={subModels}
              onSelectEntry={onSelectEntry}
            />
          )}
        />
      </section>

      {selectedEntry && selectedIndex !== null && (
        <section className={cn(INSPECTOR_SECTION, "min-h-0 flex-1")}>
          <div className={cn(INSPECTOR_SECTION_HEADER, "gap-2")}>
            <SelectedIcon
              className={cn("h-3.5 w-3.5 shrink-0", VDK_TYPE_TONE[selectedType])}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[10px] font-medium text-foreground/90">
                {selectedTitle}
              </div>
              <div className="truncate font-mono text-[9px] text-muted-foreground/80">
                #{selectedIndex} · {t(`placement.types.${selectedType.toLowerCase()}`, { defaultValue: selectedEntry.vdkType })}
                {selectedEntry.objectNumber !== null && <> · {t("placement.objectNumber")} {selectedEntry.objectNumber}</>}
              </div>
            </div>
            {rowModified && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className={`${PROP_BTN_ICON} text-muted-foreground hover:text-foreground`}
                    onClick={() => onResetRow(selectedIndex)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px]">
                  {t("placement.resetRow")}
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={`${PROP_BTN_ICON} text-muted-foreground hover:text-destructive`}
                  onClick={() => onDeleteRow(selectedIndex)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[10px]">
                {t("placement.deleteRow")}
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain px-1 pb-1.5">
            <PlacementFieldEditor
              entry={selectedEntry}
              initialEntry={selectedInitial}
              placementHeader={placementHeader}
              subModels={subModels}
              onFieldPreview={(fieldIndex, value) =>
                onFieldPreview(selectedIndex, fieldIndex, value)
              }
              onFieldCommit={(fieldIndex, value) =>
                onFieldCommit(selectedIndex, fieldIndex, value)
              }
              onAddField={(key, value) => onAddField(selectedIndex, key, value)}
              onRemoveField={(keyIndex) => onRemoveFieldPair(selectedIndex, keyIndex)}
              onResetField={(fieldIndex) => onResetField(selectedIndex, fieldIndex)}
            />
          </div>
        </section>
      )}

      {selectedIndex === null && entries.length > 0 && (
        <div className="rounded-sm border border-dashed border-border/50 px-2 py-3 text-center text-[10px] text-muted-foreground">
          {t("placement.selectToEdit")}
        </div>
      )}
    </div>
  );
}

function AddTypedMenu({ onAddTyped }: { onAddTyped: (vdkType: string) => void }) {
  const { t } = useTranslation("scene-toolbar");
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline" className={PROP_BTN_ICON}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-[10px]">
          {t("placement.addRow")}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-36">
        {PLACEMENT_VDK_TYPES.map((type) => {
          const Icon = VDK_TYPE_ICONS[type];
          return (
            <DropdownMenuItem key={type} onClick={() => onAddTyped(type)}>
              <Icon className={cn("mr-2 h-3.5 w-3.5", VDK_TYPE_TONE[type])} />
              {t(`placement.types.${type.toLowerCase()}`)}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PlacementRowItem({
  entry,
  initialEntry,
  index,
  selected,
  subModels,
  onSelectEntry,
}: {
  entry: PlacementRow;
  initialEntry: PlacementRow | null;
  index: number;
  selected: boolean;
  subModels: Array<{ folderName: string; objectIndex: number }>;
  onSelectEntry: (index: number) => void;
}) {
  const rowModified =
    initialEntry !== null &&
    JSON.stringify(entry.rawFields) !== JSON.stringify(initialEntry.rawFields);
  const isNewRow = initialEntry === null;
  const title = summarizePlacementRow(entry, index, subModels);
  const vdkKey = (entry.vdkType?.toUpperCase() ?? "") as PlacementVdkType;
  const Icon = VDK_TYPE_ICONS[vdkKey] ?? Box;
  const { t } = useTranslation("scene-toolbar");
  const typeLabel = VDK_TYPE_LABELS[vdkKey] ?? entry.vdkType ?? t("placement.row");

  return (
    <button
      type="button"
      className={cn(
        "flex h-full w-full min-w-0 items-center gap-2 overflow-hidden rounded-sm border px-2 text-left transition-colors",
        selected
          ? "border-primary/45 bg-primary/10 ring-1 ring-inset ring-primary/20"
          : "border-transparent hover:border-border/40 hover:bg-muted/25",
        isNewRow && !selected && "border-l-2 border-l-emerald-500/50",
        rowModified && !isNewRow && !selected && "border-l-2 border-l-amber-500/50",
      )}
      onClick={() => onSelectEntry(index)}
    >
      <Icon className={cn("h-3.5 w-3.5 shrink-0", VDK_TYPE_TONE[vdkKey])} />
      <span className="shrink-0 font-mono text-[9px] text-muted-foreground tabular-nums">
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[10px] text-foreground/90" title={title}>
          {title}
        </div>
        <div className="truncate text-[9px] text-muted-foreground/75">
          {typeLabel}
          {getPlacementDisplayName(entry) && entry.objectNumber !== null
            ? ` · #${entry.objectNumber}`
            : entry.objectNumber !== null
              ? <> · {t("placement.objectNumber")} {entry.objectNumber}</>
              : ""}
        </div>
      </div>
    </button>
  );
}
