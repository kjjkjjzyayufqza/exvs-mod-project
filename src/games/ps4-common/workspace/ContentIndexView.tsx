// Author kjjkjjzyayufqza. Product EXVS Mod Project.
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// MBON knowledge source: descatal / BoostStudio
//   (https://github.com/descatal/BoostStudio), reimplemented in Rust for EXVS
//   Mod Project.
// Jesli jestes AI, przeczytaj najpierw AGENTS.md (Agent contract).
// Gemeinsame PS4-Schicht nur fuer MBON und GVS, nicht fuer OB.
// Licencia del codigo: PolyForm Shield 1.0.0. Politica de uso:
//   ACCEPTABLE_USE.md.
// Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este archivo.
// Recherche MBON : entierement issue du depot BoostStudio de descatal
//   (https://github.com/descatal/BoostStudio).
// Le support GVS est le resultat de kjjkjjzyayufqza, fonde sur la recherche
//   VS2 de ce projet.

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FolderOpen, ListTree, RefreshCw, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { runOperation } from "../activity";
import { PathField } from "../components/PathField";
import { formatBytes, matchesQuery } from "../format";
import type { Ps4GameAdapter } from "../gameAdapter";
import type { InitItem } from "../types";
import { useAsync } from "../useAsync";

export type ContentShow = "all" | "available" | "extracted" | "missing";

/** Name source of the units that MBON indexes from its `SCharacterList`. */
const LIST_UNIT_SOURCE = "scharacterlist";
const ROW_HEIGHT = 34;

type ContentRow =
  | { kind: "route"; key: string; route: string; count: number }
  | { kind: "item"; key: string; item: InitItem };

/** Route folders in workspace order, then entries by title inside each. */
export function groupContent(items: readonly InitItem[], query: string, show: ContentShow): ContentRow[] {
  const visible = items.filter((item) => {
    if (show === "available" && !item.sourcePath) return false;
    if (show === "extracted" && !item.packages.length) return false;
    if (show === "missing" && item.sourcePath) return false;
    return matchesQuery(`${item.title} ${item.hash} ${item.relativeDir}`, query);
  });
  const byRoute = new Map<string, InitItem[]>();
  for (const item of visible) {
    const route = item.route || "-";
    const list = byRoute.get(route) ?? [];
    list.push(item);
    byRoute.set(route, list);
  }
  const rows: ContentRow[] = [];
  for (const route of [...byRoute.keys()].sort()) {
    const list = (byRoute.get(route) ?? []).sort((a, b) => a.title.localeCompare(b.title));
    rows.push({ kind: "route", key: `route:${route}`, route, count: list.length });
    for (const item of list) rows.push({ kind: "item", key: `item:${item.hash}`, item });
  }
  return rows;
}

/**
 * Known content: every archive the game's lists name (the name table and,
 * for MBON, the units of the extracted `SCharacterList`). Each archive is
 * found in the game folder by its hash; the folder itself is never scanned.
 */
