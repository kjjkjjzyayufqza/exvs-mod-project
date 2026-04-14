import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { debounce } from "lodash";
import { produce } from "immer";
import { CopyPlus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DualValueProperty } from "@/components/ui/dual-value-property";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { int32ToHexDisplay } from "@/module/commonFunc";
import {
  type EffectProjectEditorDocument,
  cloneEffectProjectDocument,
  int32BeBytesToLeInterpretation,
  int32LeBytesToBeInterpretation,
  nextEffectProjectIdMaxPlusOneUnique,
  reconcileEffectProjectDerivedFields,
} from "./effectProjectEditorUtils";
import {
  createDefaultEffectProjectEntrySnapshot,
  type EffectProjectEntrySnapshot,
} from "@/models/characterEffectProject";

type Props = {
  data: EffectProjectEditorDocument;
  /** Bumps when the authoritative document is replaced (load, save, reload, reset). */
  draftSyncGeneration: number;
  onChange: (next: EffectProjectEditorDocument) => void;
  /** Register a function that flushes the latest draft to the parent immediately (call before Save). */
  onFlushToParentReady?: (flush: () => EffectProjectEditorDocument) => void;
  disabled: boolean;
};

/** Unsigned 32-bit hex (matches hash-style ids in tooling). */
function formatHexU32(n: number): string {
  return `0x${(n >>> 0).toString(16).padStart(8, "0")}`;
}

function hexLeCompact(n: number): string {
  return int32ToHexDisplay(n).replace(/\s+/g, "").toLowerCase();
}

function effectProjectEntryHaystack(e: EffectProjectEntrySnapshot): string {
  const numeric = Object.values(e)
    .filter((v): v is number => typeof v === "number")
    .map((v) => String(v));
  return [
    ...numeric,
    hexLeCompact(e.boneIndexLe),
    hexLeCompact(e.modelIdLe),
    formatHexU32(e.boneIndexLe),
    formatHexU32(e.modelIdLe),
    formatHexU32(e.boneIndexBe),
    formatHexU32(e.modelIdBe),
  ]
    .join(" ")
    .toLowerCase();
}

function matchesEffectProjectSearch(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return q.split(/\s+/).every((tok) => tok.length === 0 || haystack.includes(tok));
}

function computeEffectProjectSearchMatchedIndices(
  query: string,
  entries: EffectProjectEntrySnapshot[],
): number[] {
  const q = query.trim();
  if (!q) {
    return entries.map((_, i) => i);
  }
  const out: number[] = [];
  for (let i = 0; i < entries.length; i++) {
    const hay = effectProjectEntryHaystack(entries[i]!);
    if (matchesEffectProjectSearch(hay, q)) {
      out.push(i);
    }
  }
  return out;
}

function mergeAppendedRowIntoSearchMatches(appendedIndex: number, prev: number[]): number[] {
  if (appendedIndex < 0 || prev.includes(appendedIndex)) return prev;
  return [...prev, appendedIndex].sort((a, b) => a - b);
}

