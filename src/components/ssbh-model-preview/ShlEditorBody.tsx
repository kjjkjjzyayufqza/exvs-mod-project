import { useCallback, useEffect, useId, useState } from "react";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ShlFileData, ShlRecord } from "./shlIoService";
import {
  SHL_MODEL_TYPE_OPTIONS,
  appendShlRecord,
  formatModelIdLe,
  parseModelIdLe,
  removeShlRecordAt,
  replaceShlRecordAt,
} from "./shlEditorUtils";

const SELECT_CLASS =
  "h-8 w-full rounded-md border border-input bg-background px-2 text-[11px] text-foreground " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

/** Compact u32 fields: hide spinners and keep room for 2–3 digits (slot 10+ was clipping to "1"). */
const U32_INPUT_CLASS =
  "h-8 min-w-0 px-1.5 font-mono text-[11px] tabular-nums " +
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/** # | Model | Type | Model id | unk1 | Slot | del — unk1/Slot need ≥5.5rem for two-digit values. */
const ROW_GRID_COLS =
  "grid-cols-[2.5rem_minmax(0,2fr)_7.5rem_7rem_5.5rem_5.5rem_2.5rem]";

function formIdPart(reactId: string): string {
  return reactId.replace(/:/g, "");
}

/** Little-endian hex field for a record's model id (byte order as stored on disk). */
function ShlModelIdField({
  modelId,
  disabled,
  id,
  name,
  onCommit,
}: {
  modelId: number;
  disabled: boolean;
  id: string;
  name: string;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState(() => formatModelIdLe(modelId));
  useEffect(() => {
    setText(formatModelIdLe(modelId));
  }, [modelId]);

  return (
    <Input
      id={id}
      name={name}
      className="h-8 font-mono text-[11px]"
      disabled={disabled}
      autoComplete="off"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        try {
          onCommit(parseModelIdLe(text));
        } catch (err) {
          toast.error(String(err));
          setText(formatModelIdLe(modelId));
        }
      }}
    />
  );
}

type ShlEditorBodyProps = {
  data: ShlFileData;
  onChange: (next: ShlFileData) => void;
  disabled?: boolean;
  /** Structure-JSON model folder names in order; index = folder_index. */
  modelFolderNames?: string[];
};

