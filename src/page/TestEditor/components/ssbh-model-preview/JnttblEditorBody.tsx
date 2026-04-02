import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Bug, Copy, FolderOpen, Plus, Trash2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { JnttblEditorDocument, JnttblEntryRow } from "./jnttblIoService";
import { appendJnttblEntry, removeJnttblEntryAt, replaceJnttblEntryAt } from "./jnttblEditorUtils";
import { ssbhReadNusktbBoneNames } from "./jnttblIoService";
import { BoneIndexSearchSelect } from "./components/BoneIndexSearchSelect";
import { debugFillMissingJnttblEntries } from "./jnttblDebugFill";

function formatHashHex32(v: number): string {
  return (v >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

/** Display u32 hash as byte pairs in little-endian order (LSB first). */
function formatHashHex32LE(v: number): string {
  const x = v >>> 0;
  const b0 = x & 0xff;
  const b1 = (x >>> 8) & 0xff;
  const b2 = (x >>> 16) & 0xff;
  const b3 = (x >>> 24) & 0xff;
  const h = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");
  return `${h(b0)}${h(b1)}${h(b2)}${h(b3)}`;
}

function parseHashHex32(s: string): number {
  const t = s.trim().replace(/^0x/i, "");
  if (!t) {
    throw new Error("Hash id is empty");
  }
  if (!/^[0-9a-fA-F]{1,8}$/.test(t)) {
    throw new Error("Hash id must be 1-8 hex digits");
  }
  return Number.parseInt(t, 16) >>> 0;
}

function parseHashHex32LE(s: string): number {
  let t = s.trim().replace(/^0x/i, "");
  if (!t) {
    throw new Error("Hash id is empty");
  }
  if (!/^[0-9a-fA-F]{1,8}$/.test(t)) {
    throw new Error("Hash id must be 1-8 hex digits");
  }
  if (t.length % 2 === 1) t = `0${t}`;
  if (t.length > 8) {
    throw new Error("Hash id is too long");
  }
  t = t.padEnd(8, "0").slice(0, 8);
  const b0 = Number.parseInt(t.slice(0, 2), 16);
  const b1 = Number.parseInt(t.slice(2, 4), 16);
  const b2 = Number.parseInt(t.slice(4, 6), 16);
  const b3 = Number.parseInt(t.slice(6, 8), 16);
  return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
}

function matchesJnttblSearch(row: JnttblEntryRow, qRaw: string, boneNames: string[] | null): boolean {
  const q = qRaw.trim();
  if (!q) return true;

  const hash = row.hashId >>> 0;
  const bi = row.boneIndex >>> 0;
  const ql = q.toLowerCase();

  const hexBe = formatHashHex32(hash);
  const hexLe = formatHashHex32LE(hash);
  if (hexBe.toLowerCase().includes(ql)) return true;
  if (hexLe.toLowerCase().includes(ql)) return true;
  if (hash.toString(10).includes(q)) return true;

  if (bi.toString().includes(q)) return true;

  const nm = boneNames?.[bi];
  if (nm && nm.toLowerCase().includes(ql)) return true;

  return false;
}

function JnttblHashField({
  hashId,
  endian,
  disabled,
  id,
  name,
  onCommit,
}: {
  hashId: number;
  endian: "be" | "le";
  disabled: boolean;
  id: string;
  name: string;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState(() =>
    (endian === "be" ? formatHashHex32 : formatHashHex32LE)(hashId),
  );
  useEffect(() => {
    const f = endian === "be" ? formatHashHex32 : formatHashHex32LE;
    setText(f(hashId));
  }, [hashId, endian]);

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
          const parsed = endian === "be" ? parseHashHex32(text) : parseHashHex32LE(text);
          onCommit(parsed);
        } catch (err) {
          toast.error(String(err));
          const f = endian === "be" ? formatHashHex32 : formatHashHex32LE;
          setText(f(hashId));
        }
      }}
    />
  );
}

