import { memo, useMemo, useState } from "react";
import { Plus, RotateCcw, Search, Trash2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PlacementRow } from "../types/placement";
import {
  groupPlacementFields,
  isHeaderFormatRow,
  listCatalogKeysNotInRow,
  listPlacementFields,
  suggestFieldDefault,
  type PlacementFieldRef,
} from "../utils/placementFieldModel";
import {
  isPlacementTransformAxisKey,
  resolveTransformAxisBindingsForEntry,
} from "../utils/placementTransformAxes";
import { formatPlacementFieldLabel } from "../utils/placementInspector";
import { commitDecimalInput, sanitizeDecimalInput } from "../utils/numericFieldInput";
import {
  INSPECTOR_PROP_LABEL,
  INSPECTOR_PROP_ROW,
  INSPECTOR_PROP_VALUE,
  INSPECTOR_SECTION,
  INSPECTOR_SECTION_HEADER,
  INSPECTOR_SELECT_TRIGGER,
  PROP_BTN,
  PROP_BTN_ICON,
  PROP_INPUT,
  PROP_PANEL,
} from "./propertyPanelStyles";
import { TransformAxisGrid } from "./TransformAxisGrid";
import { VirtualizedList } from "./VirtualizedList";

const VDK_KEY_CANDIDATE_ROW_HEIGHT = 24;

interface PlacementFieldEditorProps {
  entry: PlacementRow;
  initialEntry: PlacementRow | null;
  placementHeader: string[];
  subModels: Array<{ folderName: string; objectIndex: number }>;
  onFieldPreview: (fieldIndex: number, value: string) => void;
  onFieldCommit: (fieldIndex: number, value: string) => void;
  onAddField: (key: string, value: string) => void;
  onRemoveField: (keyIndex: number) => void;
  onResetField: (fieldIndex: number) => void;
}

