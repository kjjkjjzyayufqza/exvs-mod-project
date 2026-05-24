import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PLACEMENT_TRANSFORM_ROWS,
  type TransformAxisBinding,
} from "../utils/placementTransformAxes";
import {
  MAYA_AXIS_HEADER,
  MAYA_AXIS_INPUT,
  MAYA_ROW_LABEL,
  MAYA_TRANSFORM_GRID,
} from "./propertyPanelStyles";
import { commitDecimalInput, sanitizeDecimalInput } from "../utils/numericFieldInput";

const AXIS_COLORS = [
  "text-red-400 border-red-500/35 focus:ring-red-500/30",
  "text-emerald-400 border-emerald-500/35 focus:ring-emerald-500/30",
  "text-blue-400 border-blue-500/35 focus:ring-blue-500/30",
];

interface TransformAxisGridProps {
  bindings: Map<string, TransformAxisBinding>;
  headerFormat?: boolean;
  initialRawFields?: string[] | null;
  onValuePreview: (binding: TransformAxisBinding, value: string) => void;
  onValueCommit: (binding: TransformAxisBinding, value: string) => void;
  onAddAxis: (binding: TransformAxisBinding) => void;
  onRemoveAxis: (binding: TransformAxisBinding) => void;
  onResetField?: (valueIndex: number) => void;
}

export function TransformAxisGrid({
  bindings,
  headerFormat = false,
  initialRawFields = null,
  onValuePreview,
  onValueCommit,
  onAddAxis,
  onRemoveAxis,
  onResetField,
}: TransformAxisGridProps) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Transform
      </div>
      <div className={MAYA_TRANSFORM_GRID}>
        <span className="h-6" aria-hidden />
        {["X", "Y", "Z"].map((axis, index) => (
          <span key={axis} className={cn(MAYA_AXIS_HEADER, AXIS_COLORS[index]?.split(" ")[0])}>
            {axis}
          </span>
        ))}

        {PLACEMENT_TRANSFORM_ROWS.map((row) => (
          <TransformAxisGridRow
            key={row.label}
            row={row}
            bindings={bindings}
            headerFormat={headerFormat}
            initialRawFields={initialRawFields}
            onValuePreview={onValuePreview}
            onValueCommit={onValueCommit}
            onAddAxis={onAddAxis}
            onRemoveAxis={onRemoveAxis}
            onResetField={onResetField}
          />
        ))}
      </div>
    </div>
  );
}

function TransformAxisGridRow({
  row,
  bindings,
  headerFormat,
  initialRawFields,
  onValuePreview,
  onValueCommit,
  onAddAxis,
  onRemoveAxis,
  onResetField,
}: {
  row: (typeof PLACEMENT_TRANSFORM_ROWS)[number];
  bindings: Map<string, TransformAxisBinding>;
  headerFormat: boolean;
  initialRawFields: string[] | null;
  onValuePreview: (binding: TransformAxisBinding, value: string) => void;
  onValueCommit: (binding: TransformAxisBinding, value: string) => void;
  onAddAxis: (binding: TransformAxisBinding) => void;
  onRemoveAxis: (binding: TransformAxisBinding) => void;
  onResetField?: (valueIndex: number) => void;
}) {
  if (row.axes.length === 1) {
    const binding = bindings.get(row.axes[0].key);
    if (!binding) return null;
    return (
      <>
        <span className={MAYA_ROW_LABEL} title={row.title}>
          {row.label}
        </span>
        <div className="col-span-3 min-w-0">
          <TransformAxisCell
            binding={binding}
            axisColorIndex={0}
            headerFormat={headerFormat}
            initialRawFields={initialRawFields}
            onValuePreview={onValuePreview}
            onValueCommit={onValueCommit}
            onAddAxis={onAddAxis}
            onRemoveAxis={onRemoveAxis}
            onResetField={onResetField}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <span className={MAYA_ROW_LABEL} title={row.title}>
        {row.label}
      </span>
      {row.axes.map((def, axisIndex) => {
        const binding = bindings.get(def.key);
        if (!binding) return <span key={def.key} className="h-6" aria-hidden />;
        return (
          <TransformAxisCell
            key={def.key}
            binding={binding}
            axisColorIndex={axisIndex}
            headerFormat={headerFormat}
            initialRawFields={initialRawFields}
            onValuePreview={onValuePreview}
            onValueCommit={onValueCommit}
            onAddAxis={onAddAxis}
            onRemoveAxis={onRemoveAxis}
            onResetField={onResetField}
          />
        );
      })}
    </>
  );
}

function TransformAxisCell({
  binding,
  axisColorIndex,
  headerFormat,
  initialRawFields,
  onValuePreview,
  onValueCommit,
  onAddAxis,
  onRemoveAxis,
  onResetField,
}: {
  binding: TransformAxisBinding;
  axisColorIndex: number;
  headerFormat: boolean;
  initialRawFields: string[] | null;
  onValuePreview: (binding: TransformAxisBinding, value: string) => void;
  onValueCommit: (binding: TransformAxisBinding, value: string) => void;
  onAddAxis: (binding: TransformAxisBinding) => void;
  onRemoveAxis: (binding: TransformAxisBinding) => void;
  onResetField?: (valueIndex: number) => void;
}) {
  const canMutateAxis = !headerFormat;
  const original =
    binding.present && binding.valueIndex !== null
      ? initialRawFields?.[binding.valueIndex]
      : undefined;
  const modified = original !== undefined && binding.value !== original;

  if (!binding.present) {
    return (
      <button
        type="button"
        className={cn(
          "flex h-6 min-w-0 items-center justify-center rounded-sm border border-dashed border-border/70 bg-muted/10 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary",
        )}
        title={`Add ${binding.def.key}`}
        onClick={() => onAddAxis(binding)}
        disabled={!canMutateAxis}
      >
        <Plus className="h-3 w-3" />
      </button>
    );
  }

  return (
    <div className="relative flex min-w-0 items-center gap-0.5">
      <input
        type="text"
        inputMode="decimal"
        aria-label={binding.def.key}
        className={cn(MAYA_AXIS_INPUT, AXIS_COLORS[axisColorIndex] ?? AXIS_COLORS[0], "pr-5")}
        value={binding.value}
        onChange={(event) =>
          onValuePreview(binding, sanitizeDecimalInput(event.target.value))
        }
        onBlur={(event) =>
          onValueCommit(
            binding,
            commitDecimalInput(
              event.target.value,
              original ?? binding.def.defaultValue,
            ),
          )
        }
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <div className="absolute right-0 flex items-center">
        {modified && onResetField && binding.valueIndex !== null && (
          <button
            type="button"
            className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground"
            onClick={() => onResetField(binding.valueIndex!)}
            aria-label="Reset axis"
          >
            <RotateCcw className="h-2.5 w-2.5" />
          </button>
        )}
        {canMutateAxis && binding.keyIndex !== null && (
          <button
            type="button"
            className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-destructive"
            onClick={() => onRemoveAxis(binding)}
            aria-label={`Remove ${binding.def.key}`}
          >
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        )}
      </div>
    </div>
  );
}
