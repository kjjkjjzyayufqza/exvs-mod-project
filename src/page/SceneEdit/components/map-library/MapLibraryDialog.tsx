import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { FolderOpen, Library, Loader2, PackageOpen, RefreshCw, Search, X } from "lucide-react";

import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { StageListData } from "@/models/stageListEntry";
import { trimmedConfigPath, useConfigStore } from "@/store/configStore";
import {
  buildMapLibraryRows,
  extractMapPack,
  resolveMapWorkspace,
  type MapLibraryRow,
} from "@/services/mapLibrary/mapLibraryService";
import {
  DATA_TABLE,
  DATA_TABLE_CELL,
  DATA_TABLE_HEAD,
  DATA_TABLE_MONO,
  DATA_TABLE_ROW,
  TOOL_BTN,
  TOOL_WINDOW_BAR,
  TOOL_WINDOW_BODY,
  TOOL_WINDOW_SCROLL,
  TOOL_WINDOW_STATUS,
} from "../propertyPanelStyles";

const MAP_LIBRARY_MODAL_DIMENSIONS = {
  width: 880,
  height: 620,
  minWidth: 620,
  minHeight: 400,
};

/** Status dot colours: ready / not built / source missing. */
const STATUS_EXTRACTED = "#4f9e6a";
const STATUS_NOT_EXTRACTED = "#8a8f98";
const STATUS_MISSING = "#cf5a52";

interface MapLibraryDialogProps {
  onClose: () => void;
  /** Open an extracted pack root in the editor (the pack folder, not its 0/0 stage root). */
  onOpenPackRoot: (packRoot: string) => void;
  /** Map hash to pre-filter on, e.g. the one a loaded mission script names. */
  focusMapHash?: number | null;
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; rows: MapLibraryRow[]; libraryRoot: string }
  | { status: "error"; message: string };

