import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useMemo, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import {
  getSuggestedJapaneseReplacement,
  type MissingCodepoint,
} from "@/utils/exvsStringAllowedRanges";

export type FontCoverageError = {
  characterId: number;
  fieldName: string;
  fieldLabel: string;
  missing: MissingCodepoint[];
};

type FontCoverageRow =
  | {
      kind: "header";
      key: string;
      characterId: number;
      fieldLabel: string;
    }
  | {
      kind: "codepoint";
      key: string;
      missing: MissingCodepoint;
    };

const FONT_COVERAGE_MODAL_DIMENSIONS = {
  width: 720,
  height: 620,
  minWidth: 440,
  minHeight: 340,
};

export function FontCoverageErrorDialog({
  open,
  errors,
  onClose,
  onForceSave,
}: {
  open: boolean;
  errors: FontCoverageError[];
  onClose: () => void;
  onForceSave: () => void;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const rows = useMemo<FontCoverageRow[]>(
    () =>
      errors.flatMap((error, errorIndex) => [
        {
          kind: "header" as const,
          key: `header:${error.characterId}:${error.fieldName}:${errorIndex}`,
          characterId: error.characterId,
          fieldLabel: error.fieldLabel,
        },
        ...error.missing.map((missing) => ({
          kind: "codepoint" as const,
          key: `codepoint:${error.characterId}:${error.fieldName}:${missing.cp}`,
          missing,
        })),
      ]),
    [errors],
  );
  const getScrollElement = useCallback(() => listRef.current, []);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement,
    estimateSize: (index) => (rows[index]?.kind === "header" ? 38 : 28),
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: 10,
  });

  if (!open) return null;

  return (
    <AppRndModalShell
      titleId="font-coverage-errors-title"
      title="Font Coverage Errors"
      subtitle={`${errors.length} field${errors.length === 1 ? "" : "s"} contain unsupported characters`}
      headerIcon={<AlertTriangle className="h-4 w-4 text-destructive" />}
      dimensions={FONT_COVERAGE_MODAL_DIMENSIONS}
      storageKey="font-coverage-errors-dialog-size"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2 px-4 py-3">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onForceSave}>Force Save</Button>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <p className="text-sm text-muted-foreground">
          Unsupported characters render as &quot;*&quot;. Replace them with supported Japanese equivalents where possible.
        </p>
        <div ref={listRef} className="min-h-0 flex-1 overflow-auto rounded-md border overscroll-contain">
          <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) return null;

              return (
                <div
                  key={virtualRow.key}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  className="absolute left-0 top-0 w-full px-3 py-1"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  {row.kind === "header" ? (
                    <div className="min-h-7 border-b text-sm font-medium">
                      Character ID {row.characterId} · {row.fieldLabel}
                    </div>
                  ) : (
                    <div className="ml-4 text-xs leading-5 text-muted-foreground">
                      {row.missing.char} ({row.missing.hex})
                      {getSuggestedJapaneseReplacement(row.missing.cp)
                        ? ` → suggest: ${getSuggestedJapaneseReplacement(row.missing.cp)}`
                        : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AppRndModalShell>
  );
}
