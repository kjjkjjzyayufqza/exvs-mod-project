import { useMemo, useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
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
import { commitDecimalInput, sanitizeDecimalInput } from "../utils/numericFieldInput";
import {
  PROP_BTN,
  PROP_BTN_ICON,
  PROP_PANEL,
} from "./propertyPanelStyles";
import { TransformAxisGrid } from "./TransformAxisGrid";

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

  return (
    <div className={`space-y-2 ${PROP_PANEL}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground">
        <span>53 known fields</span>
        <span>·</span>
        <span>{fields.length} set</span>
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
      </div>

      <TransformAxisGrid
        bindings={axisBindings}
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

      {groups.map((group) => (
        <FieldGroupSection
          key={group.category}
          label={group.label}
          fields={group.fields}
          initialEntry={initialEntry}
          subModels={subModels}
          onFieldPreview={onFieldPreview}
          onFieldCommit={onFieldCommit}
          onRemoveField={onRemoveField}
          onResetField={onResetField}
        />
      ))}

      <AddFieldControl missingKeys={listCatalogKeysNotInRow(entry, placementHeader)} onAddField={onAddField} />
    </div>
  );
}

function FieldGroupSection({
  label,
  fields,
  initialEntry,
  subModels,
  onFieldPreview,
  onFieldCommit,
  onRemoveField,
  onResetField,
}: {
  label: string;
  fields: PlacementFieldRef[];
  initialEntry: PlacementRow | null;
  subModels: Array<{ folderName: string; objectIndex: number }>;
  onFieldPreview: (fieldIndex: number, value: string) => void;
  onFieldCommit: (fieldIndex: number, value: string) => void;
  onRemoveField: (keyIndex: number) => void;
  onResetField: (fieldIndex: number) => void;
}) {
  const [open, setOpen] = useState(true);
  if (fields.length === 0) return null;

  return (
    <div className="min-w-0 rounded-sm border border-border/40">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted/30"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="truncate">{label}</span>
        <span className="ml-auto font-mono text-[9px] opacity-60">{fields.length}</span>
      </button>
      {open && (
        <div className="space-y-0.5 border-t border-border/30 px-1.5 py-1">
          {fields.map((field) => (
            <FieldRow
              key={`${field.keyIndex}-${field.key}`}
              field={field}
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
    </div>
  );
}

function FieldRow({
  field,
  initialEntry,
  subModels,
  onFieldPreview,
  onFieldCommit,
  onRemoveField,
  onResetField,
}: {
  field: PlacementFieldRef;
  initialEntry: PlacementRow | null;
  subModels: Array<{ folderName: string; objectIndex: number }>;
  onFieldPreview: (fieldIndex: number, value: string) => void;
  onFieldCommit: (fieldIndex: number, value: string) => void;
  onRemoveField: (keyIndex: number) => void;
  onResetField: (fieldIndex: number) => void;
}) {
  const originalKey = initialEntry?.rawFields[field.keyIndex];
  const originalValue = initialEntry?.rawFields[field.valueIndex];
  const keyModified = originalKey !== undefined && field.key !== originalKey;
  const valueModified = originalValue !== undefined && field.value !== originalValue;
  const modified = keyModified || valueModified;

  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)_auto_auto] items-center gap-1 rounded-sm px-0.5 py-0.5",
        modified ? "bg-yellow-500/10" : "hover:bg-muted/20",
        !field.known && "ring-1 ring-amber-500/20",
      )}
    >
      <Input
        className="h-6 min-w-0 px-1.5 text-[10px] font-mono"
        value={field.key}
        readOnly={!field.editableKey}
        title={field.key}
        onChange={(event) => onFieldPreview(field.keyIndex, event.target.value)}
        onBlur={(event) => onFieldCommit(field.keyIndex, event.target.value)}
      />
      <FieldValueInput
        field={field}
        commitFallback={originalValue ?? field.value}
        subModels={subModels}
        onFieldPreview={onFieldPreview}
        onFieldCommit={onFieldCommit}
      />
      {valueModified && (
        <button
          type="button"
          className={`inline-flex ${PROP_BTN_ICON} items-center justify-center rounded-sm text-muted-foreground hover:text-foreground`}
          onClick={() => onResetField(field.valueIndex)}
          aria-label="Reset value"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
      {field.editableKey && (
        <button
          type="button"
          className={`inline-flex ${PROP_BTN_ICON} items-center justify-center rounded-sm text-muted-foreground hover:text-destructive`}
          onClick={() => onRemoveField(field.keyIndex)}
          aria-label="Remove field"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function FieldValueInput({
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
    return (
      <Select
        value={field.value.toUpperCase() === "FALSE" ? "FALSE" : "TRUE"}
        onValueChange={(value) => {
          onFieldPreview(field.valueIndex, value);
          onFieldCommit(field.valueIndex, value);
        }}
      >
        <SelectTrigger className="h-6 min-w-0 px-1.5 text-[10px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="TRUE">TRUE</SelectItem>
          <SelectItem value="FALSE">FALSE</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  // VDK_OBJECTNUMBER — render as Select with scene object list
  if (field.key.toUpperCase() === "VDK_OBJECTNUMBER" && subModels.length > 0) {
    return (
      <Select
        value={field.value}
        onValueChange={(value) => {
          onFieldPreview(field.valueIndex, value);
          onFieldCommit(field.valueIndex, value);
        }}
      >
        <SelectTrigger className="h-6 min-w-0 px-1.5 text-[10px] font-mono">
          <SelectValue placeholder="Select object..." />
        </SelectTrigger>
        <SelectContent>
          {subModels.map((sm) => (
            <SelectItem key={sm.objectIndex} value={String(sm.objectIndex)}>
              <span className="font-mono text-muted-foreground">{sm.objectIndex}:</span>{" "}
              <span>{sm.folderName}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      className="h-6 min-w-0 px-1.5 text-[10px] font-mono tabular-nums"
      value={field.value}
      inputMode="decimal"
      onChange={(event) =>
        onFieldPreview(field.valueIndex, sanitizeDecimalInput(event.target.value))
      }
      onBlur={(event) =>
        onFieldCommit(
          field.valueIndex,
          commitDecimalInput(event.target.value, commitFallback),
        )
      }
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
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
    <div className="flex min-w-0 flex-wrap items-center gap-1 border-t border-border/30 pt-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" size="sm" variant="outline" className={PROP_BTN}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add field
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-2">
          <Input
            className="mb-2 h-7 text-[11px]"
            placeholder="Search known VDK fields..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {filteredKeys.length === 0 ? (
              <div className="px-1 py-2 text-[10px] text-muted-foreground">No known field</div>
            ) : (
              filteredKeys.map((key) => (
                <button
                  key={key}
                  type="button"
                  className="flex w-full rounded-sm px-1.5 py-1 text-left font-mono text-[10px] hover:bg-muted/40"
                  onClick={() => addKnown(key)}
                >
                  {key}
                </button>
              ))
            )}
          </div>
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
        Add custom
      </Button>
    </div>
  );
}
