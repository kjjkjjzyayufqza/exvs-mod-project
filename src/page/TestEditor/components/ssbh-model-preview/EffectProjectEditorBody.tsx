import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { debounce } from "lodash";
import { produce } from "immer";
import {
  type EffectProjectEditorDocument,
  cloneEffectProjectDocument,
  int32LeBytesToBeInterpretation,
  nextEffectProjectIdMaxPlusOneUnique,
  reconcileEffectProjectDerivedFields,
} from "./effectProjectEditorUtils";
import {
  createDefaultEffectProjectEntrySnapshot,
  type EffectProjectEntrySnapshot,
} from "@/models/characterEffectProject";
import { int32ToHexDisplay } from "@/module/commonFunc";
import { EffectProjectDocumentHeader } from "./components/effect-project-editor/EffectProjectDocumentHeader";
import { EffectProjectEntryDetailPanel } from "./components/effect-project-editor/EffectProjectEntryDetailPanel";
import { EffectProjectRowListPanel } from "./components/effect-project-editor/EffectProjectRowListPanel";
import { EffectProjectToolbar } from "./components/effect-project-editor/EffectProjectToolbar";
import { formatHexU32 } from "./components/effect-project-editor/effectProjectDisplayUtils";

type Props = {
  data: EffectProjectEditorDocument;
  /** Bumps when the authoritative document is replaced (load, save, reload, reset). */
  draftSyncGeneration: number;
  onChange: (next: EffectProjectEditorDocument) => void;
  /** Register a function that flushes the latest draft to the parent immediately (call before Save). */
  onFlushToParentReady?: (flush: () => EffectProjectEditorDocument) => void;
  disabled: boolean;
};

/** List row height estimate (id + LE/BE hex line; virtualizer measures actual height). */
const EFFECT_PROJECT_LIST_ROW_HEIGHT_PX = 56;

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
  const [searchMatchedIndices, setSearchMatchedIndices] = useState<number[]>(() =>
    cloneEffectProjectDocument(data).entries.map((_, i) => i),
  );
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;

  const [displayEndian, setDisplayEndian] = useState<"le" | "be">("be");
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);

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

  const visibleRowIndices = useMemo(() => {
    if (!searchQuery.trim()) {
      const n = draft.entries.length;
      const out = new Array<number>(n);
      for (let i = 0; i < n; i++) {
        out[i] = i;
      }
      return out;
    }
    return searchMatchedIndices.filter((i) => i >= 0 && i < draft.entries.length);
  }, [searchQuery, searchMatchedIndices, draft.entries.length]);

  const visibleRowKey = useMemo(() => visibleRowIndices.join(","), [visibleRowIndices]);

  useEffect(() => {
    setSelectedRowIndex((prev) => {
      if (visibleRowIndices.length === 0) return null;
      if (prev !== null && visibleRowIndices.includes(prev)) return prev;
      return visibleRowIndices[0]!;
    });
  }, [visibleRowKey, visibleRowIndices]);

  const listScrollRef = useRef<HTMLDivElement>(null);

  const listVirtualizer = useVirtualizer({
    count: visibleRowIndices.length,
    getScrollElement: () => listScrollRef.current,
    estimateSize: () => EFFECT_PROJECT_LIST_ROW_HEIGHT_PX,
    overscan: 8,
  });

  useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [searchQuery]);

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
    if (appendedIndex >= 0) {
      setSelectedRowIndex(appendedIndex);
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
      setSelectedRowIndex((prev) => {
        if (prev === null) return prev;
        if (prev === index) return null;
        if (prev > index) return prev - 1;
        return prev;
      });
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
      if (appendedIndex >= 0) {
        setSelectedRowIndex(appendedIndex);
      }
    },
    [patchDoc],
  );

  const patchSelected = useCallback(
    (patch: Partial<EffectProjectEntrySnapshot>) => {
      if (selectedRowIndex === null) return;
      patchEntry(selectedRowIndex, patch);
    },
    [patchEntry, selectedRowIndex],
  );

  const selectedEntry =
    selectedRowIndex !== null && draft.entries[selectedRowIndex] !== undefined
      ? draft.entries[selectedRowIndex]!
      : null;

  return (
    <div className="space-y-2 text-[10px]">
      <EffectProjectDocumentHeader draft={draft} />

      <div className="rounded border border-border/60 bg-muted/15 px-2 py-2">
        <EffectProjectToolbar
          searchQuery={searchQuery}
          onSearchChange={searchBoxChange}
          visibleCount={visibleRowIndices.length}
          totalCount={draft.entries.length}
          onAddRow={addRow}
          disabled={disabled}
          displayEndian={displayEndian}
          onDisplayEndianChange={setDisplayEndian}
        />

        {draft.entries.length === 0 ? (
          <p className="mt-3 py-6 text-center text-[11px] text-muted-foreground">No effect project rows.</p>
        ) : (
          <div className="mt-3 grid min-h-[min(52vh,380px)] grid-cols-1 gap-3 xl:min-h-0 xl:h-[min(52vh,480px)] xl:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border bg-card">
              <EffectProjectRowListPanel
                scrollRef={listScrollRef}
                rowVirtualizer={listVirtualizer}
                visibleRowIndices={visibleRowIndices}
                entries={draft.entries}
                selectedRowIndex={selectedRowIndex}
                onSelectRow={setSelectedRowIndex}
                disabled={disabled}
              />
            </div>

            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border bg-card">
              {selectedRowIndex === null || selectedEntry === null ? (
                <p className="px-3 py-10 text-center text-[11px] text-muted-foreground">
                  {visibleRowIndices.length === 0 && draft.entries.length > 0
                    ? "No rows match the filter."
                    : "Select a row from the list."}
                </p>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
                  <EffectProjectEntryDetailPanel
                    key={`detail-${selectedRowIndex}`}
                    rowIndex={selectedRowIndex}
                    entry={selectedEntry}
                    disabled={disabled}
                    displayEndian={displayEndian}
                    onPatch={patchSelected}
                    onDuplicate={() => copyAsNew(selectedRowIndex)}
                    onRemove={() => removeRow(selectedRowIndex)}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
