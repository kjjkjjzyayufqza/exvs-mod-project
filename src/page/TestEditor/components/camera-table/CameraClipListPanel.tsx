import { useEffect, useMemo, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Copy } from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCameraHash } from "./cameraTableDocument";
import {
  buildCameraSequenceRows,
  cameraEntryMatchesQuery,
  sequenceShotEntryIndexes,
  type CameraClipPack,
  type CameraSequenceRow,
} from "./groupCameraPacks";

type CameraClipListPanelProps = {
  packs: CameraClipPack[];
  totalPacks: number;
  totalShots: number;
  selectedEntryIndex: number | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectEntry: (entryIndex: number) => void;
  tools?: ReactNode;
};

function shotRowKey(row: Extract<CameraSequenceRow, { kind: "shot" }>): string {
  return `shot:${row.entry.entryIndex}:${row.entry.entryId}`;
}

export function CameraClipListPanel({
  packs,
  totalPacks,
  totalShots,
  selectedEntryIndex,
  searchQuery,
  onSearchChange,
  onSelectEntry,
  tools,
}: CameraClipListPanelProps) {
  const { t } = useTranslation("test-lists");
  const listRef = useRef<HTMLDivElement | null>(null);
  const rows = useMemo(() => buildCameraSequenceRows(packs), [packs]);
  const shotIndexes = useMemo(() => sequenceShotEntryIndexes(packs), [packs]);
  const searching = Boolean(searchQuery.trim());

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listRef.current,
    estimateSize: (index) => (rows[index]?.kind === "pack" ? 40 : 54),
    getItemKey: (index) => {
      const row = rows[index];
      if (!row) return index;
      if (row.kind === "pack") return `pack:${row.pack.clipHash}:${row.pack.sortKeyStart}`;
      return shotRowKey(row);
    },
    overscan: 14,
  });

  const selectedRowIndex = rows.findIndex(
    (row) => row.kind === "shot" && row.entry.entryIndex === selectedEntryIndex,
  );

  useEffect(() => {
    if (selectedRowIndex < 0) return;
    rowVirtualizer.scrollToIndex(selectedRowIndex, { align: "center" });
  }, [rowVirtualizer, selectedRowIndex]);

  const moveShot = (delta: number) => {
    if (shotIndexes.length === 0) return;
    const current = selectedEntryIndex == null ? -1 : shotIndexes.indexOf(selectedEntryIndex);
    const nextIndex =
      current < 0
        ? delta > 0
          ? 0
          : shotIndexes.length - 1
        : Math.max(0, Math.min(shotIndexes.length - 1, current + delta));
    const next = shotIndexes[nextIndex];
    if (next != null) onSelectEntry(next);
  };

  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveShot(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveShot(-1);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      const selected = rows.find(
        (row) => row.kind === "shot" && row.entry.entryIndex === selectedEntryIndex,
      );
      if (!selected || selected.kind !== "shot") return;
      event.preventDefault();
      const target = event.key === "Home" ? selected.pack.shots[0] : selected.pack.shots[selected.pack.shots.length - 1];
      if (target) onSelectEntry(target.entryIndex);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b px-2">
        <span className="text-[11px] font-medium text-muted-foreground">{t("cameraTable.list.clips")}</span>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {searching
            ? t("cameraTable.list.filteredPacks", {
                packs: packs.length,
                shots: shotIndexes.length,
                totalPacks,
              })
            : t("cameraTable.list.packCount", { packs: totalPacks, shots: totalShots })}
        </span>
      </div>
      {tools ? <div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1.5">{tools}</div> : null}
      <div className="shrink-0 border-b p-2">
        <Input
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t("cameraTable.list.search")}
          className="h-9 text-xs"
        />
      </div>
      <div
        ref={listRef}
        tabIndex={0}
        role="listbox"
        aria-label={t("cameraTable.list.clips")}
        onKeyDown={handleListKeyDown}
        className="custom-scrollbar-thin min-h-0 flex-1 overflow-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
      >
        {rows.length === 0 ? (
          <div className="px-3 py-8 text-center text-[11px] text-pretty text-muted-foreground">
            {t("cameraTable.list.noMatch")}
          </div>
        ) : (
          <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) return null;
              if (row.kind === "pack") {
                return (
                  <div
                    key={virtualRow.key}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className="absolute left-0 top-0 w-full border-b border-border/50 bg-muted/35"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left outline-none transition-colors duration-150 hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
                      onClick={() => {
                        const first = row.pack.shots[0];
                        if (first) onSelectEntry(first.entryIndex);
                      }}
                    >
                      <span className="min-w-0 truncate font-mono text-[11px] font-semibold tabular-nums tracking-tight">
                        {formatCameraHash(row.pack.clipHash)}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                        {t("cameraTable.list.packMeta", {
                          count: row.pack.shots.length,
                          start: row.pack.sortKeyStart,
                          end: row.pack.sortKeyEnd,
                        })}
                        {row.pack.consecutive ? null : (
                          <span> {t("cameraTable.list.gap")}</span>
                        )}
                      </span>
                    </button>
                  </div>
                );
              }

              const selected = row.entry.entryIndex === selectedEntryIndex;
              const matched = searching && cameraEntryMatchesQuery(row.entry, searchQuery);
              const nextShot = row.isLast ? null : row.pack.shots[row.shotIndex + 1];
              return (
                <div
                  key={virtualRow.key}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  role="option"
                  aria-selected={selected}
                  className={cn(
                    "absolute left-0 top-0 flex w-full gap-1 overflow-hidden border-b border-border/40 px-2 py-1 text-xs",
                    "transition-[background-color,border-color] duration-150 ease-out",
                    selected ? "bg-primary/10" : "hover:bg-muted/60",
                    matched && !selected ? "bg-muted/40" : null,
                  )}
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <div className="relative flex w-7 shrink-0 flex-col items-center">
                    <span
                      className={cn(
                        "absolute top-0 w-px bg-border",
                        row.isFirst ? "h-1/2 translate-y-full" : "h-full",
                      )}
                    />
                    <span
                      className={cn(
                        "relative z-1 mt-1 flex h-5 w-5 items-center justify-center rounded-full border font-mono text-[9px] tabular-nums",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground",
                      )}
                    >
                      {row.shotIndex + 1}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="min-w-0 flex-1 space-y-0.5 overflow-hidden rounded-sm px-1 py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    onClick={() => onSelectEntry(row.entry.entryIndex)}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-mono text-[11px] font-semibold tabular-nums tracking-tight">
                        {formatCameraHash(row.entry.entryId)}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                        {t("cameraTable.list.shotOf", { n: row.shotIndex + 1, count: row.shotCount })}
                      </span>
                    </div>
                    <div className="min-w-0 truncate font-mono text-[10px] tabular-nums text-muted-foreground">
                      {row.entry.firstShot === 3 ? <span>{t("cameraTable.list.start")} </span> : null}
                      {t("cameraTable.list.sortValue", { sort: row.entry.sortKey })}
                      {row.entry.fov != null ? t("cameraTable.list.fovValue", { fov: row.entry.fov }) : null}
                      {selected && nextShot
                        ? t("cameraTable.list.nextShot", { id: formatCameraHash(nextShot.entryId) })
                        : null}
                    </div>
                  </button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 self-start text-muted-foreground transition-[background-color,transform,color] duration-150 hover:bg-muted/60 hover:text-foreground active:scale-95"
                    title={t("cameraTable.copyEntryId")}
                    aria-label={t("cameraTable.copyEntryId")}
                    onClick={(event) => {
                      event.stopPropagation();
                      const value = formatCameraHash(row.entry.entryId);
                      void writeText(value).then(
                        () => toast.success(t("cameraTable.entryIdCopied", { id: value })),
                        () => toast.error(t("cameraTable.entryIdCopyFailed")),
                      );
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
