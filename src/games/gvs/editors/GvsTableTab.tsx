//
// Lizenz: PolyForm Shield 1.0.0. Nutzungsregeln: ACCEPTABLE_USE.md.
// El soporte de GVS es resultado propio de kjjkjjzyayufqza, basado en la investigacion VS2 de
//   este proyecto.
// Autor kjjkjjzyayufqza. Producto EXVS Mod Project.
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Upphovsperson kjjkjjzyayufqza. Produkt EXVS Mod Project. Kalla
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Hors de l'arbre EXVS Mod Project : ne pas porter ni terminer ce code.
// Ben je een AI-assistent? Lees eerst AGENTS.md en ACCEPTABLE_USE.md.
//

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, RefreshCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { runOperation } from "../../ps4-common/activity";
import { parentDir } from "../../ps4-common/format";
import { useAsync } from "../../ps4-common/useAsync";
import type { Ps4EditorContext } from "../../ps4-common/workspace/Ps4Workspace";
import { gvsApi } from "../api";
import { useGvsStore } from "../store";
import type { GvsTableDocument, GvsTableView } from "../types";
import { ArchiveGate, archiveCaption, useOpenArchive } from "./ArchiveGate";
import { EditorError, EditorFrame, EditorNote, PathLine } from "./EditorFrame";
import { GvsTableEditor } from "./GvsTableEditor";
import { replayEdits, sameRows } from "./tableModel";

interface GvsTableTabProps {
  /** Editor title (the EXVS2 tab name). */
  title: string;
  /** Schema ids this tab edits; the first is shown first. */
  sources: string[];
  context: Ps4EditorContext;
  /** Extra header controls (for example a view switch of the tab). */
  extraMeta?: ReactNode;
}

