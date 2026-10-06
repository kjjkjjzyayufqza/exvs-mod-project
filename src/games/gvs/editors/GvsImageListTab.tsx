/*
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 * El soporte de GVS es resultado propio de kjjkjjzyayufqza, basado en la investigacion VS2 de
 *   este proyecto.
 * Autorennamen in diesem Hinweis niemals ersetzen oder entfernen.
 * Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este archivo.
 * Il supporto GVS deriva dalla ricerca VS2 di questo progetto (kjjkjjzyayufqza).
 * Upphovsperson kjjkjjzyayufqza. Produkt EXVS Mod Project. Kalla
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Licentie: PolyForm Shield 1.0.0. Gebruiksbeleid: ACCEPTABLE_USE.md.
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 */

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Download, Loader2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { runOperation } from "../../ps4-common/activity";
import { hex, joinPath, parentDir } from "../../ps4-common/format";
import { useAsync } from "../../ps4-common/useAsync";
import type { Ps4EditorContext } from "../../ps4-common/workspace/Ps4Workspace";
import { gvsApi } from "../api";
import { useGvsStore } from "../store";
import type { GvsArchiveLocation, GvsColumnKey, GvsTableView } from "../types";
import { ArchiveGate, archiveCaption } from "./ArchiveGate";
import { EditorError, EditorFrame, EditorNote, PathLine } from "./EditorFrame";
import { TextureCard } from "./GvsMemberDetail";
import { columnIndex, rowLabel } from "./tableModel";

const ROW_HEIGHT = 56;

export interface ImageColumn {
  key: GvsColumnKey;
  label: string;
}

interface GvsImageListTabProps {
  title: string;
  /** Table whose rows own the images. */
  schema: string;
  /** Columns holding image archive hashes. */
  columns: ImageColumn[];
  context: Ps4EditorContext;
}

function rowHashes(view: GvsTableView, columns: ImageColumn[], rowIndex: number): (number | null)[] {
  const row = view.document.rows[rowIndex];
  return columns.map((column) => {
    const index = columnIndex(view.document, column.key);
    const cell = index >= 0 ? row.cells[index] : undefined;
    return typeof cell === "number" && cell !== 0 ? cell : null;
  });
}

/** Image archives of one row: every nutexb of each extracted archive. */
function RowImages({ hashes, columns, context }: { hashes: (number | null)[]; columns: ImageColumn[]; context: Ps4EditorContext }) {
  const { t } = useTranslation("gvs-workspace");
  const workspace = useGvsStore((state) => state.workspace);
  const sourceRoot = useGvsStore((state) => state.sourceRoot);
  const workspaceRevision = useGvsStore((state) => state.workspaceRevision);
  const wanted = hashes.filter((hash): hash is number => hash !== null);
  const located = useAsync(() => gvsApi.locate(workspace, sourceRoot, wanted), [wanted.join(","), workspace, sourceRoot, workspaceRevision]);
  if (located.error) return <EditorError message={located.error} />;
  if (!located.data) return <EditorNote busy>{t("editors.loading")}</EditorNote>;
  const byHash = new Map(located.data.map((location) => [location.hash, location]));
  return (
    <div className="flex flex-col gap-4">
      {columns.map((column, index) => {
        const hash = hashes[index];
        const location = hash === null ? undefined : byHash.get(hash);
        return (
          <section key={column.label} className="flex flex-col gap-2">
            <div className="text-sm font-semibold">
              {column.label}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {location ? archiveCaption(location) : t("editors.images.none")}
              </span>
            </div>
            {location ? <ArchiveImages location={location} context={context} /> : null}
          </section>
        );
      })}
    </div>
  );
}

function ArchiveImages({ location, context }: { location: GvsArchiveLocation; context: Ps4EditorContext }) {
  const { t } = useTranslation("gvs-workspace");
  const packageRevision = useGvsStore((state) => state.packageRevision);
  const packageDir = location.packages[0];
  const view = useAsync(packageDir ? () => gvsApi.packageView(packageDir) : null, [packageDir, packageRevision]);
  if (!packageDir) return <ArchiveGate archive={location} onOpenContentIndex={context.openContentIndex} />;
  if (view.error) return <EditorError message={view.error} />;
  if (!view.data) return <EditorNote busy />;
  const textures = view.data.members.filter((member) => member.kind === "nutexb" && member.exists);
  if (textures.length === 0) return <div className="text-xs text-muted-foreground">{t("editors.images.noTextures")}</div>;
  return (
    <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
      {textures.map((member) => (
        <TextureCard key={member.index} path={joinPath(packageDir, member.path)} />
      ))}
    </div>
  );
}

/**
 * EXVS2 icon list: the rows of a list table on the left, the image archives
 * the selected row points at on the right (preview, export, import).
 */