export function ShlEditorBody({
  data,
  onChange,
  disabled = false,
  modelFolderNames,
}: ShlEditorBodyProps) {
  const reactId = useId();
  const fid = formIdPart(reactId);

  const records = data.records;
  const folders = modelFolderNames ?? [];
  const hasFolderNames = folders.length > 0;

  const folderLabel = useCallback(
    (folderIndex: number): string => {
      const idx = folderIndex >>> 0;
      const name = folders[idx];
      if (name) return `${idx}: ${name}`;
      return `Folder #${idx}`;
    },
    [folders],
  );

  const updateRecord = useCallback(
    (index: number, next: ShlRecord) => {
      onChange({ ...data, records: replaceShlRecordAt(data.records, index, next) });
    },
    [data, onChange],
  );

  const addSlot = useCallback(() => {
    const nextFolder = records.length;
    const next: ShlRecord = {
      modelId: 0,
      modelType: 3,
      folderIndex: nextFolder,
      unk1: 1,
      slotIndex: records.length,
    };
    onChange({ ...data, records: appendShlRecord(data.records, next) });
  }, [data, onChange, records.length]);

  const bodyCount = records.filter((r) => (r.modelType >>> 0) === 0).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={`${fid}-version`} className="text-[11px] text-muted-foreground">
            Version
          </Label>
          <Input
            id={`${fid}-version`}
            name={`${fid}-version`}
            type="number"
            min={0}
            className="h-8 font-mono text-[11px]"
            disabled={disabled}
            autoComplete="off"
            value={data.version}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              if (!Number.isFinite(n) || n < 0) return;
              onChange({ ...data, version: Math.min(0xffffffff, n) >>> 0 });
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Model slots</Label>
          <div className="flex h-8 items-center font-mono text-[11px] text-muted-foreground">
            {records.length} total
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Body (type 0) slots</Label>
          <div
            className={cn(
              "flex h-8 items-center gap-1 font-mono text-[11px]",
              bodyCount === 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
            )}
          >
            {bodyCount === 0 && <TriangleAlert className="h-3.5 w-3.5" />}
            {bodyCount} required
          </div>
        </div>
      </div>

      {bodyCount === 0 && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
          At least one Body (type 0) slot is required, or the game will error on this package.
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p id={`${fid}-slots-heading`} className="text-[11px] text-muted-foreground">
          Model slots {hasFolderNames ? "(model resolved by folder index)" : "(folder index only)"}
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 gap-1 text-[10px]"
          disabled={disabled}
          onClick={addSlot}
        >
          <Plus className="h-3.5 w-3.5" />
          Add slot
        </Button>
      </div>

      <div
        className="overflow-x-auto rounded-md border"
        role="group"
        aria-labelledby={`${fid}-slots-heading`}
      >
        <div className="min-w-[720px] text-[11px]">
          <div
            className={cn("grid border-b bg-muted/40 text-left", ROW_GRID_COLS)}
            role="row"
          >
            <div className="px-2 py-2 font-medium" role="columnheader">#</div>
            <div className="px-2 py-2 font-medium" role="columnheader">Model (folder)</div>
            <div className="px-2 py-2 font-medium" role="columnheader">Type</div>
            <div className="px-2 py-2 font-medium" role="columnheader">Model id (LE)</div>
            <div className="px-2 py-2 font-medium" role="columnheader">unk1</div>
            <div className="px-2 py-2 font-medium" role="columnheader">Slot</div>
            <div className="w-10 px-1 py-2" role="columnheader" />
          </div>

          {records.length === 0 ? (
            <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
              No model slots. Add a slot.
            </p>
          ) : (
            records.map((row, rowIndex) => {
              const folder = row.folderIndex >>> 0;
              const folderOutOfRange = hasFolderNames && folder >= folders.length;
              const typeKnown = SHL_MODEL_TYPE_OPTIONS.some((o) => o.value === (row.modelType >>> 0));
              return (
                <div
                  key={rowIndex}
                  className={cn("grid items-center border-b border-border/50", ROW_GRID_COLS)}
                  role="row"
                >
                  <div className="px-2 py-1 font-mono text-muted-foreground" role="cell">
                    {rowIndex + 1}
                  </div>
                  <div className="px-2 py-1" role="cell">
                    <Label htmlFor={`${fid}-folder-${rowIndex}`} className="sr-only">
                      Model folder row {rowIndex + 1}
                    </Label>
                    <select
                      id={`${fid}-folder-${rowIndex}`}
                      name={`${fid}-folder-${rowIndex}`}
                      className={cn(SELECT_CLASS, folderOutOfRange && "border-amber-500/60")}
                      disabled={disabled}
                      value={String(folder)}
                      onChange={(e) => {
                        const nextFolder = Number.parseInt(e.target.value, 10) >>> 0;
                        updateRecord(rowIndex, {
                          ...row,
                          folderIndex: nextFolder,
                        });
                      }}
                    >
                      {hasFolderNames ? (
                        folders.map((name, idx) => (
                          <option key={idx} value={String(idx)}>
                            {idx}: {name}
                          </option>
                        ))
                      ) : (
                        <option value={String(folder)}>{folderLabel(folder)}</option>
                      )}
                      {folderOutOfRange && (
                        <option value={String(folder)}>
                          Folder #{folder} (out of range)
                        </option>
                      )}
                    </select>
                  </div>
                  <div className="px-2 py-1" role="cell">
                    <Label htmlFor={`${fid}-type-${rowIndex}`} className="sr-only">
                      Slot type row {rowIndex + 1}
                    </Label>
                    <select
                      id={`${fid}-type-${rowIndex}`}
                      name={`${fid}-type-${rowIndex}`}
                      className={SELECT_CLASS}
                      disabled={disabled}
                      value={String(row.modelType >>> 0)}
                      onChange={(e) =>
                        updateRecord(rowIndex, {
                          ...row,
                          modelType: Number.parseInt(e.target.value, 10) >>> 0,
                        })
                      }
                    >
                      {SHL_MODEL_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={String(o.value)}>
                          {o.value} · {o.label}
                        </option>
                      ))}
                      {!typeKnown && (
                        <option value={String(row.modelType >>> 0)}>
                          {row.modelType >>> 0} · Unknown
                        </option>
                      )}
                    </select>
                  </div>
                  <div className="px-2 py-1" role="cell">
                    <ShlModelIdField
                      modelId={row.modelId}
                      disabled={disabled}
                      id={`${fid}-modelid-${rowIndex}`}
                      name={`${fid}-modelid-${rowIndex}`}
                      onCommit={(modelId) => updateRecord(rowIndex, { ...row, modelId })}
                    />
                  </div>
                  <div className="min-w-0 px-1 py-1" role="cell">
                    <Input
                      type="number"
                      min={0}
                      className={U32_INPUT_CLASS}
                      disabled={disabled}
                      autoComplete="off"
                      aria-label={`unk1 row ${rowIndex + 1}`}
                      value={row.unk1}
                      onChange={(e) => {
                        const n = Number.parseInt(e.target.value, 10);
                        if (!Number.isFinite(n) || n < 0) return;
                        updateRecord(rowIndex, { ...row, unk1: Math.min(0xffffffff, n) >>> 0 });
                      }}
                    />
                  </div>
                  <div className="min-w-0 px-1 py-1" role="cell">
                    <Input
                      type="number"
                      min={0}
                      className={U32_INPUT_CLASS}
                      disabled={disabled}
                      autoComplete="off"
                      aria-label={`Slot index row ${rowIndex + 1}`}
                      value={row.slotIndex}
                      onChange={(e) => {
                        const n = Number.parseInt(e.target.value, 10);
                        if (!Number.isFinite(n) || n < 0) return;
                        updateRecord(rowIndex, { ...row, slotIndex: Math.min(0xffffffff, n) >>> 0 });
                      }}
                    />
                  </div>
                  <div className="px-1 py-1" role="cell">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      disabled={disabled}
                      aria-label={`Remove slot ${rowIndex + 1}`}
                      onClick={() =>
                        onChange({ ...data, records: removeShlRecordAt(data.records, rowIndex) })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