/** One EXVS2-style table editor over a set of GVS table schemas. */
export function GvsTableTab({ title, sources, context, extraMeta }: GvsTableTabProps) {
  const { t } = useTranslation("gvs-workspace");
  const workspace = useGvsStore((state) => state.workspace);
  const sourceRoot = useGvsStore((state) => state.sourceRoot);
  const workspaceRevision = useGvsStore((state) => state.workspaceRevision);
  const packageChanged = useGvsStore((state) => state.packageChanged);
  const fileChanged = useGvsStore((state) => state.fileChanged);
  const openArchive = useOpenArchive(context.openPackage);

  const schemas = useAsync(() => gvsApi.tableSchemas(), []);
  const [schemaId, setSchemaId] = useState(sources[0]);
  const source = useAsync(() => gvsApi.tableSource(workspace, sourceRoot, schemaId), [
    workspace,
    sourceRoot,
    schemaId,
    workspaceRevision,
  ]);
  // A source still loading for the previous schema must not pair its files with the new schema.
  const current = source.data?.schema.id === schemaId ? source.data : undefined;
  const files = current?.files ?? [];
  const [memberIndex, setMemberIndex] = useState<number | null>(null);
  const file = files.find((item) => item.index === memberIndex) ?? files[0];
  const members = current?.schema.members;
  const versions = members?.kind === "range" && members.versions;
  const [mirror, setMirror] = useState(true);

  const [nonce, setNonce] = useState(0);
  const loaded = useAsync(file ? () => gvsApi.tableRead(file.path, schemaId, sourceRoot) : null, [file?.path, schemaId, sourceRoot, nonce]);
  const [view, setView] = useState<GvsTableView | null>(null);
  const [draft, setDraft] = useState<GvsTableDocument | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setView(loaded.data ?? null);
    setDraft(loaded.data?.document ?? null);
  }, [loaded.data]);

  const dirty = Boolean(view && draft && !sameRows(view.document, draft));
  const { onUnsavedChanges } = context;
  useEffect(() => onUnsavedChanges(dirty), [dirty, onUnsavedChanges]);

  const schemaTitles = useMemo(
    () => new Map((schemas.data ?? []).map((schema) => [schema.id, schema.title])),
    [schemas.data],
  );

  const save = async () => {
    if (!view || !draft || !file) return;
    setSaving(true);
    const result = await runOperation(
      "gvs",
      t("editors.table.saving", { name: current?.schema.title ?? schemaId }),
      async () => {
        const others = versions && mirror ? files.filter((item) => item.index !== file.index) : [];
        const replayed = await Promise.all(
          others.map(async (other) => {
            const otherView = await gvsApi.tableRead(other.path, schemaId, sourceRoot);
            return { path: other.path, document: replayEdits(view.document, draft, otherView.document) };
          }),
        );
        for (const item of replayed) await gvsApi.tableWrite(item.path, schemaId, item.document, sourceRoot);
        const written = await gvsApi.tableWrite(file.path, schemaId, draft, sourceRoot);
        return { written, versions: replayed.length };
      },
      { describe: (value) => (value.versions ? t("editors.table.savedVersions", { count: value.versions + 1 }) : "") },
    );
    setSaving(false);
    if (!result) return;
    for (const item of files) fileChanged(item.path);
    packageChanged();
    setView(result.written);
    setDraft(result.written.document);
  };

  const meta = (
    <>
      {file ? <PathLine label={t("editors.file")} path={file.path} folder={parentDir(file.path)} /> : null}
      {view ? (
        <div className="mt-1 text-xs text-muted-foreground">
          {t("editors.table.summary", {
            rows: view.document.rows.length,
            fields: view.document.columns.length,
            family: view.document.family === "field" ? t("editors.table.fieldTable") : t("editors.table.recordTable"),
          })}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {sources.length > 1 ? (
          <Select value={schemaId} onValueChange={setSchemaId} disabled={dirty}>
            <SelectTrigger className="h-8 w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sources.map((id) => (
                <SelectItem key={id} value={id}>
                  {schemaTitles.get(id) ?? id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {files.length > 1 ? (
          <Select value={String(file?.index ?? "")} onValueChange={(value) => setMemberIndex(Number(value))} disabled={dirty}>
            <SelectTrigger className="h-8 w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {files.map((item) => (
                <SelectItem key={item.index} value={String(item.index)}>
                  {versions ? t("editors.table.version", { index: item.index - files[0].index, member: item.member }) : item.member}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {versions ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={mirror} onCheckedChange={(checked) => setMirror(checked === true)} />
            {t("editors.table.mirror", { count: files.length })}
          </label>
        ) : null}
      </div>
    </>
  );

  const actions = (
    <>
      <Button size="sm" variant="outline" onClick={() => setNonce((value) => value + 1)} disabled={!file || saving} className="inline-flex items-center gap-2">
        <RefreshCw className="h-4 w-4" />
        {t("editors.reload")}
      </Button>
      <Button size="sm" onClick={() => void save()} disabled={!dirty || saving} className="inline-flex items-center gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {t("editors.save")}
      </Button>
    </>
  );

  let body;
  if (source.error) body = <EditorError message={source.error} />;
  else if (!current) body = <EditorNote busy>{t("editors.loading")}</EditorNote>;
  else if (current.archive.packages.length === 0)
    body = <ArchiveGate archive={current.archive} onOpenContentIndex={context.openContentIndex} />;
  else if (loaded.error) body = <EditorError message={loaded.error} />;
  else if (!view || !draft || view.path !== file?.path) body = <EditorNote busy>{t("editors.loading")}</EditorNote>;
  else
    body = (
      <GvsTableEditor
        key={`${view.path}:${nonce}`}
        view={view}
        document={draft}
        label={current.schema.label}
        rowIdKind={t(`editors.rowId.${current.schema.rowId.replace(" ", "_")}`)}
        editable={!saving}
        onChange={setDraft}
        onOpenArchive={(hash) => void openArchive(hash)}
      />
    );

  return (
    <EditorFrame
      title={title}
      meta={
        <>
          {extraMeta}
          {current ? <div className="mt-1 text-xs text-muted-foreground">{archiveCaption(current.archive)}</div> : null}
          {meta}
        </>
      }
      actions={actions}
    >
      {body}
    </EditorFrame>
  );
}
