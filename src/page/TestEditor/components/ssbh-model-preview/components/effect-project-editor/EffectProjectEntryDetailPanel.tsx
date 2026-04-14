import type { ReactNode } from "react";
import { CopyPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DualValueProperty } from "@/components/ui/dual-value-property";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EffectProjectEntrySnapshot } from "@/models/characterEffectProject";
import { cn } from "@/lib/utils";
import {
  int32BeBytesToLeInterpretation,
  int32LeBytesToBeInterpretation,
} from "../../effectProjectEditorUtils";
import { formatEffectProjectIdLeBeLine, formatHexU32 } from "./effectProjectDisplayUtils";
import { Field, FloatField } from "./EffectProjectFieldPrimitives";
import {
  createIdleAuxiliarySnapshot,
  type EffectProjectAuxiliarySnapshot,
} from "../../effectProjectAuxiliaryCache";

function RowGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-t border-border/50 pt-2 first:border-t-0 first:pt-0">
      <p className="mb-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function FieldGrid({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("grid grid-cols-2 gap-x-2 gap-y-1.5 sm:grid-cols-4", className)}>{children}</div>;
}

function fileBasename(path: string): string {
  const pieces = path.replace(/\\/g, "/").split("/").filter((part) => part.length > 0);
  const name = pieces[pieces.length - 1];
  if (!name) {
    throw new Error(`Invalid path without basename: ${path}`);
  }
  return name;
}

function parentDir(path: string): string {
  const normalized = path.replace(/\\/g, "/").trim();
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) {
    throw new Error(`Invalid path without parent: ${path}`);
  }
  return normalized.slice(0, idx).toLowerCase();
}

function stripFileExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx <= 0) {
    throw new Error(`Invalid file name without extension: ${fileName}`);
  }
  return fileName.slice(0, idx);
}

