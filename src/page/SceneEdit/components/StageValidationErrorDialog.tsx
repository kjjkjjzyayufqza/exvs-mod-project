import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Box, Crosshair } from "lucide-react";
import type { ExvsStageValidationError } from "../utils/sceneSessionService";
import { groupErrorsByFolder } from "../utils/sceneValidationErrors";

interface StageValidationErrorDialogProps {
  open: boolean;
  title?: string;
  errors: ExvsStageValidationError[];
  knownFolderNames: readonly string[];
  onClose: () => void;
  onSelectFolder?: (folderName: string) => void;
}

const VALIDATION_MODAL_DIMENSIONS = {
  width: 640,
  height: 560,
  minWidth: 420,
  minHeight: 320,
};

type ValidationRow =
  | {
      kind: "group";
      key: string;
      folder: string | null;
    }
  | {
      kind: "error";
      key: string;
      message: string;
    };

export function StageValidationErrorDialog({
  open,
  title,
  errors,
  knownFolderNames,
  onClose,
  onSelectFolder,
}: StageValidationErrorDialogProps) {
  const { t } = useTranslation("scene-stage-dialogs");
  const resolvedTitle = title ?? t("validation.title");
  const listRef = useRef<HTMLDivElement | null>(null);
  const groups = useMemo(
    () => groupErrorsByFolder(errors, knownFolderNames),
    [errors, knownFolderNames],
  );
  const objectCount = groups.filter((g) => g.folder !== null).length;
  const rows = useMemo<ValidationRow[]>(
    () =>
      groups.flatMap((group) => [
        {
          kind: "group" as const,
          key: `group:${group.folder ?? "stage"}`,
          folder: group.folder,
        },
        ...group.errors.map((error, index) => ({
          kind: "error" as const,
          key: `error:${group.folder ?? "stage"}:${index}`,
          message: error.message,
        })),
      ]),
    [groups],
  );
  const getScrollElement = useCallback(() => listRef.current, []);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement,
    estimateSize: (index) => (rows[index]?.kind === "group" ? 38 : 30),
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: 10,
  });

  if (!open) return null;

  return (
    <AppRndModalShell
      titleId="stage-validation-error-title"
      title={resolvedTitle}
      subtitle={t(objectCount > 0 ? "validation.subtitleWithObjects" : "validation.subtitle", { count: errors.length, objectCount })}
      headerIcon={<AlertTriangle className="h-4 w-4 text-destructive" />}
      dimensions={VALIDATION_MODAL_DIMENSIONS}
      storageKey="stage-validation-error-dialog-size"
      onClose={onClose}
      footer={
        <div className="flex justify-end px-4 py-3">
          <Button type="button" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <p className="text-sm text-muted-foreground">
          {t("validation.instructions")}
        </p>
        <div ref={listRef} className="min-h-0 flex-1 overflow-auto rounded border overscroll-contain">
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
                  {row.kind === "group" ? (
                    <div className="flex min-h-7 items-center gap-2 border-b text-sm font-medium text-foreground">
                      <Box className="h-4 w-4 shrink-0 text-destructive" />
                      <span className="truncate">{row.folder ?? t("validation.stage")}</span>
                      {row.folder && onSelectFolder ? (
                    <button
                      type="button"
                      className="ml-auto flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                          onClick={() => onSelectFolder(row.folder!)}
                      title={t("validation.locateTitle")}
                    >
                      <Crosshair className="h-3 w-3" />
                      {t("validation.locate")}
                    </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="ml-6 break-all border-l pl-3 text-xs leading-5 text-muted-foreground">
                      {row.message}
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