export function EffectProjectEditorBody({
  data,
  draftSyncGeneration,
  onChange,
  onFlushToParentReady,
  disabled,
}: Props) {
  const [draft, setDraft] = useState<EffectProjectEditorDocument>(() => cloneEffectProjectDocument(data));
  const [searchQuery, setSearchQuery] = useState("");
  /**
   * When `searchQuery` is non-empty: row indices to render (sticky).
   * - Recomputed only in: search box input; `draftSyncGeneration` sync; add/copy (appends new index); remove (shifts indices).
   * - Must NOT be recomputed from live cell values on every edit (see sync effect deps — do not add debounce/callback churn).
   */
  const [searchMatchedIndices, setSearchMatchedIndices] = useState<number[]>(() =>
    cloneEffectProjectDocument(data).entries.map((_, i) => i),
  );
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;
  const [boneIndexEndianView, setBoneIndexEndianView] = useState<"le" | "be">("le");
  const [aleo1EndianView, setAleo1EndianView] = useState<"le" | "be">("le");
  const [aleo2EndianView, setAleo2EndianView] = useState<"le" | "be">("le");
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const authoritativeDataRef = useRef(data);
  authoritativeDataRef.current = data;

  const debouncedPushToParent = useMemo(
    () =>
      debounce(() => {
        onChange(cloneEffectProjectDocument(draftRef.current));
      }, 200),
    [onChange, draftSyncGeneration],
  );

  const debouncedPushToParentRef = useRef(debouncedPushToParent);
  debouncedPushToParentRef.current = debouncedPushToParent;

  useEffect(() => {
    return () => {
      debouncedPushToParent.cancel();
    };
  }, [debouncedPushToParent]);

  /** Only when the authoritative document is replaced (load / save / reset). Do NOT depend on debouncedPushToParent — its identity changes when the parent re-renders and would re-run search against fresh row payloads, collapsing sticky search results after any edit. */
  useEffect(() => {
    const next = cloneEffectProjectDocument(authoritativeDataRef.current);
    setDraft(next);
    draftRef.current = next;
    debouncedPushToParentRef.current.cancel();
    const q = searchQueryRef.current.trim();
    setSearchMatchedIndices(computeEffectProjectSearchMatchedIndices(q, next.entries));
  }, [draftSyncGeneration]);

  const flushToParent = useCallback((): EffectProjectEditorDocument => {
    debouncedPushToParent.cancel();
    const doc = cloneEffectProjectDocument(draftRef.current);
    onChange(doc);
    return doc;
  }, [debouncedPushToParent, onChange]);

  useEffect(() => {
    if (!onFlushToParentReady) return;
    onFlushToParentReady(flushToParent);
  }, [onFlushToParentReady, flushToParent, draftSyncGeneration]);

  const patchDoc = useCallback(
    (recipe: (d: EffectProjectEditorDocument) => void) => {
      setDraft((prev) => {
        const next = produce(prev, (d) => {
          recipe(d);
          reconcileEffectProjectDerivedFields(d);
        });
        draftRef.current = next;
        debouncedPushToParent();
        return next;
      });
    },
    [debouncedPushToParent],
  );

  const patchEntry = useCallback(
    (index: number, patch: Partial<EffectProjectEntrySnapshot>) => {
      patchDoc((d) => {
        const row = d.entries[index];
        if (!row) return;
        Object.assign(row, patch);
      });
    },
    [patchDoc],
  );

  const searchBoxChange = useCallback((raw: string) => {
    setSearchQuery(raw);
    setSearchMatchedIndices(
      computeEffectProjectSearchMatchedIndices(raw, draftRef.current.entries),
    );
  }, []);

  const visibleRowIndices = !searchQuery.trim()
    ? draft.entries.map((_, i) => i)
    : searchMatchedIndices.filter((i) => i >= 0 && i < draft.entries.length);

  const addRow = useCallback(() => {
    let appendedIndex = -1;
    patchDoc((d) => {
      const newId = nextEffectProjectIdMaxPlusOneUnique(d.entries.map((e) => e.EffectProjectId));
      d.entries.push(createDefaultEffectProjectEntrySnapshot(newId));
      appendedIndex = d.entries.length - 1;
    });
    if (searchQueryRef.current.trim() !== "" && appendedIndex >= 0) {
      setSearchMatchedIndices((prev) => mergeAppendedRowIntoSearchMatches(appendedIndex, prev));
    }
  }, [patchDoc]);

  const removeRow = useCallback(
    (index: number) => {
      patchDoc((d) => {
        if (index < 0 || index >= d.entries.length) return;
        d.entries.splice(index, 1);
      });
      setSearchMatchedIndices((prev) =>
        prev
          .filter((i) => i !== index)
          .map((i) => (i > index ? i - 1 : i)),
      );
    },
    [patchDoc],
  );

  const copyAsNew = useCallback(
    (index: number) => {
      let appendedIndex = -1;
      patchDoc((d) => {
        const src = d.entries[index];
        if (!src) return;
        const newId = nextEffectProjectIdMaxPlusOneUnique(d.entries.map((e) => e.EffectProjectId));
        const copy: EffectProjectEntrySnapshot = {
          ...src,
          EffectProjectId: newId,
          aleo1Be: int32LeBytesToBeInterpretation(src.aleo1Le),
          aleo2Be: int32LeBytesToBeInterpretation(src.aleo2Le),
          boneIndexBe: int32LeBytesToBeInterpretation(src.boneIndexLe),
          modelIdBe: int32LeBytesToBeInterpretation(src.modelIdLe),
        };
        d.entries.push(copy);
        appendedIndex = d.entries.length - 1;
      });
      if (searchQueryRef.current.trim() !== "" && appendedIndex >= 0) {
        setSearchMatchedIndices((prev) => mergeAppendedRowIntoSearchMatches(appendedIndex, prev));
      }
    },
    [patchDoc],
  );

  return (
    <div className="space-y-6 text-[11px]">
      <section className="rounded-md border bg-muted/20 p-3 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Header</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <Label className="text-[10px]">Magic (hex)</Label>
            <p className="font-mono text-xs mt-0.5">{draft.magic}</p>
          </div>
          <div>
            <Label className="text-[10px]">File size (0x8)</Label>
            <p className="font-mono text-xs mt-0.5">{draft.fileSize}</p>
          </div>
          <div>
            <Label className="text-[10px]">Effect projects (0x10)</Label>
            <p className="font-mono text-xs mt-0.5">{draft.effectProjectCount}</p>
          </div>
          <div>
            <Label className="text-[10px]">Commands (0x14)</Label>
            <p className="font-mono text-xs mt-0.5">{draft.commandsCount}</p>
          </div>
        </div>
        <div>
          <Label className="text-[10px]">Row size (0x18)</Label>
          <p className="font-mono text-xs mt-0.5">0x{draft.eachEffectProjectSize.toString(16)}</p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-2">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between xl:gap-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
              Effect project rows (0x90 each)
            </h3>
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Input
                type="search"
                placeholder="Search rows (any field; space-separated terms)…"
                className="h-8 w-full min-w-0 max-w-xl font-mono text-[11px]"
                value={searchQuery}
                onChange={(e) => searchBoxChange(e.target.value)}
                aria-label="Filter effect project rows"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 shrink-0 gap-1 text-[10px] sm:ml-0"
                disabled={disabled}
                onClick={addRow}
              >
                <Plus className="h-3.5 w-3.5" />
                Add row
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug">
            Save reorders rows by raw <span className="font-mono">int32 LE</span> id value as <span className="font-mono">uint32</span> ascending
            (matches id-table byte order). Duplicate ids block save. Editing does not reorder until Save.
          </p>
          <p className="text-[10px] text-muted-foreground">
            {searchQuery.trim()
              ? `Showing ${visibleRowIndices.length} of ${draft.entries.length} row(s).`
              : `${draft.entries.length} row(s).`}
          </p>
        </div>
        <div className="max-h-[min(52vh,480px)] space-y-3 overflow-y-auto pr-1">
          {visibleRowIndices.map((idx) => {
            const entry = draft.entries[idx];
            if (!entry) return null;
            return (
          <article
            key={`effect-project-row-${idx}`}
            className="overflow-hidden rounded-lg border border-border/80 bg-card shadow-sm"
          >
            <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border/70 bg-white px-3 py-2.5">
              <div className="min-w-0 flex-1 space-y-1">
                <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Effect project id (int32)
                </Label>
                <Input
                  type="number"
                  className="h-11 max-w-sm font-mono text-2xl font-semibold tabular-nums leading-none text-primary shadow-none"
                  disabled={disabled}
                  value={entry.EffectProjectId}
                  onChange={(e) => patchEntry(idx, { EffectProjectId: Number(e.target.value) })}
                />
                <p className="text-[10px] text-muted-foreground">Row index in buffer: {idx}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-[10px]"
                    disabled={disabled}
                    title="Duplicate row with a new effect_project id"
                    onClick={() => copyAsNew(idx)}
                  >
                    <CopyPlus className="h-3 w-3" />
                    Copy as new
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-[10px] text-destructive hover:text-destructive"
                    disabled={disabled}
                    title="Remove this row"
                    onClick={() => removeRow(idx)}
                  >
                    <Trash2 className="h-3 w-3" />
                    Remove
                  </Button>
              </div>
            </header>
              <div className="px-3 pb-3 pt-3 space-y-3">
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
                  <Field
                    label="0x0 unk0"
                    v={entry.unk0}
                    disabled={disabled}
                    onChange={(v) => patchEntry(idx, { unk0: v })}
                  />
                  <Field
                    label="0x4 unk1"
                    v={entry.unk1}
                    disabled={disabled}
                    onChange={(v) => patchEntry(idx, { unk1: v })}
                  />
                  <div className="col-span-2 sm:col-span-4 space-y-1">
                    <DualValueProperty
                      label="0x8 aleo_1"
                      labelExtra={
                        <ToggleGroup
                          type="single"
                          value={aleo1EndianView}
                          onValueChange={(v) => {
                            if (v === "le" || v === "be") setAleo1EndianView(v);
                          }}
                          className="shrink-0"
                        >
                          <ToggleGroupItem value="le" className="h-6 px-2 text-[10px]">
                            LE
                          </ToggleGroupItem>
                          <ToggleGroupItem value="be" className="h-6 px-2 text-[10px]">
                            BE
                          </ToggleGroupItem>
                        </ToggleGroup>
                      }
                      value={aleo1EndianView === "le" ? entry.aleo1Le : entry.aleo1Be}
                      property={`effectProject-aleo1-${aleo1EndianView}-${idx}`}
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
                        if (aleo1EndianView === "le") {
                          patchEntry(idx, {
                            aleo1Le: nextValue,
                            aleo1Be: int32LeBytesToBeInterpretation(nextValue),
                          });
                          return;
                        }
                        const le = int32BeBytesToLeInterpretation(nextValue);
                        patchEntry(idx, {
                          aleo1Le: le,
                          aleo1Be: int32LeBytesToBeInterpretation(le),
                        });
                      }}
                    />
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {aleo1EndianView === "le"
                        ? `BE interpretation (reference): ${formatHexU32(entry.aleo1Be)}`
                        : `LE stored at 0x8 (reference): ${formatHexU32(entry.aleo1Le)}`}
                    </p>
                  </div>
                  <Field
                    label="0xc keep_active"
                    v={entry.keepActive}
                    disabled={disabled}
                    onChange={(v) => patchEntry(idx, { keepActive: v })}
                  />
                  <FloatField
                    label="0x10 aleo_2 Z dist"
                    v={entry.aleo2ZDistance}
                    disabled={disabled}
                    onChange={(v) => patchEntry(idx, { aleo2ZDistance: v })}
                  />
                  <Field label="0x14 unk2" v={entry.unk2} disabled={disabled} onChange={(v) => patchEntry(idx, { unk2: v })} />
                  <Field label="0x18 unk3" v={entry.unk3} disabled={disabled} onChange={(v) => patchEntry(idx, { unk3: v })} />
                  <Field label="0x1c unk4" v={entry.unk4} disabled={disabled} onChange={(v) => patchEntry(idx, { unk4: v })} />
                  <Field label="0x20 unk5" v={entry.unk5} disabled={disabled} onChange={(v) => patchEntry(idx, { unk5: v })} />
                  <Field label="0x24 unk6" v={entry.unk6} disabled={disabled} onChange={(v) => patchEntry(idx, { unk6: v })} />
                  <Field label="0x28 unk7" v={entry.unk7} disabled={disabled} onChange={(v) => patchEntry(idx, { unk7: v })} />
                  <FloatField
                    label="0x2c aleo_2 size"
                    v={entry.aleo2Size}
                    disabled={disabled}
                    onChange={(v) => patchEntry(idx, { aleo2Size: v })}
                  />
                  <div className="col-span-2 sm:col-span-4 space-y-1">
                    <DualValueProperty
                      label="0x30 aleo_2"
                      labelExtra={
                        <ToggleGroup
                          type="single"
                          value={aleo2EndianView}
                          onValueChange={(v) => {
                            if (v === "le" || v === "be") setAleo2EndianView(v);
                          }}
                          className="shrink-0"
                        >
                          <ToggleGroupItem value="le" className="h-6 px-2 text-[10px]">
                            LE
                          </ToggleGroupItem>
                          <ToggleGroupItem value="be" className="h-6 px-2 text-[10px]">
                            BE
                          </ToggleGroupItem>
                        </ToggleGroup>
                      }
                      value={aleo2EndianView === "le" ? entry.aleo2Le : entry.aleo2Be}
                      property={`effectProject-aleo2-${aleo2EndianView}-${idx}`}
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
                        if (aleo2EndianView === "le") {
                          patchEntry(idx, {
                            aleo2Le: nextValue,
                            aleo2Be: int32LeBytesToBeInterpretation(nextValue),
                          });
                          return;
                        }
                        const le = int32BeBytesToLeInterpretation(nextValue);
                        patchEntry(idx, {
                          aleo2Le: le,
                          aleo2Be: int32LeBytesToBeInterpretation(le),
                        });
                      }}
                    />
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {aleo2EndianView === "le"
                        ? `BE interpretation (reference): ${formatHexU32(entry.aleo2Be)}`
                        : `LE stored at 0x30 (reference): ${formatHexU32(entry.aleo2Le)}`}
                    </p>
                  </div>
                  <Field label="0x34 unk9" v={entry.unk9} disabled={disabled} onChange={(v) => patchEntry(idx, { unk9: v })} />
                  <Field label="0x38 unk10" v={entry.unk10} disabled={disabled} onChange={(v) => patchEntry(idx, { unk10: v })} />
                  <Field label="0x3c unk11" v={entry.unk11} disabled={disabled} onChange={(v) => patchEntry(idx, { unk11: v })} />
                  <Field label="0x40 unk12" v={entry.unk12} disabled={disabled} onChange={(v) => patchEntry(idx, { unk12: v })} />
                  <Field label="0x44 unk13" v={entry.unk13} disabled={disabled} onChange={(v) => patchEntry(idx, { unk13: v })} />
                  <Field label="0x48 unk14" v={entry.unk14} disabled={disabled} onChange={(v) => patchEntry(idx, { unk14: v })} />
                  <Field
                    label="0x4c setp / action aleo"
                    v={entry.setpAndActionAelo}
                    disabled={disabled}
                    onChange={(v) => patchEntry(idx, { setpAndActionAelo: v })}
                  />
                  <Field
                    label="0x50 unk15"
                    v={entry.unk15}
                    disabled={disabled}
                    onChange={(v) => patchEntry(idx, { unk15: v })}
                  />
                  <Field
                    label="0x54 unk16"
                    v={entry.unk16}
                    disabled={disabled}
                    onChange={(v) => patchEntry(idx, { unk16: v })}
                  />
                  <Field
                    label="0x58 unk17"
                    v={entry.unk17}
                    disabled={disabled}
                    onChange={(v) => patchEntry(idx, { unk17: v })}
                  />
                  <Field
                    label="0x5c unk18"
                    v={entry.unk18}
                    disabled={disabled}
                    onChange={(v) => patchEntry(idx, { unk18: v })}
                  />
                  <Field
                    label="0x60 unk19"
                    v={entry.unk19}
                    disabled={disabled}
                    onChange={(v) => patchEntry(idx, { unk19: v })}
                  />
                  <Field
                    label="0x64 unk20"
                    v={entry.unk20}
                    disabled={disabled}
                    onChange={(v) => patchEntry(idx, { unk20: v })}
                  />
                  <Field
                    label="0x68 unk21"
                    v={entry.unk21}
                    disabled={disabled}
                    onChange={(v) => patchEntry(idx, { unk21: v })}
                  />
                  <Field
                    label="0x6c unk22"
                    v={entry.unk22}
                    disabled={disabled}
                    onChange={(v) => patchEntry(idx, { unk22: v })}
                  />
                  <div className="col-span-2 sm:col-span-4 space-y-1">
                    <DualValueProperty
                      label="0x70 bone_index"
                      labelExtra={
                        <ToggleGroup
                          type="single"
                          value={boneIndexEndianView}
                          onValueChange={(v) => {
                            if (v === "le" || v === "be") setBoneIndexEndianView(v);
                          }}
                          className="shrink-0"
                        >
                          <ToggleGroupItem value="le" className="h-6 px-2 text-[10px]">
                            LE
                          </ToggleGroupItem>
                          <ToggleGroupItem value="be" className="h-6 px-2 text-[10px]">
                            BE
                          </ToggleGroupItem>
                        </ToggleGroup>
                      }
                      value={
                        boneIndexEndianView === "le" ? entry.boneIndexLe : entry.boneIndexBe
                      }
                      property={`effectProject-boneIndex-${boneIndexEndianView}-${idx}`}
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
                        if (boneIndexEndianView === "le") {
                          patchEntry(idx, {
                            boneIndexLe: nextValue,
                            boneIndexBe: int32LeBytesToBeInterpretation(nextValue),
                          });
                          return;
                        }
                        const le = int32BeBytesToLeInterpretation(nextValue);
                        patchEntry(idx, {
                          boneIndexLe: le,
                          boneIndexBe: int32LeBytesToBeInterpretation(le),
                        });
                      }}
                    />
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {boneIndexEndianView === "le"
                        ? `BE interpretation (reference): ${formatHexU32(entry.boneIndexBe)}`
                        : `LE stored at 0x70 (reference): ${formatHexU32(entry.boneIndexLe)}`}
                    </p>
                  </div>
                  <Field
                    label="0x74 unk23"
                    v={entry.unk23}
                    disabled={disabled}
                    onChange={(v) => patchEntry(idx, { unk23: v })}
                  />
                  <Field
                    label="0x78 unk24"
                    v={entry.unk24}
                    disabled={disabled}
                    onChange={(v) => patchEntry(idx, { unk24: v })}
                  />
                  <Field
                    label="0x7c unk25"
                    v={entry.unk25}
                    disabled={disabled}
                    onChange={(v) => patchEntry(idx, { unk25: v })}
                  />
                  <FloatField
                    label="0x80 aleo_1 size"
                    v={entry.aleo1Size}
                    disabled={disabled}
                    onChange={(v) => patchEntry(idx, { aleo1Size: v })}
                  />
                  <div className="col-span-2 sm:col-span-4 space-y-1">
                    <DualValueProperty
                      label="0x84 model_id (LE)"
                      value={entry.modelIdLe}
                      property={`effectProject-modelIdLe-${idx}`}
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
                      onCommit={(nextValue) =>
                        patchEntry(idx, {
                          modelIdLe: nextValue,
                          modelIdBe: int32LeBytesToBeInterpretation(nextValue),
                        })
                      }
                    />
                    <p className="text-[10px] text-muted-foreground font-mono">
                      0x84 model_id BE u32: {formatHexU32(entry.modelIdBe)}
                    </p>
                  </div>
                  <Field
                    label="0x88 unk26"
                    v={entry.unk26}
                    disabled={disabled}
                    onChange={(v) => patchEntry(idx, { unk26: v })}
                  />
                  <Field
                    label="0x8c unk27"
                    v={entry.unk27}
                    disabled={disabled}
                    onChange={(v) => patchEntry(idx, { unk27: v })}
                  />
                </div>
              </div>
            </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  v,
  disabled,
  onChange,
}: {
  label: string;
  v: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input
        type="number"
        className="h-7 font-mono text-[11px] mt-0.5"
        disabled={disabled}
        value={v}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function floatToEditableString(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return String(n);
}

function parseCommittedFloatText(raw: string): number {
  const t = raw.trim();
  if (t === "" || t === "-" || t === "." || t === "-.") {
    throw new Error("incomplete");
  }
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n)) {
    throw new Error("invalid");
  }
  return n;
}

function FloatField({
  label,
  v,
  disabled,
  onChange,
}: {
  label: string;
  v: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(() => floatToEditableString(v));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (focusedRef.current) return;
    setText(floatToEditableString(v));
  }, [v]);

  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        className="h-7 font-mono text-[11px] mt-0.5"
        disabled={disabled}
        value={text}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={() => {
          focusedRef.current = false;
          try {
            const n = parseCommittedFloatText(text);
            onChange(n);
            setText(floatToEditableString(n));
          } catch {
            setText(floatToEditableString(v));
          }
        }}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          const t = next.trim();
          if (t === "" || t === "-" || t === "." || t === "-.") {
            return;
          }
          const n = Number.parseFloat(t);
          if (Number.isFinite(n)) {
            onChange(n);
          }
        }}
      />
    </div>
  );
}
