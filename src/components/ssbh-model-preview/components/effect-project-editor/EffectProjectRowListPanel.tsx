import type { RefObject } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import type { EffectProjectEntrySnapshot } from "@/models/characterEffectProject";
import { cn } from "@/lib/utils";
import { formatEffectProjectIdLeBeLine } from "./effectProjectDisplayUtils";

type Props = {
  scrollRef: RefObject<HTMLDivElement | null>;
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  visibleRowIndices: number[];
  entries: EffectProjectEntrySnapshot[];
  selectedRowIndex: number | null;
  onSelectRow: (bufferIndex: number) => void;
  disabled: boolean;
};

export function EffectProjectRowListPanel({
  scrollRef,
  rowVirtualizer,
  visibleRowIndices,
  entries,
  selectedRowIndex,
  onSelectRow,
  disabled,
}: Props) {
  const { t } = useTranslation("ssbh-motion");
  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_3rem] gap-2 border-b bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{t("effectProject.columnId")}</span>
        <span className="text-right">{t("effectProject.columnBuf")}</span>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto overscroll-contain">
        {visibleRowIndices.length === 0 ? (
          <div className="px-3 py-8 text-center text-[11px] text-muted-foreground">{t("effectProject.noMatch")}</div>
        ) : (
          <div className="relative w-full" style={{ height: totalSize }}>
            {virtualItems.map((vi) => {
              const bufferIndex = visibleRowIndices[vi.index];
              const entry = bufferIndex !== undefined ? entries[bufferIndex] : undefined;
              if (entry === undefined) return null;
              const selected = selectedRowIndex === bufferIndex;
              return (
                <div
                  key={`effect-project-list-${bufferIndex}`}
                  data-index={vi.index}
                  ref={rowVirtualizer.measureElement}
                  className="absolute left-0 top-0 w-full border-b border-border/40"
                  style={{ transform: `translateY(${vi.start}px)` }}
                >
                  <button
                    type="button"
                    disabled={disabled}
                    className={cn(
                      "grid w-full grid-cols-[minmax(0,1fr)_3rem] items-center gap-2 px-3 py-2 text-left transition-colors",
                      selected ? "bg-muted" : "hover:bg-muted/50",
                    )}
                    onClick={() => onSelectRow(bufferIndex)}
                  >
                    <div
                      className="min-w-0 break-all font-mono text-[10px] leading-snug tabular-nums"
                      title={formatEffectProjectIdLeBeLine(entry.EffectProjectId)}
                      data-i18n-ignore=""
                    >
                      {formatEffectProjectIdLeBeLine(entry.EffectProjectId)}
                    </div>
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{bufferIndex}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