export function PlacementFieldEditor({
  entry,
  initialEntry,
  placementHeader,
  subModels,
  onFieldPreview,
  onFieldCommit,
  onAddField,
  onRemoveField,
  onResetField,
}: PlacementFieldEditorProps) {
  const [editKeys, setEditKeys] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());

  const fields = useMemo(
    () => listPlacementFields(entry, placementHeader),
    [entry, placementHeader],
  );
  const groups = useMemo(() => {
    const nonGrid = fields.filter((field) => !isPlacementTransformAxisKey(field.key));
    return groupPlacementFields(nonGrid);
  }, [fields]);
  const axisBindings = useMemo(
    () => resolveTransformAxisBindingsForEntry(entry, placementHeader),
    [entry, placementHeader],
  );
  const customCount = fields.filter((field) => !field.known).length;
  const headerFormat = isHeaderFormatRow(entry, placementHeader);
  const missingKeys = useMemo(
    () => listCatalogKeysNotInRow(entry, placementHeader),
    [entry, placementHeader],
  );

  const toggleGroup = (category: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  return (
    <div className={`flex min-h-0 flex-col gap-2 ${PROP_PANEL}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-0.5 text-[9px] text-muted-foreground tabular-nums">
        <span>{fields.length} fields</span>
        {customCount > 0 && (
          <>
            <span>·</span>
            <span className="text-amber-500">{customCount} custom</span>
          </>
        )}
        {headerFormat && (
          <>
            <span>·</span>
            <span className="text-sky-500">header csv</span>
          </>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant={editKeys ? "secondary" : "ghost"}
              className={`${PROP_BTN_ICON} ml-auto`}
              onClick={() => setEditKeys((v) => !v)}
              aria-pressed={editKeys}
            >
              <span className="text-[9px] font-bold tracking-tight">KEY</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[10px]">
            {editKeys ? "Hide raw VDK keys" : "Edit raw VDK keys"}
          </TooltipContent>
        </Tooltip>
      </div>

      <section className={INSPECTOR_SECTION}>
        <div className={cn(INSPECTOR_SECTION_HEADER, "cursor-default")}>
          <span className="truncate">Transform</span>
        </div>
        <div className="px-1.5 py-1.5">
          <TransformAxisGrid
            bindings={axisBindings}
            showTitle={false}
            headerFormat={headerFormat}
            initialRawFields={initialEntry?.rawFields ?? null}
            onValuePreview={(binding, value) => {
              if (binding.present && binding.valueIndex !== null) {
                onFieldPreview(binding.valueIndex, value);
              }
            }}
            onValueCommit={(binding, value) => {
              if (binding.present && binding.valueIndex !== null) {
                onFieldCommit(binding.valueIndex, value);
              }
            }}
            onAddAxis={(binding) => onAddField(binding.def.key, binding.def.defaultValue)}
            onRemoveAxis={(binding) => {
              if (binding.keyIndex !== null) onRemoveField(binding.keyIndex);
            }}
            onResetField={onResetField}
          />
        </div>
      </section>

      {groups.map((group) => {
        const collapsed = collapsedGroups.has(group.category);
        return (
          <section key={group.category} className={INSPECTOR_SECTION}>
            <button
              type="button"
              className={INSPECTOR_SECTION_HEADER}
              onClick={() => toggleGroup(group.category)}
            >
              <ChevronRight
                className={cn("h-3 w-3 shrink-0 transition-transform", !collapsed && "rotate-90")}
              />
              <span className="truncate">{group.label}</span>
              <span className="ml-auto font-mono text-[9px] opacity-60">{group.fields.length}</span>
            </button>
            {!collapsed && (
              <div className="divide-y divide-border/25 py-0.5">
                {group.fields.map((field) => (
                  <PlacementFieldRow
                    key={`${field.keyIndex}-${field.key}`}
                    field={field}
                    editKeys={editKeys}
                    initialEntry={initialEntry}
                    subModels={subModels}
                    onFieldPreview={onFieldPreview}
                    onFieldCommit={onFieldCommit}
                    onRemoveField={onRemoveField}
                    onResetField={onResetField}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      <AddFieldControl missingKeys={missingKeys} onAddField={onAddField} />
    </div>
  );
}

interface PlacementFieldRowProps {
  field: PlacementFieldRef;
  editKeys: boolean;
  initialEntry: PlacementRow | null;
  subModels: Array<{ folderName: string; objectIndex: number }>;
  onFieldPreview: (fieldIndex: number, value: string) => void;
  onFieldCommit: (fieldIndex: number, value: string) => void;
  onRemoveField: (keyIndex: number) => void;
  onResetField: (fieldIndex: number) => void;
}

const PlacementFieldRow = memo(function PlacementFieldRow({
  field,
  editKeys,
  initialEntry,
  subModels,
  onFieldPreview,
  onFieldCommit,
  onRemoveField,
  onResetField,
}: PlacementFieldRowProps) {
  const originalKey = initialEntry?.rawFields[field.keyIndex];
  const originalValue = initialEntry?.rawFields[field.valueIndex];
  const valueModified = originalValue !== undefined && field.value !== originalValue;
  const label = formatPlacementFieldLabel(field.key);

  return (
    <div
      className={cn(
        INSPECTOR_PROP_ROW,
        valueModified && "bg-amber-500/8",
        !field.known && "ring-1 ring-inset ring-amber-500/25",
      )}
    >
      <div className="min-w-0 self-center">
        {editKeys && field.editableKey ? (
          <Input
            className="h-6 min-w-0 px-1 text-left text-[9px] font-mono uppercase"
            value={field.key}
            title={field.key}
            onChange={(event) => onFieldPreview(field.keyIndex, event.target.value)}
            onBlur={(event) => onFieldCommit(field.keyIndex, event.target.value)}
          />
        ) : (
          <span className={INSPECTOR_PROP_LABEL} title={field.key}>
            {!field.known && (
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" />
            )}
            {label}
          </span>
        )}
      </div>
      <div className="min-w-0 justify-self-stretch">
        <FieldValueControl
          field={field}
          commitFallback={originalValue ?? field.value}
          subModels={subModels}
          onFieldPreview={onFieldPreview}
          onFieldCommit={onFieldCommit}
        />
      </div>
      <RowActions
        valueModified={valueModified}
        originalValue={originalValue}
        canRemove={field.editableKey}
        onReset={() => onResetField(field.valueIndex)}
        onDelete={() => onRemoveField(field.keyIndex)}
      />
    </div>
  );
}, placementFieldRowPropsAreEqual);

function placementFieldRowPropsAreEqual(
  prev: PlacementFieldRowProps,
  next: PlacementFieldRowProps,
): boolean {
  return (
    prev.editKeys === next.editKeys &&
    prev.initialEntry === next.initialEntry &&
    prev.field.key === next.field.key &&
    prev.field.value === next.field.value &&
    prev.field.keyIndex === next.field.keyIndex
  );
}

function resolveSubModelIndex(
  sub: { folderName: string; objectIndex: number },
  listIndex: number,
): number {
  return typeof sub.objectIndex === "number" && Number.isFinite(sub.objectIndex)
    ? sub.objectIndex
    : listIndex;
}

function formatObjectNumberLabel(
  value: string,
  subModels: Array<{ folderName: string; objectIndex: number }>,
): string {
  const trimmed = value.trim();
  const selected = subModels.find(
    (sm, index) => String(resolveSubModelIndex(sm, index)) === trimmed,
  );
  if (selected) {
    const index = resolveSubModelIndex(selected, subModels.indexOf(selected));
    return `${index} · ${selected.folderName}`;
  }
  if (trimmed) return trimmed;
  return "Select object...";
}

function PlacementObjectNumberSelect({
  value,
  subModels,
  onPreview,
  onCommit,
}: {
  value: string;
  subModels: Array<{ folderName: string; objectIndex: number }>;
  onPreview: (value: string) => void;
  onCommit: (value: string) => void;
}) {
  const displayLabel = formatObjectNumberLabel(value, subModels);

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        onPreview(next);
        onCommit(next);
      }}
    >
      <SelectTrigger title={displayLabel} className={INSPECTOR_SELECT_TRIGGER}>
        <SelectValue placeholder="Select object...">{displayLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent
        position="popper"
        className="max-h-72 min-w-56 max-w-[min(32rem,calc(100vw-2rem))]"
      >
        {subModels.map((sm, index) => {
          const objectIndex = resolveSubModelIndex(sm, index);
          return (
          <SelectItem
            key={`${sm.folderName}:${objectIndex}`}
            value={String(objectIndex)}
            className="items-start py-1.5 pl-8 pr-2 text-left text-[10px]"
            title={`${objectIndex} · ${sm.folderName}`}
          >
            <span className="font-mono tabular-nums text-muted-foreground">{objectIndex}</span>
            <span className="ml-1.5 min-w-0 whitespace-normal break-all leading-snug">
              {sm.folderName}
            </span>
          </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function FieldValueControl({
  field,
  commitFallback,
  subModels,
  onFieldPreview,
  onFieldCommit,
}: {
  field: PlacementFieldRef;
  commitFallback: string;
  subModels: Array<{ folderName: string; objectIndex: number }>;
  onFieldPreview: (fieldIndex: number, value: string) => void;
  onFieldCommit: (fieldIndex: number, value: string) => void;
}) {
  if (field.kind === "bool") {
    const on = field.value.toUpperCase() !== "FALSE";
    return (
      <Select
        value={on ? "TRUE" : "FALSE"}
        onValueChange={(value) => {
          onFieldPreview(field.valueIndex, value);
          onFieldCommit(field.valueIndex, value);
        }}
      >
        <SelectTrigger className={INSPECTOR_SELECT_TRIGGER}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="TRUE">On</SelectItem>
          <SelectItem value="FALSE">Off</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  if (field.key.toUpperCase() === "VDK_OBJECTNUMBER" && subModels.length > 0) {
    return (
      <PlacementObjectNumberSelect
        value={field.value}
        subModels={subModels}
        onPreview={(value) => onFieldPreview(field.valueIndex, value)}
        onCommit={(value) => onFieldCommit(field.valueIndex, value)}
      />
    );
  }

  const isNumber = field.kind === "number";
  return (
    <input
      className={cn(
        INSPECTOR_PROP_VALUE,
        isNumber ? "font-mono tabular-nums" : "font-sans",
      )}
      value={field.value}
      inputMode={isNumber ? "decimal" : "text"}
      title={field.value}
      onChange={(event) =>
        onFieldPreview(
          field.valueIndex,
          isNumber ? sanitizeDecimalInput(event.target.value) : event.target.value,
        )
      }
      onBlur={(event) => {
        if (!isNumber) {
          onFieldCommit(field.valueIndex, event.target.value);
          return;
        }
        onFieldCommit(
          field.valueIndex,
          commitDecimalInput(event.target.value, commitFallback),
        );
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

function RowActions({
  valueModified,
  originalValue,
  canRemove,
  onReset,
  onDelete,
}: {
  valueModified: boolean;
  originalValue?: string;
  canRemove: boolean;
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
      {canRemove && (
        <button
          type="button"
          className={`inline-flex ${PROP_BTN_ICON} items-center justify-center rounded-sm text-muted-foreground hover:text-destructive`}
          onClick={onDelete}
          aria-label="Remove field"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function AddFieldControl({
  missingKeys,
  onAddField,
}: {
  missingKeys: string[];
  onAddField: (key: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customKey, setCustomKey] = useState("");
  const [search, setSearch] = useState("");

  const filteredKeys = useMemo(() => {
    const lower = search.trim().toLowerCase();
    if (!lower) return missingKeys;
    return missingKeys.filter((key) => key.toLowerCase().includes(lower));
  }, [missingKeys, search]);

  const addKnown = (key: string) => {
    onAddField(key, suggestFieldDefault(key));
    setOpen(false);
    setSearch("");
  };

  const addCustom = () => {
    const key = customKey.trim().toUpperCase();
    if (!key) return;
    onAddField(key, suggestFieldDefault(key));
    setCustomKey("");
    setOpen(false);
  };

  return (
    <div className="flex min-w-0 items-center gap-1 border-t border-border/30 pt-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" size="sm" variant="outline" className={PROP_BTN}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add field
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-2">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              className="h-7 pl-6 text-[11px]"
              placeholder="Search catalog..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <VirtualizedList
            items={filteredKeys}
            rowHeight={VDK_KEY_CANDIDATE_ROW_HEIGHT}
            getItemKey={(key) => key}
            className="max-h-60 overflow-auto"
            emptyState={
              <div className="px-1 py-2 text-[10px] text-muted-foreground">No matching keys</div>
            }
            renderRow={(key) => (
              <button
                type="button"
                className="flex h-full w-full flex-col justify-center rounded-sm px-1.5 text-left hover:bg-muted/40"
                onClick={() => addKnown(key)}
              >
                <span className="truncate text-[10px] text-foreground/90">
                  {formatPlacementFieldLabel(key)}
                </span>
                <span className="truncate font-mono text-[9px] text-muted-foreground">{key}</span>
              </button>
            )}
          />
        </PopoverContent>
      </Popover>
      <Input
        className="h-6 min-w-0 flex-1 px-1.5 text-[10px] font-mono uppercase"
        placeholder="Custom VDK_KEY"
        value={customKey}
        onChange={(event) => setCustomKey(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") addCustom();
        }}
      />
      <Button type="button" size="sm" variant="secondary" className={PROP_BTN} onClick={addCustom}>
        Add
      </Button>
    </div>
  );
}
