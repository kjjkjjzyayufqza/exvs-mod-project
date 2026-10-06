/**
 * ------------------------------------------------
 * Hors de l'arbre EXVS Mod Project : ne pas porter ni terminer ce code.
 * Autorennamen in diesem Hinweis niemals ersetzen oder entfernen.
 * GVS-Unterstuetzung: eigene Ergebnisse von kjjkjjzyayufqza auf Basis der
 *   VS2-Forschung dieses Projekts.
 * Yazar kjjkjjzyayufqza. Urun EXVS Mod Project. Kaynak
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este archivo.
 * Licentie: PolyForm Shield 1.0.0. Gebruiksbeleid: ACCEPTABLE_USE.md.
 * Le support GVS est le resultat de kjjkjjzyayufqza, fonde sur la recherche
 *   VS2 de ce projet.
 * ------------------------------------------------
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, RefreshCw, Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { runOperation } from "../../ps4-common/activity";
import { useAsync } from "../../ps4-common/useAsync";
import type { Ps4EditorContext } from "../../ps4-common/workspace/Ps4Workspace";
import { gvsApi } from "../api";
import { useGvsStore } from "../store";
import type { GvsTableView, GvsUnitEntry } from "../types";
import { EditorError, EditorFrame, EditorNote } from "./EditorFrame";
import { useGvsUnits, unitCaption } from "./GvsUnitPicker";
import { GvsTableTab } from "./GvsTableTab";
import { parseCell } from "./tableModel";
import { ViewSwitch } from "./ViewSwitch";

/** characterparam `7D1A0ACF`: unit cost (VS2: the value the character list cost filter reads). */
const COST_FIELD = 0x7d1a0acf;
/** characterparam `B7D5327E`: base maximum durability. */
const DURABILITY_FIELD = 0xb7d5327e;

type View = "units" | "battle";

interface UnitCost {
  unit: GvsUnitEntry;
  path: string;
  view: GvsTableView;
  costIndex: number;
  durabilityIndex: number;
}

/** characterparam of every unit whose 002chara pack is extracted. */
async function loadUnitCosts(units: GvsUnitEntry[], sourceRoot: string): Promise<UnitCost[]> {
  const extracted = units.filter((unit) => unit.chara.packages.length > 0);
  const rows = await Promise.all(
    extracted.map(async (unit) => {
      const tables = await gvsApi.paramTables(unit.chara.packages[0]);
      const table = tables.find((item) => item.kind === "characterparam");
      if (!table) return null;
      const view = await gvsApi.tableRead(table.path, null, sourceRoot);
      const costIndex = view.document.columns.findIndex((column) => column.hash === COST_FIELD);
      const durabilityIndex = view.document.columns.findIndex((column) => column.hash === DURABILITY_FIELD);
      if (costIndex < 0 || durabilityIndex < 0 || view.document.rows.length === 0) {
        throw new Error(`${table.path} has no cost / durability field`);
      }
      return { unit, path: table.path, view, costIndex, durabilityIndex };
    }),
  );
  return rows.filter((row): row is UnitCost => row !== null);
}

/** EXVS2 Character Cost for GVS: unit cost and durability from each unit's characterparam, and the battle system tables. */
export function GvsCostTab({ title, context }: { title: string; context: Ps4EditorContext }) {
  const { t } = useTranslation("gvs-workspace");
  const [view, setView] = useState<View>("units");
  const switcher = (
    <ViewSwitch
      value={view}
      onChange={setView}
      options={[
        { value: "units", label: t("editors.cost.units") },
        { value: "battle", label: t("editors.cost.battle") },
      ]}
    />
  );
  if (view === "battle") return <GvsTableTab title={title} sources={["battle_system_table"]} context={context} extraMeta={switcher} />;
  return <UnitCostView title={title} context={context} switcher={switcher} />;
}

