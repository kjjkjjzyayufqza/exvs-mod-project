import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Diamond } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { EffectFolderInventory } from "@/services/effectFolder/effectFolderService";
import { EFFECT_FOLDER_COMMON_PACK_NAME } from "@/services/effectFolder/effectFolderCommonPack";
import {
  EFXBN_CONTROL_NAMES,
  efxbnDirtyFieldIds,
  readEfxbnCurve,
  replaceEfxbnCurves,
  setEfxbnBlockModel,
  setEfxbnBlockTextureSlot,
  setEfxbnCurveKey,
  setEfxbnField,
  type EfxbnCurve,
  type EfxbnControlName,
  type EfxbnDocument,
  type EfxbnTextureSlotKey,
} from "./efxbnDocument";
import {
  EFXBN_FIELD_GROUP_LABELS,
  EFXBN_FIELD_GROUP_ORDER,
  EFXBN_FIELD_SCHEMA,
  efxbnFieldId,
  efxbnFieldsInGroup,
  readEfxbnField,
  type EfxbnFieldDescriptor,
  type EfxbnFieldGroup,
} from "./efxbnFieldSchema";
import {
  evaluateEfxbnCurve,
  findEfxbnKeyAtProgress,
  insertSampledEfxbnKey,
  progressToEfxbnFrame,
} from "./efxbnCurveMath";

/**
 * The property editor for one block.
 *
 * Laid out the way Blender's properties editor is — collapsible groups, a keyframe affordance on
 * every animatable channel — because the formats agree: a control with one key is a plain number,
 * and a control with more is an F-Curve. 90.7% of shipped control references have exactly one key,
 * so constants are the default presentation and the keyframe list is opened on demand.
 */

type EfxbnBlockEditorProps = {
  document: EfxbnDocument;
  blockIndex: number;
  inventory: EffectFolderInventory;
  /** Playback window, so an inserted key defaults to a time inside the effect. */
  frameCount: number;
  progress: number;
  focusedControlName: EfxbnControlName;
  onFocusedControlNameChange: (name: EfxbnControlName) => void;
  disabled?: boolean;
  onChange: (next: EfxbnDocument) => void;
  onError: (message: string) => void;
};

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(6)));
}

function hexOf(value: number): string {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

function DirtyDot({ dirty }: { dirty: boolean }) {
  return (
    <span
      className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dirty ? "bg-amber-500" : "bg-transparent")}
      aria-hidden
    />
  );
}

function EditorRow({
  label,
  dirty,
  title,
  children,
}: {
  label: string;
  dirty?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 py-0.5" title={title}>
      <DirtyDot dirty={Boolean(dirty)} />
      <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{label}</span>
      <div className="flex w-[7.5rem] shrink-0 items-center justify-end gap-1">{children}</div>
    </div>
  );
}

/** Commits on blur or Enter, so a half-typed "-" or "0." never reaches the document. */
function NumberInput({
  value,
  integral,
  disabled,
  onCommit,
  className,
}: {
  value: number;
  integral: boolean;
  disabled?: boolean;
  onCommit: (next: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? formatNumber(value);

  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) return;
    const next = integral ? Math.round(parsed) : parsed;
    if (next !== value) onCommit(next);
  };

  return (
    <Input
      value={text}
      disabled={disabled}
      inputMode={integral ? "numeric" : "decimal"}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          setDraft(null);
          event.currentTarget.blur();
        }
      }}
      className={cn("h-6 px-1.5 text-right font-mono text-[10px]", className)}
    />
  );
}