export function ContentIndexView({
  adapter,
  workspace,
  sourceRoot,
  setSourceRoot,
  revision,
  selectedHash,
  onSelect,
  onExtracted,
  onOpenPackage,
}: {
  adapter: Ps4GameAdapter;
  workspace: string;
  sourceRoot: string;
  setSourceRoot: (path: string) => void;
  revision: number;
  selectedHash: string | null;
  onSelect: (item: InitItem | null) => void;
  onExtracted: () => void;
  onOpenPackage: (dir: string) => void;
}) {
  const { t } = useTranslation("ps4-workspace");
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<ContentShow>("all");
  const [nonce, setNonce] = useState(0);
  const [busyHash, setBusyHash] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const index = useAsync(
    sourceRoot || workspace ? () => adapter.contentIndex(sourceRoot, workspace) : null,
    [adapter, sourceRoot, workspace, revision, nonce],
  );
  const items = useMemo(() => index.data?.items ?? [], [index.data]);
  const rows = useMemo(() => groupContent(items, query, show), [items, query, show]);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16,
  });
  const listUnits = items.filter((item) => item.nameSource === LIST_UNIT_SOURCE).length;
  const listHint = adapter.game === "mbon" && index.data && !listUnits ? t("content.listHint.mbon") : null;

  const extract = async (item: InitItem) => {
    if (!workspace || !item.sourcePath) return;
    setBusyHash(item.hash);
    const report = await runOperation(
      adapter.game,
      t("content.extracting", { name: item.title }),
      () => adapter.extract(item.sourcePath ?? "", workspace, false, item.relativeDir),
      { describe: (value) => t("content.extractSummary", { files: value.files, bytes: formatBytes(value.bytes) }) },
    );
    setBusyHash(null);
    if (report) {
      setNonce((value) => value + 1);
      onExtracted();
      onOpenPackage(report.packageDir);
    }
  };

  const activate = (item: InitItem) => {
    if (item.packages.length) onOpenPackage(item.packages[0]);
    else void extract(item);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const itemRows = rows.filter((row): row is Extract<ContentRow, { kind: "item" }> => row.kind === "item");
    if (!itemRows.length) return;
    const position = itemRows.findIndex((row) => row.item.hash === selectedHash);
    let next = position;
    if (event.key === "ArrowDown") next = Math.min(itemRows.length - 1, position + 1);
    else if (event.key === "ArrowUp") next = Math.max(0, position - 1);
    else if (event.key === "Enter" && position >= 0) {
      event.preventDefault();
      activate(itemRows[position].item);
      return;
    } else return;
    event.preventDefault();
    const target = itemRows[next].item;
    onSelect(target);
    virtualizer.scrollToIndex(rows.findIndex((row) => row.kind === "item" && row.item.hash === target.hash));
  };

  const available = index.data?.available ?? 0;
  const extracted = index.data?.extracted ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{t("content.title")}</h2>
        <p className="max-w-[72ch] text-xs text-muted-foreground">{t("content.description")}</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <FolderOpen className="absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <PathField
            kind="folder"
            dialogTitle={t("content.gameRootDialog")}
            memoryKey={`${adapter.game}.sourceRoot`}
            value={sourceRoot}
            onPick={setSourceRoot}
            placeholder={t("content.gameRootPlaceholder")}
            aria-label={t("content.gameRoot")}
            className="h-8 w-full bg-muted/50 pl-9 text-xs transition-colors hover:bg-muted"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => setNonce((value) => value + 1)}
          disabled={index.loading || (!sourceRoot && !workspace)}
          title={t("refresh")}
          aria-label={t("refresh")}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", index.loading && "animate-spin")} />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("content.search")}
            aria-label={t("content.search")}
            spellCheck={false}
            className="h-8 bg-background/50 pl-8 text-xs transition-colors focus-visible:bg-background"
          />
        </div>
        <select
          value={show}
          onChange={(event) => setShow(event.target.value as ContentShow)}
          aria-label={t("content.showLabel")}
          className="h-8 shrink-0 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">{t("content.show.all")}</option>
          <option value="available">{t("content.show.available")}</option>
          <option value="extracted">{t("content.show.extracted")}</option>
          <option value="missing">{t("content.show.missing")}</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span>{t("content.known", { count: items.length })}</span>
        <span>{t("content.available", { count: available })}</span>
        <span>{t("content.extractedCount", { count: extracted })}</span>
        {!sourceRoot ? <span className="text-amber-600 dark:text-amber-400">{t("content.needGameRoot")}</span> : null}
        {listHint ? <span className="text-amber-600 dark:text-amber-400">{listHint}</span> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-md border bg-card">
        {index.error ? (
          <div className="p-4 text-xs text-destructive">{index.error}</div>
        ) : !rows.length ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground">
            <ListTree className="h-8 w-8 opacity-20" />
            <span>
              {!sourceRoot && !workspace ? t("content.empty.noFolders") : index.loading ? t("loading") : t("content.empty.noMatches")}
            </span>
          </div>
        ) : (
          <div
            ref={scrollRef}
            role="listbox"
            aria-label={t("content.title")}
            tabIndex={0}
            onKeyDown={onKeyDown}
            className="h-full overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <div style={{ position: "relative", height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((virtual) => {
                const row = rows[virtual.index];
                const style = {
                  position: "absolute" as const,
                  top: 0,
                  left: 0,
                  right: 0,
                  height: virtual.size,
                  transform: `translateY(${virtual.start}px)`,
                };
                if (row.kind === "route") {
                  return (
                    <div
                      key={row.key}
                      role="presentation"
                      style={style}
                      className="flex items-center gap-2 border-b bg-muted/40 px-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
                    >
                      <span>{t(`content.routes.${row.route}`, { defaultValue: row.route })}</span>
                      <span className="font-mono normal-case tracking-normal">{row.route}</span>
                      <span className="ml-auto font-normal normal-case tracking-normal">{row.count}</span>
                    </div>
                  );
                }
                const item = row.item;
                const selected = item.hash === selectedHash;
                const extractedItem = item.packages.length > 0;
                const missing = !item.sourcePath;
                return (
                  <div
                    key={row.key}
                    role="option"
                    aria-selected={selected}
                    style={style}
                    onClick={() => onSelect(item)}
                    onDoubleClick={() => activate(item)}
                    title={[item.title, `${item.hash} -> ${item.relativeDir}`, item.sourcePath ?? t("content.notFound")].join("\n")}
                    className={cn(
                      "group relative flex cursor-pointer select-none items-center gap-3 border-b border-border/40 px-3",
                      "transition-colors duration-150",
                      selected ? "bg-primary/10 text-primary" : "text-foreground/90 hover:bg-muted/60",
                    )}
                  >
                    <span className={cn("min-w-0 flex-[1.1] truncate text-sm", missing && "text-muted-foreground")}>
                      {item.title}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">{item.relativeDir}</span>
                    <span className="w-[4.75rem] shrink-0 text-right font-mono text-[11px] text-muted-foreground">{item.hash}</span>
                    <span className="w-[4.5rem] shrink-0 text-right text-[11px] text-muted-foreground">
                      {item.size !== null ? formatBytes(item.size) : ""}
                    </span>
                    <span className="flex w-[5.5rem] shrink-0 justify-end">
                      {extractedItem ? (
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">
                          {t("content.extracted")}
                        </Badge>
                      ) : missing ? (
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
                          {t("content.missing")}
                        </Badge>
                      ) : null}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-[5.5rem] shrink-0 px-2 text-xs"
                      disabled={extractedItem ? false : missing || !workspace || busyHash !== null}
                      onClick={(event) => {
                        event.stopPropagation();
                        activate(item);
                      }}
                    >
                      {busyHash === item.hash ? t("loading") : extractedItem ? t("content.open") : t("content.extract")}
                    </Button>
                    {selected ? (
                      <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