function UnitCostView({ title, context, switcher }: { title: string; context: Ps4EditorContext; switcher: ReactNode }) {
  const { t } = useTranslation("gvs-workspace");
  const sourceRoot = useGvsStore((state) => state.sourceRoot);
  const packageRevision = useGvsStore((state) => state.packageRevision);
  const packageChanged = useGvsStore((state) => state.packageChanged);
  const fileChanged = useGvsStore((state) => state.fileChanged);
  const units = useGvsUnits();
  const costs = useAsync(units.data ? () => loadUnitCosts(units.data as GvsUnitEntry[], sourceRoot) : null, [units.data, sourceRoot, packageRevision]);
  const [edits, setEdits] = useState<Record<string, { cost?: string; durability?: string }>>({});
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => setEdits({}), [costs.data]);

  const dirty = Object.keys(edits).length > 0;
  const { onUnsavedChanges } = context;
  useEffect(() => onUnsavedChanges(dirty), [dirty, onUnsavedChanges]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (costs.data ?? []).filter((row) => !query || unitCaption(row.unit).toLowerCase().includes(query));
  }, [costs.data, search]);

  const errors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [path, edit] of Object.entries(edits)) {
      try {
        if (edit.cost !== undefined) parseCell("i32", edit.cost);
        if (edit.durability !== undefined) parseCell("i32", edit.durability);
      } catch (reason) {
        out[path] = reason instanceof Error ? reason.message : String(reason);
      }
    }
    return out;
  }, [edits]);

  const save = async () => {
    const targets = (costs.data ?? []).filter((row) => edits[row.path]);
    setSaving(true);
    const done = await runOperation("gvs", t("editors.cost.saving", { count: targets.length }), async () => {
      for (const row of targets) {
        const edit = edits[row.path];
        const document = row.view.document;
        const first = document.rows[0];
        const cells = [...first.cells];
        if (edit.cost !== undefined) cells[row.costIndex] = parseCell("i32", edit.cost);
        if (edit.durability !== undefined) cells[row.durabilityIndex] = parseCell("i32", edit.durability);
        await gvsApi.tableWrite(row.path, null, { ...document, rows: [{ ...first, cells }, ...document.rows.slice(1)] }, sourceRoot);
        fileChanged(row.path);
      }
      return targets.length;
    });
    setSaving(false);
    if (done !== undefined) packageChanged();
  };

  const actions = (
    <>
      <Button size="sm" variant="outline" onClick={() => costs.reload()} disabled={saving} className="inline-flex items-center gap-2">
        <RefreshCw className="h-4 w-4" />
        {t("editors.reload")}
      </Button>
      <Button size="sm" onClick={() => void save()} disabled={!dirty || saving || Object.keys(errors).length > 0} className="inline-flex items-center gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {t("editors.save")}
      </Button>
    </>
  );

  const meta = (
    <>
      {switcher}
      <div className="mt-1 text-xs text-muted-foreground">{t("editors.cost.note")}</div>
    </>
  );

  let body;
  if (units.error) body = <EditorError message={units.error} />;
  else if (costs.error) body = <EditorError message={costs.error} />;
  else if (!costs.data) body = <EditorNote busy>{t("editors.loading")}</EditorNote>;
  else if (costs.data.length === 0) body = <EditorNote>{t("editors.cost.noUnits")}</EditorNote>;
  else
    body = (
      <div className="flex h-full min-h-[20rem] flex-col gap-3">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={t("editors.unit.search")} value={search} onChange={(event) => setSearch(event.target.value)} className="h-8 pl-10" />
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("editors.cost.unit")}</TableHead>
                <TableHead className="w-40">{t("editors.cost.cost")}</TableHead>
                <TableHead className="w-40">{t("editors.cost.durability")}</TableHead>
                <TableHead>{t("editors.file")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const first = row.view.document.rows[0];
                const edit = edits[row.path] ?? {};
                const setField = (field: "cost" | "durability", text: string) =>
                  setEdits((prev) => ({ ...prev, [row.path]: { ...prev[row.path], [field]: text } }));
                return (
                  <TableRow key={row.path}>
                    <TableCell className="font-medium">{unitCaption(row.unit)}</TableCell>
                    <TableCell>
                      <Input className="h-8 font-mono" value={edit.cost ?? String(first.cells[row.costIndex])} onChange={(event) => setField("cost", event.target.value)} disabled={saving} />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 font-mono"
                        value={edit.durability ?? String(first.cells[row.durabilityIndex])}
                        onChange={(event) => setField("durability", event.target.value)}
                        disabled={saving}
                      />
                    </TableCell>
                    <TableCell className="max-w-[24rem] truncate text-xs text-muted-foreground" title={row.path}>
                      {errors[row.path] ? <span className="text-destructive">{errors[row.path]}</span> : row.path}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    );

  return (
    <EditorFrame title={title} meta={meta} actions={actions}>
      {body}
    </EditorFrame>
  );
}