export type EffectProjectEntryDetailPanelProps = {
  rowIndex: number;
  entry: EffectProjectEntrySnapshot;
  auxiliary: EffectProjectAuxiliarySnapshot;
  disabled: boolean;
  /** Global display mode for int32 hex fields (toolbar). */
  displayEndian: "le" | "be";
  onPatch: (patch: Partial<EffectProjectEntrySnapshot>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
};

export function EffectProjectEntryDetailPanel({
  rowIndex,
  entry,
  auxiliary,
  disabled,
  displayEndian,
  onPatch,
  onDuplicate,
  onRemove,
}: EffectProjectEntryDetailPanelProps) {
  const auxiliarySafe = auxiliary ?? createIdleAuxiliarySnapshot();
  const jnttblData = auxiliarySafe.jnttblData ?? [];
  const nusktbData = auxiliarySafe.nusktbData ?? [];
  const hashLeU32 = entry.boneIndexLe >>> 0;
  const resolveHashMatches = (hashU32: number) =>
    jnttblData.flatMap((table) => {
      const tableParent = parentDir(table.path);
      const jnttblBaseName = fileBasename(table.path).toLowerCase();
      const jnttblStem = stripFileExtension(jnttblBaseName);
      const sameDirNusktb = nusktbData.filter((candidate) => {
        if (parentDir(candidate.path) !== tableParent) return false;
        const nusktbName = fileBasename(candidate.path).toLowerCase();
        if (!nusktbName.endsWith(".nusktb")) {
          throw new Error(`Invalid nusktb extension: ${candidate.path}`);
        }
        const nusktbStem = stripFileExtension(nusktbName);
        return nusktbStem === jnttblStem || nusktbStem.startsWith(jnttblStem);
      });
      return table.entries
        .filter((candidate) => (candidate.hashId >>> 0) === hashU32)
        .map((candidate) => {
          const resolvedBoneIndex = candidate.boneIndex >>> 0;
          const boneNames = sameDirNusktb.flatMap((nusktb) => {
            const boneName = nusktb.boneNames[resolvedBoneIndex];
            if (!boneName) return [];
            return [{ nusktbPath: nusktb.path, boneName }];
          });
          return {
            jnttblPath: table.path,
            hashId: candidate.hashId >>> 0,
            resolvedBoneIndex,
            boneNames,
          };
        });
    });
  const selectedMatches = resolveHashMatches(hashLeU32);

  return (
    <div className="space-y-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 pb-2">
        <span
          className="shrink-0 rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground"
          title="Buffer row index in file"
        >
          buf {rowIndex}
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <Label htmlFor={`effect-project-id-${rowIndex}`} className="sr-only">
            Effect project id (int32)
          </Label>
          <Input
            id={`effect-project-id-${rowIndex}`}
            type="number"
            className="h-8 w-full max-w-xs font-mono text-sm font-semibold tabular-nums shadow-none"
            disabled={disabled}
            value={entry.EffectProjectId}
            onChange={(e) => onPatch({ EffectProjectId: Number(e.target.value) })}
            aria-label="Effect project id (int32)"
          />
          <p className="break-all font-mono text-[10px] leading-tight text-muted-foreground">
            {formatEffectProjectIdLeBeLine(entry.EffectProjectId)}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-[10px]"
            disabled={disabled}
            title="Duplicate row with a new effect_project id"
            onClick={onDuplicate}
          >
            <CopyPlus className="h-3.5 w-3.5" />
            Duplicate
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-[10px] text-destructive hover:bg-destructive/10"
            disabled={disabled}
            title="Remove this row"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <RowGroup label="0x0–0xc">
          <FieldGrid>
            <Field label="0x0 unk0" v={entry.unk0} disabled={disabled} onChange={(v) => onPatch({ unk0: v })} />
            <Field label="0x4 unk1" v={entry.unk1} disabled={disabled} onChange={(v) => onPatch({ unk1: v })} />
            <div className="col-span-2 sm:col-span-4">
              <DualValueProperty
                label="0x8 aleo_1"
                value={displayEndian === "le" ? entry.aleo1Le : entry.aleo1Be}
                property={`effectProject-aleo1-${displayEndian}-${rowIndex}`}
                editable={!disabled}
                editingProperty={null}
                editValue=""
                validationError=""
                onStartEdit={() => {}}
                onSaveEdit={() => {}}
                onCancelEdit={() => {}}
                onValueChange={() => {}}
                showHex
                variant="compact"
                mode="live"
                onCommit={(nextValue) => {
                  if (displayEndian === "le") {
                    onPatch({
                      aleo1Le: nextValue,
                      aleo1Be: int32LeBytesToBeInterpretation(nextValue),
                    });
                    return;
                  }
                  const le = int32BeBytesToLeInterpretation(nextValue);
                  onPatch({
                    aleo1Le: le,
                    aleo1Be: int32LeBytesToBeInterpretation(le),
                  });
                }}
              />
              <p className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground">
                {displayEndian === "le"
                  ? `BE ref ${formatHexU32(entry.aleo1Be)}`
                  : `LE @0x8 ${formatHexU32(entry.aleo1Le)}`}
              </p>
            </div>
            <Field
              label="0xc keep_active"
              v={entry.keepActive}
              disabled={disabled}
              onChange={(v) => onPatch({ keepActive: v })}
            />
          </FieldGrid>
        </RowGroup>

        <RowGroup label="0x10–0x30">
          <FieldGrid>
            <FloatField
              label="0x10 aleo_2 Z dist"
              v={entry.aleo2ZDistance}
              disabled={disabled}
              onChange={(v) => onPatch({ aleo2ZDistance: v })}
            />
            <Field label="0x14 unk2" v={entry.unk2} disabled={disabled} onChange={(v) => onPatch({ unk2: v })} />
            <Field label="0x18 unk3" v={entry.unk3} disabled={disabled} onChange={(v) => onPatch({ unk3: v })} />
            <Field label="0x1c unk4" v={entry.unk4} disabled={disabled} onChange={(v) => onPatch({ unk4: v })} />
            <Field label="0x20 unk5" v={entry.unk5} disabled={disabled} onChange={(v) => onPatch({ unk5: v })} />
            <Field label="0x24 unk6" v={entry.unk6} disabled={disabled} onChange={(v) => onPatch({ unk6: v })} />
            <Field label="0x28 unk7" v={entry.unk7} disabled={disabled} onChange={(v) => onPatch({ unk7: v })} />
            <FloatField
              label="0x2c aleo_2 size"
              v={entry.aleo2Size}
              disabled={disabled}
              onChange={(v) => onPatch({ aleo2Size: v })}
            />
            <div className="col-span-2 sm:col-span-4">
              <DualValueProperty
                label="0x30 aleo_2"
                value={displayEndian === "le" ? entry.aleo2Le : entry.aleo2Be}
                property={`effectProject-aleo2-${displayEndian}-${rowIndex}`}
                editable={!disabled}
                editingProperty={null}
                editValue=""
                validationError=""
                onStartEdit={() => {}}
                onSaveEdit={() => {}}
                onCancelEdit={() => {}}
                onValueChange={() => {}}
                showHex
                variant="compact"
                mode="live"
                onCommit={(nextValue) => {
                  if (displayEndian === "le") {
                    onPatch({
                      aleo2Le: nextValue,
                      aleo2Be: int32LeBytesToBeInterpretation(nextValue),
                    });
                    return;
                  }
                  const le = int32BeBytesToLeInterpretation(nextValue);
                  onPatch({
                    aleo2Le: le,
                    aleo2Be: int32LeBytesToBeInterpretation(le),
                  });
                }}
              />
              <p className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground">
                {displayEndian === "le"
                  ? `BE ref ${formatHexU32(entry.aleo2Be)}`
                  : `LE @0x30 ${formatHexU32(entry.aleo2Le)}`}
              </p>
            </div>
          </FieldGrid>
        </RowGroup>

        <RowGroup label="0x34–0x50">
          <FieldGrid>
            <Field label="0x34 unk9" v={entry.unk9} disabled={disabled} onChange={(v) => onPatch({ unk9: v })} />
            <Field label="0x38 unk10" v={entry.unk10} disabled={disabled} onChange={(v) => onPatch({ unk10: v })} />
            <Field label="0x3c unk11" v={entry.unk11} disabled={disabled} onChange={(v) => onPatch({ unk11: v })} />
            <Field label="0x40 unk12" v={entry.unk12} disabled={disabled} onChange={(v) => onPatch({ unk12: v })} />
            <Field label="0x44 unk13" v={entry.unk13} disabled={disabled} onChange={(v) => onPatch({ unk13: v })} />
            <Field label="0x48 unk14" v={entry.unk14} disabled={disabled} onChange={(v) => onPatch({ unk14: v })} />
            <Field
              label="0x4c setp / action aleo"
              v={entry.setpAndActionAelo}
              disabled={disabled}
              onChange={(v) => onPatch({ setpAndActionAelo: v })}
            />
          </FieldGrid>
        </RowGroup>

        <RowGroup label="0x54–0x6c">
          <FieldGrid>
            <Field label="0x50 unk15" v={entry.unk15} disabled={disabled} onChange={(v) => onPatch({ unk15: v })} />
            <Field label="0x54 unk16" v={entry.unk16} disabled={disabled} onChange={(v) => onPatch({ unk16: v })} />
            <Field label="0x58 unk17" v={entry.unk17} disabled={disabled} onChange={(v) => onPatch({ unk17: v })} />
            <Field label="0x5c unk18" v={entry.unk18} disabled={disabled} onChange={(v) => onPatch({ unk18: v })} />
            <Field label="0x60 unk19" v={entry.unk19} disabled={disabled} onChange={(v) => onPatch({ unk19: v })} />
            <Field label="0x64 unk20" v={entry.unk20} disabled={disabled} onChange={(v) => onPatch({ unk20: v })} />
            <Field label="0x68 unk21" v={entry.unk21} disabled={disabled} onChange={(v) => onPatch({ unk21: v })} />
            <Field label="0x6c unk22" v={entry.unk22} disabled={disabled} onChange={(v) => onPatch({ unk22: v })} />
          </FieldGrid>
        </RowGroup>

        <RowGroup label="0x70–0x8c">
          <FieldGrid>
            <div className="col-span-2 sm:col-span-4">
              <DualValueProperty
                label="0x70 bone_index"
                value={displayEndian === "le" ? entry.boneIndexLe : entry.boneIndexBe}
                property={`effectProject-boneIndex-${displayEndian}-${rowIndex}`}
                editable={!disabled}
                editingProperty={null}
                editValue=""
                validationError=""
                onStartEdit={() => {}}
                onSaveEdit={() => {}}
                onCancelEdit={() => {}}
                onValueChange={() => {}}
                showHex
                variant="compact"
                mode="live"
                onCommit={(nextValue) => {
                  if (displayEndian === "le") {
                    onPatch({
                      boneIndexLe: nextValue,
                      boneIndexBe: int32LeBytesToBeInterpretation(nextValue),
                    });
                    return;
                  }
                  const le = int32BeBytesToLeInterpretation(nextValue);
                  onPatch({
                    boneIndexLe: le,
                    boneIndexBe: int32LeBytesToBeInterpretation(le),
                  });
                }}
              />
              <p className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground">
                {displayEndian === "le"
                  ? `BE ref ${formatHexU32(entry.boneIndexBe)}`
                  : `LE @0x70 ${formatHexU32(entry.boneIndexLe)}`}
              </p>
              <div className="mt-1 space-y-1 rounded border border-border/60 bg-muted/20 p-2">
                <p className="font-mono text-[9px] text-muted-foreground">
                  hash (LE calc) {formatHexU32(hashLeU32)}
                </p>
                <p className="font-mono text-[9px] text-muted-foreground">
                  Mapping: same folder, `{`jnttblStem`}.nusktb` or `{`jnttblStem`}{`*`}.nusktb`.
                </p>
                {selectedMatches.length > 0 ? (
                  <div className="max-h-28 space-y-0.5 overflow-y-auto overscroll-contain font-mono text-[9px]">
                    {selectedMatches.map((match, index) => {
                      const boneNamesText =
                        match.boneNames.length > 0
                          ? match.boneNames.map((x) => x.boneName).join(", ")
                          : "(no nusktb name)";
                      return (
                        <p
                          key={`${match.jnttblPath}:${match.hashId}:${match.resolvedBoneIndex}:${index}`}
                          className="truncate"
                          title={`${match.jnttblPath} | hash ${formatHexU32(match.hashId)} | bone ${formatHexU32(match.resolvedBoneIndex)} | ${boneNamesText}`}
                        >
                          {fileBasename(match.jnttblPath)} - idx {formatHexU32(match.resolvedBoneIndex)} - {boneNamesText}
                        </p>
                      );
                    })}
                  </div>
                ) : (
                  <p className="font-mono text-[9px] text-muted-foreground">
                    no hash match
                  </p>
                )}
              </div>
            </div>
            <Field label="0x74 unk23" v={entry.unk23} disabled={disabled} onChange={(v) => onPatch({ unk23: v })} />
            <Field label="0x78 unk24" v={entry.unk24} disabled={disabled} onChange={(v) => onPatch({ unk24: v })} />
            <Field label="0x7c unk25" v={entry.unk25} disabled={disabled} onChange={(v) => onPatch({ unk25: v })} />
            <FloatField
              label="0x80 aleo_1 size"
              v={entry.aleo1Size}
              disabled={disabled}
              onChange={(v) => onPatch({ aleo1Size: v })}
            />
            <div className="col-span-2 sm:col-span-4">
              <DualValueProperty
                label="0x84 model_id"
                value={displayEndian === "le" ? entry.modelIdLe : entry.modelIdBe}
                property={`effectProject-modelId-${displayEndian}-${rowIndex}`}
                editable={!disabled}
                editingProperty={null}
                editValue=""
                validationError=""
                onStartEdit={() => {}}
                onSaveEdit={() => {}}
                onCancelEdit={() => {}}
                onValueChange={() => {}}
                showHex
                variant="compact"
                mode="live"
                onCommit={(nextValue) => {
                  if (displayEndian === "le") {
                    onPatch({
                      modelIdLe: nextValue,
                      modelIdBe: int32LeBytesToBeInterpretation(nextValue),
                    });
                    return;
                  }
                  const le = int32BeBytesToLeInterpretation(nextValue);
                  onPatch({
                    modelIdLe: le,
                    modelIdBe: int32LeBytesToBeInterpretation(le),
                  });
                }}
              />
              <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                {displayEndian === "le"
                  ? `BE u32 ${formatHexU32(entry.modelIdBe)}`
                  : `LE @0x84 ${formatHexU32(entry.modelIdLe)}`}
              </p>
            </div>
            <Field label="0x88 unk26" v={entry.unk26} disabled={disabled} onChange={(v) => onPatch({ unk26: v })} />
            <Field label="0x8c unk27" v={entry.unk27} disabled={disabled} onChange={(v) => onPatch({ unk27: v })} />
          </FieldGrid>
        </RowGroup>
      </div>
    </div>
  );
}