export function GvsImageListTab({ title, schema, columns, context }: GvsImageListTabProps) {
  const { t } = useTranslation("gvs-workspace");
  const workspace = useGvsStore((state) => state.workspace);
  const sourceRoot = useGvsStore((state) => state.sourceRoot);
  const workspaceRevision = useGvsStore((state) => state.workspaceRevision);
  const workspaceChanged = useGvsStore((state) => state.workspaceChanged);
  const source = useAsync(() => gvsApi.tableSource(workspace, sourceRoot, schema), [workspace, sourceRoot, schema, workspaceRevision]);
  const file = source.data?.files[0];
  const loaded = useAsync(file ? () => gvsApi.tableRead(file.path, schema, sourceRoot) : null, [file?.path, schema, sourceRoot]);
  const view = loaded.data;

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [selected, setSelected] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const allHashes = useMemo(() => {
    if (!view) return [];
    const set = new Set<number>();
    view.document.rows.forEach((_, index) => rowHashes(view, columns, index).forEach((hash) => hash !== null && set.add(hash)));
    return [...set];
  }, [columns, view]);
  const locations = useAsync(
    allHashes.length > 0 ? () => gvsApi.locate(workspace, sourceRoot, allHashes) : null,
    [allHashes.join(","), workspace, sourceRoot, workspaceRevision],
  );
  const extracted = useMemo(
    () => new Set((locations.data ?? []).filter((location) => location.packages.length > 0).map((location) => location.hash)),
    [locations.data],
  );
  const missing = (locations.data ?? []).filter((location) => location.packages.length === 0 && location.source);

  const entries = useMemo(() => {
    if (!view || !source.data) return [];
    const labelKeys = source.data.schema.label;
    const query = deferredSearch.trim().toLowerCase();
    return view.document.rows
      .map((row, index) => ({ row, index, label: rowLabel(view.document, labelKeys, row), hashes: rowHashes(view, columns, index) }))
      .filter(({ row, label }) => !query || (label ?? "").toLowerCase().includes(query) || String(row.id).includes(query));
  }, [columns, deferredSearch, source.data, view]);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const extractMissing = async () => {
    if (!workspace || missing.length === 0) return;
    setExtracting(true);
    await runOperation("gvs", t("editors.images.extracting", { count: missing.length }), async () => {
      for (const location of missing) await gvsApi.extract(location.source as string, workspace, false);
      return missing.length;
    });
    setExtracting(false);
    workspaceChanged();
  };

  const current = entries.find((entry) => entry.index === selected) ?? entries[0];

  const meta = (
    <>
      {file ? <PathLine label={t("editors.file")} path={file.path} folder={parentDir(file.path)} /> : null}
      {view ? (
        <div className="mt-1 text-xs text-muted-foreground">
          {t("editors.images.summary", { rows: view.document.rows.length, extracted: extracted.size, total: allHashes.length })}
        </div>
      ) : null}
    </>
  );

  const actions = (
    <>
      <Button size="sm" variant="outline" onClick={() => loaded.reload()} disabled={!file} className="inline-flex items-center gap-2">
        <RefreshCw className="h-4 w-4" />
        {t("editors.reload")}
      </Button>
      <Button size="sm" onClick={() => void extractMissing()} disabled={extracting || missing.length === 0 || !workspace} className="inline-flex items-center gap-2">
        {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {t("editors.images.extractMissing", { count: missing.length })}
      </Button>
    </>
  );

  let body;
  if (source.error) body = <EditorError message={source.error} />;
  else if (!source.data) body = <EditorNote busy>{t("editors.loading")}</EditorNote>;
  else if (source.data.archive.packages.length === 0) body = <ArchiveGate archive={source.data.archive} onOpenContentIndex={context.openContentIndex} />;
  else if (loaded.error) body = <EditorError message={loaded.error} />;
  else if (!view) body = <EditorNote busy>{t("editors.loading")}</EditorNote>;
  else
    body = (
      <div className="flex h-full min-h-[24rem] gap-4">
        <div className="flex w-1/3 min-w-[16rem] flex-col overflow-hidden rounded-lg border p-3">
          <div className="mb-3 text-sm font-semibold">{t("editors.table.rowCount", { count: entries.length })}</div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t("editors.table.search")} value={search} onChange={(event) => setSearch(event.target.value)} className="h-8 pl-10" />
          </div>
          <div ref={listRef} className="min-h-0 flex-1 overflow-auto">
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative", width: "100%" }}>
              {virtualizer.getVirtualItems().map((item) => {
                const entry = entries[item.index];
                if (!entry) return null;
                const ready = entry.hashes.filter((hash) => hash !== null && extracted.has(hash)).length;
                const total = entry.hashes.filter((hash) => hash !== null).length;
                return (
                  <div
                    key={item.key}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: `${item.size}px`, transform: `translateY(${item.start}px)`, paddingBottom: 4, paddingRight: 4 }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelected(entry.index)}
                      className={cn(
                        "flex h-full w-full items-center justify-between gap-2 rounded-md border px-2 text-left transition-colors hover:bg-accent/50",
                        current?.index === entry.index && "bg-accent ring-2 ring-inset ring-primary",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{entry.label ?? t("editors.table.unnamed")}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {entry.row.id} · 0x{hex(entry.row.id)}
                        </span>
                      </span>
                      <span className={cn("shrink-0 rounded px-1 text-[10px]", ready === total ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>
                        {ready}/{total}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1 overflow-auto rounded-lg border p-4">
          {current ? (
            <RowImages key={current.index} hashes={current.hashes} columns={columns} context={context} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t("editors.table.selectRow")}</div>
          )}
        </div>
      </div>
    );

  return (
    <EditorFrame title={title} meta={meta} actions={actions}>
      {body}
    </EditorFrame>
  );
}