function hashLabel(hash: number): string {
  return `0x${(hash >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

export function MapLibraryDialog({
  onClose,
  onOpenPackRoot,
  focusMapHash,
}: MapLibraryDialogProps) {
  const { t } = useTranslation("scene-map-library");
  const workspaceRoot = useConfigStore((state) => trimmedConfigPath(state.testEditorFolder));
  const obDplCachePath = useConfigStore((state) => trimmedConfigPath(state.obDplCachePath));

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [search, setSearch] = useState("");
  const [selectedPackHash, setSelectedPackHash] = useState<number | null>(null);
  const [busyPackHash, setBusyPackHash] = useState<number | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const workspace = await resolveMapWorkspace(workspaceRoot);
      const list = await invoke<StageListData>("parse_typed_param_file", {
        path: workspace.stageListPath,
        paramType: "stagelist",
      });
      const rows = await buildMapLibraryRows({
        entries: list.entries,
        dplCacheDir: obDplCachePath,
        libraryRoot: workspace.libraryRoot,
      });
      setState({ status: "ready", rows, libraryRoot: workspace.libraryRoot });
    } catch (error) {
      setState({ status: "error", message: String(error) });
    }
  }, [obDplCachePath, workspaceRoot]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (focusMapHash == null) return;
    setSearch(hashLabel(focusMapHash));
  }, [focusMapHash]);

  const rows = state.status === "ready" ? state.rows : [];

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        row.stageName.toLowerCase().includes(needle) ||
        row.packFolderName.toLowerCase().includes(needle) ||
        row.packHashName.toLowerCase().includes(needle) ||
        hashLabel(row.mapHash).toLowerCase().includes(needle),
    );
  }, [rows, search]);

  const extractedCount = useMemo(() => rows.filter((row) => row.extracted).length, [rows]);

  const handleExtract = useCallback(
    async (row: MapLibraryRow, thenOpen: boolean) => {
      setBusyPackHash(row.packHash);
      try {
        const result = await extractMapPack(row);
        toast.success(t("success.extracted", { name: row.packFolderName }), {
          description: t("success.extractedDetail", {
            files: result.totalFiles,
            size: (result.totalBytes / (1024 * 1024)).toFixed(1),
          }),
        });
        if (result.warnings.length > 0) {
          toast.warning(t("warnings.extract", { count: result.warnings.length }), {
            description: result.warnings.slice(0, 3).join("\n"),
          });
        }
        await load();
        if (thenOpen) {
          onOpenPackRoot(row.extractedPath);
          onClose();
        }
      } catch (error) {
        toast.error(t("errors.extractFailed"), { description: String(error) });
      } finally {
        setBusyPackHash(null);
      }
    },
    [load, onClose, onOpenPackRoot, t],
  );

  const handleOpen = useCallback(
    (row: MapLibraryRow) => {
      onOpenPackRoot(row.extractedPath);
      onClose();
    },
    [onClose, onOpenPackRoot],
  );

  return (
    <AppRndModalShell
      title={t("title")}
      subtitle={state.status === "ready" ? state.libraryRoot : undefined}
      titleId="scene-map-library"
      headerIcon={<Library className="h-4 w-4" />}
      dimensions={MAP_LIBRARY_MODAL_DIMENSIONS}
      storageKey="scene-map-library"
      onClose={onClose}
    >
      <div className={TOOL_WINDOW_BODY}>
        <div className={TOOL_WINDOW_BAR}>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-6 rounded-sm border-border/50 bg-muted/25 pl-[1.625rem] pr-6 text-[11px] shadow-none focus-visible:ring-1"
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button
                type="button"
                className="absolute right-0.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-100 hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                onClick={() => setSearch("")}
                aria-label={t("actions.clearSearch")}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className={TOOL_BTN}
            onClick={() => void load()}
            disabled={state.status === "loading"}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", state.status === "loading" && "animate-spin")}
            />
            {t("actions.refresh")}
          </Button>
        </div>

        <div className={TOOL_WINDOW_SCROLL}>
          {state.status === "error" && (
            <div className="m-2 rounded-sm border border-destructive/45 bg-destructive/10 px-2 py-1.5">
              <p className="text-[11px] font-semibold text-destructive">
                {t("errors.loadFailed")}
              </p>
              <p className="mt-1 break-all font-mono text-[10px] leading-relaxed opacity-80">
                {state.message}
              </p>
              <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground [text-wrap:pretty]">
                {t("errors.loadHint")}
              </p>
            </div>
          )}

          {state.status === "loading" && <MapLibrarySkeleton />}

          {state.status === "ready" && (
            <table className={DATA_TABLE}>
              <thead>
                <tr>
                  <th className={cn(DATA_TABLE_HEAD, "w-6")} aria-label={t("columns.status")} />
                  <th className={DATA_TABLE_HEAD}>{t("columns.stage")}</th>
                  <th className={cn(DATA_TABLE_HEAD, "w-[7.5rem]")}>{t("columns.mapHash")}</th>
                  <th className={DATA_TABLE_HEAD}>{t("columns.pack")}</th>
                  <th className={cn(DATA_TABLE_HEAD, "w-[13rem] text-right")}>
                    {t("columns.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const selected = selectedPackHash === row.packHash;
                  const busy = busyPackHash === row.packHash;
                  const statusColor = !row.packAvailable
                    ? STATUS_MISSING
                    : row.extracted
                      ? STATUS_EXTRACTED
                      : STATUS_NOT_EXTRACTED;
                  const statusText = !row.packAvailable
                    ? t("status.packMissing")
                    : row.extracted
                      ? t("status.extracted")
                      : t("status.notExtracted");

                  return (
                    <tr
                      key={`${row.stageIndex}-${row.packHash}`}
                      data-selected={selected}
                      className={DATA_TABLE_ROW}
                      onClick={() => setSelectedPackHash(selected ? null : row.packHash)}
                      onDoubleClick={() => {
                        if (row.extracted) handleOpen(row);
                        else if (row.packAvailable) void handleExtract(row, true);
                      }}
                    >
                      <td className={cn(DATA_TABLE_CELL, "pr-0")}>
                        <span
                          className="block h-2 w-2 rounded-full"
                          style={{ backgroundColor: statusColor }}
                          title={statusText}
                        />
                      </td>
                      <td className={cn(DATA_TABLE_CELL, "max-w-0")}>
                        <div className="truncate">{row.stageName}</div>
                        <div className="truncate text-[9px] uppercase tracking-wider text-muted-foreground">
                          {statusText}
                        </div>
                      </td>
                      <td className={DATA_TABLE_MONO}>{hashLabel(row.mapHash)}</td>
                      <td className={cn(DATA_TABLE_CELL, "max-w-0")}>
                        <div className="truncate">{row.packFolderName}</div>
                        <div className="truncate font-mono text-[9px] tabular-nums text-muted-foreground">
                          {row.packHashName}
                        </div>
                      </td>
                      <td className={cn(DATA_TABLE_CELL, "text-right")}>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={TOOL_BTN}
                            disabled={!row.packAvailable || busy}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleExtract(row, !row.extracted);
                            }}
                          >
                            {busy ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <PackageOpen className="h-3 w-3" />
                            )}
                            {row.extracted ? t("actions.reExtract") : t("actions.extractAndOpen")}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            className={TOOL_BTN}
                            disabled={!row.extracted}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleOpen(row);
                            }}
                          >
                            <FolderOpen className="h-3 w-3" />
                            {t("actions.open")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-2 py-10 text-center">
                      <p className="text-[11px] text-muted-foreground [text-wrap:pretty]">
                        {t("status.noMatches")}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {state.status === "ready" && (
          <div className={TOOL_WINDOW_STATUS}>
            <span className="font-mono tabular-nums">
              {t("status.summary", { shown: visibleRows.length, total: rows.length })}
            </span>
            <span className="ml-auto flex items-center gap-1.5 font-mono tabular-nums">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: STATUS_EXTRACTED }}
              />
              {t("status.extractedCount", { count: extractedCount })}
            </span>
          </div>
        )}
      </div>
    </AppRndModalShell>
  );
}

/** Row-shaped placeholders, so the table does not jump when the list lands. */
function MapLibrarySkeleton() {
  return (
    <div className="flex flex-col" aria-hidden>
      {Array.from({ length: 10 }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 border-b border-border/25 px-2 py-[7px]"
        >
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-muted-foreground/25" />
          <span className="h-3 flex-1 animate-pulse rounded-sm bg-muted-foreground/15" />
          <span className="h-3 w-24 animate-pulse rounded-sm bg-muted-foreground/10" />
          <span className="h-3 w-40 animate-pulse rounded-sm bg-muted-foreground/15" />
          <span className="h-4 w-44 animate-pulse rounded-sm bg-muted-foreground/10" />
        </div>
      ))}
    </div>
  );
}