type JnttblEditorBodyProps = {
  data: JnttblEditorDocument;
  onChange: (next: JnttblEditorDocument) => void;
  disabled?: boolean;
};

function formIdPart(reactId: string): string {
  return reactId.replace(/:/g, "");
}

/** Matches typical row height (input h-8 + padding) for virtualization. */
const JNTTBL_ENTRY_ROW_HEIGHT_px = 44;

export function JnttblEditorBody({
  data,
  onChange,
  disabled = false,
}: JnttblEditorBodyProps) {
  const reactId = useId();
  const fid = formIdPart(reactId);
  const dataRef = useRef(data);
  dataRef.current = data;

  const pickNusktb = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "NUsktb", extensions: ["nusktb"] }],
    });
    if (typeof selected !== "string" || !selected.trim()) return;
    const path = selected.trim();
    const d = dataRef.current;
    try {
      const names = await ssbhReadNusktbBoneNames(path);
      const boneCount = Math.min(0xffffffff, names.length) >>> 0;
      onChange({
        ...d,
        boneCount,
        nusktbPathOverride: path,
        nusktb: {
          ...d.nusktb,
          autoLoadedPath: path,
          nusktbFound: true,
          boneNames: names,
          loadError: null,
        },
      });
      toast.success("Loaded nusktb bone list");
    } catch (e) {
      toast.error(String(e));
    }
  }, [onChange]);

  const boneNames = data.nusktb.boneNames;
  const entries = data.entries;
  const entryScrollRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [hashDisplayEndian, setHashDisplayEndian] = useState<"be" | "le">("be");

  const filteredIndices = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < entries.length; i++) {
      if (matchesJnttblSearch(entries[i], searchQuery, boneNames)) {
        out.push(i);
      }
    }
    return out;
  }, [entries, searchQuery, boneNames]);

  const rowVirtualizer = useVirtualizer({
    count: filteredIndices.length,
    getScrollElement: () => entryScrollRef.current,
    estimateSize: () => JNTTBL_ENTRY_ROW_HEIGHT_px,
    overscan: 10,
  });

  useEffect(() => {
    entryScrollRef.current?.scrollTo({ top: 0 });
  }, [searchQuery]);

  const formatHashForDisplay = useMemo(
    () => (hashDisplayEndian === "be" ? formatHashHex32 : formatHashHex32LE),
    [hashDisplayEndian],
  );

  const copyFilteredList = useCallback(async () => {
    if (filteredIndices.length === 0) {
      throw new Error("No rows match the current filter");
    }
    const lines = filteredIndices.map((rowIndex) => {
      const row = entries[rowIndex];
      if (!row) {
        throw new Error("Entry row is missing");
      }
      const bi = row.boneIndex >>> 0;
      const boneName = boneNames?.[bi] ?? "";
      const hashStr = formatHashForDisplay(row.hashId >>> 0);
      return `${rowIndex + 1}\t${hashStr}\t${bi}\t${boneName}`;
    });
    const header = `row\thash_hex_${hashDisplayEndian}\tbone_index\tbone_name`;
    const text = `${header}\n${lines.join("\n")}`;
    await writeText(text);
    toast.success(`Copied ${lines.length} row(s) to clipboard`);
  }, [boneNames, entries, filteredIndices, formatHashForDisplay, hashDisplayEndian]);

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
          <Label htmlFor={`${fid}-bone-count`} className="text-[11px] text-muted-foreground">
            Bone count (header)
          </Label>
          <Input
            id={`${fid}-bone-count`}
            name={`${fid}-bone-count`}
            type="number"
            min={0}
            className="h-8 font-mono text-[11px]"
            disabled={disabled}
            autoComplete="off"
            value={data.boneCount}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              if (!Number.isFinite(n) || n < 0) return;
              onChange({ ...data, boneCount: Math.min(0xffffffff, n) >>> 0 });
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${fid}-flag`} className="text-[11px] text-muted-foreground">
            Flag (i32)
          </Label>
          <Input
            id={`${fid}-flag`}
            name={`${fid}-flag`}
            type="number"
            className="h-8 font-mono text-[11px]"
            disabled={disabled}
            autoComplete="off"
            value={data.flag}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              if (!Number.isFinite(n) || n < -0x8000_0000 || n > 0x7fff_ffff) return;
              onChange({ ...data, flag: n | 0 });
            }}
          />
        </div>
      </div>

      <div className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-medium">Skeleton (.nusktb)</p>
            <p className="break-all font-mono text-[10px] text-muted-foreground">
              Maya: {data.nusktb.mayaPath}
            </p>
            <p className="break-all font-mono text-[10px] text-muted-foreground">
              Plain: {data.nusktb.plainPath}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-[10px]"
            disabled={disabled}
            onClick={() => void pickNusktb()}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Pick .nusktb
          </Button>
        </div>
        {!data.nusktb.nusktbFound && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            No matching .nusktb found next to this .jnttbl. Use Pick or enter bone indices manually.
          </p>
        )}
        {data.nusktb.loadError && (
          <p className="text-[11px] text-destructive">{data.nusktb.loadError}</p>
        )}
        {data.nusktb.nusktbFound && data.nusktb.autoLoadedPath && (
          <p className="break-all font-mono text-[10px] text-muted-foreground" title={data.nusktb.autoLoadedPath}>
            Loaded: {data.nusktb.autoLoadedPath}
            {data.nusktbPathOverride ? " (manual)" : ""}
          </p>
        )}
        {boneNames && boneNames.length > 0 && (
          <p className="text-[10px] text-muted-foreground">{boneNames.length} bones in skeleton.</p>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <p id={`${fid}-pairs-heading`} className="text-[11px] text-muted-foreground">
          Hash → bone index pairs
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-[10px]"
            disabled={disabled || !boneNames?.length}
            title="Append rows for bone indices not yet listed: hash = CRC32(bone name + random salt)."
            onClick={() => {
              try {
                const { document: nextDoc, addedCount } = debugFillMissingJnttblEntries(data);
                if (addedCount === 0) {
                  toast.info("Every bone index already has at least one entry.");
                  return;
                }
                onChange(nextDoc);
                toast.success(
                  `Debug: added ${addedCount} row(s) (CRC32 of bone name + random salt).`,
                );
              } catch (err) {
                toast.error(String(err));
              }
            }}
          >
            <Bug className="h-3.5 w-3.5" />
            Fill missing (debug)
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 gap-1 text-[10px]"
            disabled={disabled}
            onClick={() =>
              onChange({
                ...data,
                entries: appendJnttblEntry(data.entries, { hashId: 0, boneIndex: 0 }),
              })
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Add row
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
        <div className="min-w-[220px] flex-1 space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor={`${fid}-entry-search`} className="text-[11px] text-muted-foreground">
              Search (hash / bone index or name)
            </Label>
            {entries.length > 0 && (
              <span
                className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground"
                aria-live="polite"
              >
                {searchQuery.trim()
                  ? `${filteredIndices.length} / ${entries.length}`
                  : `${entries.length} total`}
              </span>
            )}
          </div>
          <Input
            id={`${fid}-entry-search`}
            name={`${fid}-entry-search`}
            className="h-8 font-mono text-[11px]"
            disabled={disabled}
            autoComplete="off"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Hex, decimal, bone index, or bone name…"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-[10px]"
            disabled={disabled || filteredIndices.length === 0}
            title="Copy filtered rows as TSV (tab-separated)"
            onClick={() =>
              void copyFilteredList().catch((err) => {
                toast.error(String(err));
              })
            }
          >
            <Copy className="h-3.5 w-3.5" />
            Copy list
          </Button>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] leading-none text-muted-foreground">Hash display</span>
            <ToggleGroup
              type="single"
              value={hashDisplayEndian}
              onValueChange={(v) => {
                if (v === "be" || v === "le") setHashDisplayEndian(v);
              }}
              variant="outline"
              size="sm"
              className="h-8 min-h-8"
              disabled={disabled}
            >
              <ToggleGroupItem value="be" className="h-7 px-2 text-[10px]" aria-label="Big-endian hex display">
                BE
              </ToggleGroupItem>
              <ToggleGroupItem value="le" className="h-7 px-2 text-[10px]" aria-label="Little-endian hex display">
                LE
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </div>

      <div
        className="overflow-x-auto rounded-md border"
        role="group"
        aria-labelledby={`${fid}-pairs-heading`}
      >
        <div className="min-w-[480px] text-[11px]">
          <div
            className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1.5fr)_2.5rem] border-b bg-muted/40 text-left"
            role="row"
          >
            <div className="px-2 py-2 font-medium" role="columnheader">
              #
            </div>
            <div id={`${fid}-col-hash`} className="px-2 py-2 font-medium" role="columnheader">
              Hash id (hex u32)
              <span className="ml-1 font-mono text-[10px] font-normal text-muted-foreground">
                ({hashDisplayEndian.toUpperCase()})
              </span>
            </div>
            <div id={`${fid}-col-bone`} className="px-2 py-2 font-medium" role="columnheader">
              Bone index
            </div>
            <div className="w-10 px-1 py-2" role="columnheader" />
          </div>
          <div
            ref={entryScrollRef}
            className="max-h-[min(55vh,480px)] overflow-auto overscroll-contain"
          >
            {entries.length === 0 ? (
              <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">No entries. Add a row.</p>
            ) : filteredIndices.length === 0 ? (
              <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">No rows match the search.</p>
            ) : (
              <div
                className="relative w-full"
                style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const rowIndex = filteredIndices[virtualRow.index];
                  if (rowIndex === undefined) return null;
                  const row = entries[rowIndex];
                  if (!row) return null;
                  return (
                    <div
                      key={virtualRow.key}
                      className="absolute left-0 right-0 grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1.5fr)_2.5rem] border-b border-border/50"
                      role="row"
                      style={{
                        top: 0,
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div className="px-2 py-1 font-mono text-muted-foreground" role="cell">
                        {rowIndex + 1}
                      </div>
                      <div className="px-2 py-1" role="cell">
                        <Label htmlFor={`${fid}-hash-${rowIndex}`} className="sr-only">
                          Hash id hex row {rowIndex + 1}
                        </Label>
                        <JnttblHashField
                          hashId={row.hashId}
                          endian={hashDisplayEndian}
                          disabled={disabled}
                          id={`${fid}-hash-${rowIndex}`}
                          name={`${fid}-hash-${rowIndex}`}
                          onCommit={(hashId) => {
                            onChange({
                              ...data,
                              entries: replaceJnttblEntryAt(data.entries, rowIndex, {
                                ...row,
                                hashId,
                              }),
                            });
                          }}
                        />
                      </div>
                      <div className="px-2 py-1 align-top" role="cell">
                        <BoneIndexSearchSelect
                          value={row.boneIndex}
                          boneNames={boneNames}
                          disabled={disabled}
                          instanceId={`${fid}-r${rowIndex}`}
                          ariaLabel={`Bone index row ${rowIndex + 1}`}
                          onChange={(boneIndex) =>
                            onChange({
                              ...data,
                              entries: replaceJnttblEntryAt(data.entries, rowIndex, {
                                ...row,
                                boneIndex,
                              }),
                            })
                          }
                        />
                      </div>
                      <div className="px-1 py-1" role="cell">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          disabled={disabled}
                          aria-label={`Remove row ${rowIndex + 1}`}
                          onClick={() =>
                            onChange({
                              ...data,
                              entries: removeJnttblEntryAt(data.entries, rowIndex),
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