function FieldWidget({
  field,
  document: doc,
  blockIndex,
  disabled,
  onChange,
  onError,
}: {
  field: EfxbnFieldDescriptor;
  document: EfxbnDocument;
  blockIndex: number;
  disabled?: boolean;
  onChange: (next: EfxbnDocument) => void;
  onError: (message: string) => void;
}) {
  const block = doc.summary.effects[blockIndex];
  if (!block) return null;
  const value = readEfxbnField(block, field);

  const write = (next: number) => {
    try {
      onChange(setEfxbnField(doc, blockIndex, field, next));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  };

  if (field.kind === "enum" && field.options) {
    const known = field.options.some((option) => option.value === value);
    return (
      <Select
        value={String(value)}
        disabled={disabled}
        onValueChange={(next) => write(Number(next))}
      >
        <SelectTrigger className="h-6 w-full px-1.5 text-[10px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((option) => (
            <SelectItem key={option.value} value={String(option.value)} className="text-[10px]">
              {option.label}
            </SelectItem>
          ))}
          {known ? null : (
            <SelectItem value={String(value)} className="text-[10px]">
              {value} — not in the decoded table
            </SelectItem>
          )}
        </SelectContent>
      </Select>
    );
  }

  if (field.kind === "hash") {
    return (
      <Input
        value={hexOf(value)}
        disabled={disabled}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value.replace(/^0x/i, ""), 16);
          if (Number.isFinite(parsed)) write(parsed | 0);
        }}
        className="h-6 px-1.5 text-right font-mono text-[10px]"
      />
    );
  }

  return (
    <NumberInput
      value={value}
      integral={field.kind !== "float"}
      disabled={disabled}
      onCommit={write}
    />
  );
}

/** Named bits get checkboxes; whatever is left keeps its hex so nothing is silently dropped. */
function FlagsWidget({
  field,
  document: doc,
  blockIndex,
  disabled,
  onChange,
  onError,
}: {
  field: EfxbnFieldDescriptor;
  document: EfxbnDocument;
  blockIndex: number;
  disabled?: boolean;
  onChange: (next: EfxbnDocument) => void;
  onError: (message: string) => void;
}) {
  const block = doc.summary.effects[blockIndex];
  if (!block) return null;
  const value = readEfxbnField(block, field) >>> 0;
  const namedMask = (field.bits ?? []).reduce((mask, bit) => mask | bit.mask, 0) >>> 0;
  const remainder = (value & ~namedMask) >>> 0;

  const write = (next: number) => {
    try {
      onChange(setEfxbnField(doc, blockIndex, field, next >>> 0));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="space-y-1 rounded border bg-muted/10 p-1.5">
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[10px] font-medium">{field.label}</span>
        <Input
          value={hexOf(value)}
          disabled={disabled}
          onChange={(event) => {
            const parsed = Number.parseInt(event.target.value.replace(/^0x/i, ""), 16);
            if (Number.isFinite(parsed)) write(parsed);
          }}
          className="h-6 w-[7.5rem] px-1.5 text-right font-mono text-[10px]"
        />
      </div>
      {(field.bits ?? []).map((bit) => (
        <label
          key={bit.mask}
          className="flex cursor-pointer items-center gap-1.5 pl-1"
          title={bit.note}
        >
          <Checkbox
            checked={(value & bit.mask) !== 0}
            disabled={disabled}
            onCheckedChange={(checked) =>
              write(checked === true ? value | bit.mask : value & ~bit.mask)
            }
            className="h-3 w-3"
          />
          <span className="text-[10px] text-muted-foreground">
            {bit.label}
            <span className="ml-1 font-mono opacity-60">{hexOf(bit.mask)}</span>
          </span>
        </label>
      ))}
      {remainder !== 0 ? (
        <p className="pl-1 text-[9px] text-muted-foreground">
          {hexOf(remainder)} in bits with no derived name — preserved, editable through the hex box.
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Curves
// ---------------------------------------------------------------------------------------------

function CurveRow({
  curve,
  document: doc,
  blockIndex,
  frameCount,
  progress,
  focused,
  disabled,
  baselineKeys,
  onChange,
  onError,
  onFocus,
}: {
  curve: EfxbnCurve;
  document: EfxbnDocument;
  blockIndex: number;
  frameCount: number;
  progress: number;
  focused: boolean;
  disabled?: boolean;
  baselineKeys: string;
  onChange: (next: EfxbnDocument) => void;
  onError: (message: string) => void;
  onFocus: (name: EfxbnControlName) => void;
}) {
  const constant = curve.keys.length === 1;
  const dirty = JSON.stringify(curve.keys) !== baselineKeys;
  const keyIndex = findEfxbnKeyAtProgress(curve.keys, progress);
  const evaluated = evaluateEfxbnCurve(curve.keys, progress);
  const frame = progressToEfxbnFrame(progress, frameCount) ?? progress;

  const guard = (run: () => EfxbnDocument) => {
    try {
      onChange(run());
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  };

  const focusOrInsertKey = () => {
    onFocus(curve.name);
    if (keyIndex !== null) return;
    guard(() =>
      replaceEfxbnCurves(
        doc,
        blockIndex,
        [{ controlName: curve.name, keys: insertSampledEfxbnKey(curve.keys, progress) }],
        `${curve.name} + key @ ${progress}`,
      ),
    );
  };

  return (
    <div className={cn("flex items-center gap-1.5 rounded py-0.5", focused && "bg-muted/60")}>
      <DirtyDot dirty={dirty} />
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left font-mono text-[10px] text-muted-foreground"
        onClick={() => onFocus(curve.name)}
      >
        {curve.name}
      </button>
      <span className="w-12 shrink-0 text-right font-mono text-[9px] text-muted-foreground">
        {constant ? "const" : `${curve.keys.length} keys`}
      </span>
      <div className="w-[6rem] shrink-0">
        {constant ? (
          <NumberInput
            value={curve.keys[0]?.value ?? 0}
            integral={false}
            disabled={disabled}
            onCommit={(next) =>
              guard(() => setEfxbnCurveKey(doc, blockIndex, curve.name, 0, { value: next }))
            }
          />
        ) : (
          <span className="block truncate text-right font-mono text-[9px] text-muted-foreground">
            {evaluated.toFixed(4)}
          </span>
        )}
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-6 w-6 shrink-0"
        disabled={disabled}
        aria-label={`${keyIndex === null ? "Insert" : "Select"} key for ${curve.name} at frame ${Number(frame.toFixed(4))}`}
        title={keyIndex === null ? "Insert a key at the playhead" : "Key exists at the playhead"}
        onClick={focusOrInsertKey}
      >
        <Diamond className={cn("h-3 w-3", keyIndex !== null && "fill-amber-400 text-amber-400")} />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Resource binding
// ---------------------------------------------------------------------------------------------

const NONE_VALUE = "__none__";

function ResourceBinder({
  document: doc,
  blockIndex,
  inventory,
  disabled,
  onChange,
  onError,
}: {
  document: EfxbnDocument;
  blockIndex: number;
  inventory: EffectFolderInventory;
  disabled?: boolean;
  onChange: (next: EfxbnDocument) => void;
  onError: (message: string) => void;
}) {
  const block = doc.summary.effects[blockIndex];

  const modelOptions = useMemo(() => {
    const seen = new Map<number, { value: number; label: string }>();
    for (const model of inventory.models) {
      seen.set(model.hash.signed, { value: model.hash.signed, label: `${model.name}  ${model.hash.hex}` });
    }
    for (const model of inventory.commonPack?.models ?? []) {
      if (seen.has(model.hash.signed)) continue;
      seen.set(model.hash.signed, {
        value: model.hash.signed,
        label: `${model.name}  ${model.hash.hex}  (${EFFECT_FOLDER_COMMON_PACK_NAME})`,
      });
    }
    return [...seen.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [inventory]);

  const textureLabelByHash = useMemo(() => {
    const labels = new Map<number, string>();
    for (const file of inventory.textures) {
      if (file.hash && !file.missing) labels.set(file.hash.signed, file.name);
    }
    for (const file of inventory.commonPack?.textures ?? []) {
      if (file.hash && !labels.has(file.hash.signed)) {
        labels.set(file.hash.signed, `${file.name} (${EFFECT_FOLDER_COMMON_PACK_NAME})`);
      }
    }
    return labels;
  }, [inventory]);

  const parameterOptions = useMemo(
    () =>
      doc.summary.textureParameters.map((parameter) => ({
        value: parameter.index,
        label: `${parameter.index} — ${
          textureLabelByHash.get(parameter.colorMapHash.signed) ?? parameter.colorMapHash.hex
        }`,
      })),
    [doc.summary.textureParameters, textureLabelByHash],
  );

  if (!block) return null;

  const guard = (run: () => EfxbnDocument) => {
    try {
      onChange(run());
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  };

  const bindModel = (next: string) => {
    const signed = Number(next);
    if (!Number.isFinite(signed)) return;
    if (!modelOptions.some((option) => option.value === signed) && signed !== 0) {
      onError(
        `Model ${hexOf(signed)} resolves in neither this pack nor ${EFFECT_FOLDER_COMMON_PACK_NAME}; ` +
          "the game would draw nothing for it.",
      );
      return;
    }
    guard(() => setEfxbnBlockModel(doc, blockIndex, signed));
  };

  const slots: { key: EfxbnTextureSlotKey; label: string; current: number }[] = [
    {
      key: { field: "colorTextureParameterIndex", component: 0 },
      label: "Colour map",
      current: block.colorTextureParameterIndex[0],
    },
    {
      key: { field: "colorTextureParameterIndex", component: 1 },
      label: "Pass-2 colour",
      current: block.colorTextureParameterIndex[1],
    },
    {
      key: { field: "uvTextureParameterIndex", component: 0 },
      label: "UV offset map",
      current: block.uvTextureParameterIndex[0],
    },
    {
      key: { field: "uvTextureParameterIndex", component: 1 },
      label: "Pass-2 UV offset",
      current: block.uvTextureParameterIndex[1],
    },
  ];

  return (
    <div className="space-y-1.5">
      <div className="space-y-0.5">
        <span className="text-[10px] font-medium">Model</span>
        <Select
          value={block.nudHandle === 0 ? NONE_VALUE : String(block.nudHandle)}
          disabled={disabled}
          onValueChange={(next) => (next === NONE_VALUE ? bindModel("0") : bindModel(next))}
        >
          <SelectTrigger className="h-7 px-1.5 text-[10px]">
            <SelectValue placeholder="No model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE} className="text-[10px]">
              No model (billboard / strip)
            </SelectItem>
            {modelOptions.map((option) => (
              <SelectItem key={option.value} value={String(option.value)} className="text-[10px]">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {block.nudHandle !== 0 &&
        !modelOptions.some((option) => option.value === block.nudHandle) ? (
          <p className="text-[9px] text-amber-600 dark:text-amber-400">
            {hexOf(block.nudHandle)} resolves in neither this pack nor{" "}
            {EFFECT_FOLDER_COMMON_PACK_NAME}. The preview draws a proxy quad.
          </p>
        ) : null}
      </div>

      {slots.map((slot) => (
        <div key={`${slot.key.field}.${slot.key.component}`} className="space-y-0.5">
          <span className="text-[10px] font-medium">{slot.label}</span>
          <Select
            value={slot.current < 0 ? NONE_VALUE : String(slot.current)}
            disabled={disabled}
            onValueChange={(next) =>
              guard(() =>
                setEfxbnBlockTextureSlot(
                  doc,
                  blockIndex,
                  slot.key,
                  next === NONE_VALUE ? -1 : Number(next),
                ),
              )
            }
          >
            <SelectTrigger className="h-7 px-1.5 text-[10px]">
              <SelectValue placeholder="Unbound" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE} className="text-[10px]">
                Unbound (-1)
              </SelectItem>
              {parameterOptions.map((option) => (
                <SelectItem key={option.value} value={String(option.value)} className="text-[10px]">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function Group({
  group,
  document: doc,
  blockIndex,
  dirtyFields,
  disabled,
  defaultOpen,
  onChange,
  onError,
}: {
  group: EfxbnFieldGroup;
  document: EfxbnDocument;
  blockIndex: number;
  dirtyFields: Set<string>;
  disabled?: boolean;
  defaultOpen: boolean;
  onChange: (next: EfxbnDocument) => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const fields = useMemo(() => efxbnFieldsInGroup(group), [group]);
  if (fields.length === 0) return null;
  const dirtyCount = fields.filter((entry) => dirtyFields.has(efxbnFieldId(entry))).length;

  return (
    <section className="border-b pb-1">
      <button
        type="button"
        className="flex w-full items-center gap-1 py-1 text-left"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 opacity-60" />
        ) : (
          <ChevronRight className="h-3 w-3 opacity-60" />
        )}
        <span className="flex-1 text-[10px] font-medium">{EFXBN_FIELD_GROUP_LABELS[group]}</span>
        {dirtyCount > 0 ? (
          <span className="font-mono text-[9px] text-amber-600 dark:text-amber-400">
            {dirtyCount}
          </span>
        ) : null}
      </button>
      {open
        ? fields.map((entry) =>
            entry.kind === "flags" ? (
              <div key={efxbnFieldId(entry)} className="py-1">
                <FlagsWidget
                  field={entry}
                  document={doc}
                  blockIndex={blockIndex}
                  disabled={disabled}
                  onChange={onChange}
                  onError={onError}
                />
              </div>
            ) : (
              <EditorRow
                key={efxbnFieldId(entry)}
                label={entry.label}
                dirty={dirtyFields.has(efxbnFieldId(entry))}
                title={`${entry.hint ? `${entry.hint}\n` : ""}block offset 0x${entry.offset.toString(16).toUpperCase()}`}
              >
                <FieldWidget
                  field={entry}
                  document={doc}
                  blockIndex={blockIndex}
                  disabled={disabled}
                  onChange={onChange}
                  onError={onError}
                />
              </EditorRow>
            ),
          )
        : null}
    </section>
  );
}

export function EfxbnBlockEditor({
  document: doc,
  blockIndex,
  inventory,
  frameCount,
  progress,
  focusedControlName,
  onFocusedControlNameChange,
  disabled,
  onChange,
  onError,
}: EfxbnBlockEditorProps) {
  const dirtyFields = useMemo(
    () => efxbnDirtyFieldIds(doc, blockIndex, EFXBN_FIELD_SCHEMA),
    [doc, blockIndex],
  );
  const curves = useMemo(() => {
    const block = doc.summary.effects[blockIndex];
    if (!block) return [];
    return EFXBN_CONTROL_NAMES.filter((name) =>
      block.controlReferences.some((entry) => entry.name === name),
    ).map((name) => ({
      curve: readEfxbnCurve(doc.summary, blockIndex, name),
      baselineKeys: JSON.stringify(readEfxbnCurve(doc.baseline, blockIndex, name).keys),
    }));
  }, [doc, blockIndex]);

  if (!doc.summary.effects[blockIndex]) {
    return <p className="p-2 text-[10px] text-muted-foreground">Select a block to edit it.</p>;
  }

  return (
    <div className="space-y-1 p-1.5">
      <section className="border-b pb-2">
        <h5 className="py-1 text-[10px] font-medium">Resources</h5>
        <ResourceBinder
          document={doc}
          blockIndex={blockIndex}
          inventory={inventory}
          disabled={disabled}
          onChange={onChange}
          onError={onError}
        />
      </section>

      <section className="border-b pb-1">
        <h5 className="py-1 text-[10px] font-medium">
          Curves
          <span className="ml-1 font-normal text-muted-foreground">
            - a filled diamond means a key exists at the playhead
          </span>
        </h5>
        {curves.map(({ curve, baselineKeys }) => (
          <CurveRow
            key={curve.name}
            curve={curve}
            document={doc}
            blockIndex={blockIndex}
            frameCount={frameCount}
            progress={progress}
            focused={focusedControlName === curve.name}
            disabled={disabled}
            baselineKeys={baselineKeys}
            onChange={onChange}
            onError={onError}
            onFocus={onFocusedControlNameChange}
          />
        ))}
      </section>

      {EFXBN_FIELD_GROUP_ORDER.map((group) => (
        <Group
          key={group}
          group={group}
          document={doc}
          blockIndex={blockIndex}
          dirtyFields={dirtyFields}
          disabled={disabled}
          defaultOpen={group === "emission" || group === "render"}
          onChange={onChange}
          onError={onError}
        />
      ))}
    </div>
  );
}
