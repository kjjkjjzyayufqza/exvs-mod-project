/*
 * ------------------------------------------------
 * Code license: PolyForm Shield 1.0.0 (LICENSE). Use policy: ACCEPTABLE_USE.md.
 * Auteur kjjkjjzyayufqza. Product EXVS Mod Project. Bron
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Ne jamais remplacer ni supprimer les noms d'auteur de cet avis.
 * Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este archivo.
 * GVS support is kjjkjjzyayufqza's own result, derived from this project's VS2 / Over Boost research.
 * Assistant automatique : lisez d'abord AGENTS.md puis .cursor/rules/ai-source-notice.mdc.
 * ------------------------------------------------
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { runOperation } from "../../ps4-common/activity";
import { joinPath } from "../../ps4-common/format";
import { useAsync } from "../../ps4-common/useAsync";
import type { Ps4EditorContext } from "../../ps4-common/workspace/Ps4Workspace";
import { gvsApi } from "../api";
import { useGvsStore } from "../store";
import type { GvsBsfoEdit, GvsBsfoSlot, GvsBsfoUnit } from "../types";
import { ArchiveGate } from "./ArchiveGate";
import { EditorError, EditorFrame, EditorNote, PathLine } from "./EditorFrame";
import { parseCell } from "./tableModel";

/** `051mission/outmission`: mission briefings. */
const OUTMISSION = 0xf7b91de7;
const SCENE_CLASSES = [0, 1, 2, 3] as const;
const PLAYER_POSITIONS = 2;
const BOSS_POSITIONS = 3;
const ENEMY_POSITIONS = 3;

/** Integer input that commits only valid values of `kind`. */
function IntInput({ value, kind, onCommit, className, disabled }: { value: number; kind: "i32" | "u32"; onCommit: (value: number) => void; className?: string; disabled?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  return (
    <Input
      className={cn("h-8 font-mono", invalid && "border-destructive", className)}
      value={draft ?? (kind === "u32" ? `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, "0")}` : String(value))}
      disabled={disabled}
      onChange={(event) => {
        setDraft(event.target.value);
        try {
          onCommit(parseCell(kind, event.target.value) as number);
          setInvalid(false);
        } catch {
          setInvalid(true);
        }
      }}
      onBlur={() => {
        setDraft(null);
        setInvalid(false);
      }}
    />
  );
}

function castRow(values: number[], size: number): number[] {
  return Array.from({ length: size }, (_, index) => values[index] ?? -1);
}

function BriefingForm({ path, onDirty }: { path: string; onDirty: (dirty: boolean) => void }) {
  const { t } = useTranslation("gvs-workspace");
  const fileChanged = useGvsStore((state) => state.fileChanged);
  const packageChanged = useGvsStore((state) => state.packageChanged);
  const [nonce, setNonce] = useState(0);
  const loaded = useAsync(() => gvsApi.bsfoRead(path), [path, nonce]);
  const [edit, setEdit] = useState<GvsBsfoEdit | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setEdit(loaded.data?.edit ?? null), [loaded.data]);
  const dirty = Boolean(loaded.data && edit && JSON.stringify(loaded.data.edit) !== JSON.stringify(edit));
  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  if (loaded.error) return <EditorError message={loaded.error} />;
  if (!loaded.data || !edit) return <EditorNote busy>{t("editors.loading")}</EditorNote>;
  const writable = loaded.data.roundTrip && !saving;
  const patch = (next: Partial<GvsBsfoEdit>) => setEdit({ ...edit, ...next });
  const setUnit = (index: number, next: Partial<GvsBsfoUnit>) => patch({ units: edit.units.map((unit, at) => (at === index ? { ...unit, ...next } : unit)) });
  const setSlot = (index: number, next: Partial<GvsBsfoSlot>) => patch({ slots: edit.slots.map((slot, at) => (at === index ? { ...slot, ...next } : slot)) });
  const setCast = (field: "playerCast" | "bossCast" | "enemyCast", size: number, index: number, value: number) =>
    patch({ [field]: castRow(edit[field], size).map((entry, at) => (at === index ? value : entry)) });

  const save = async () => {
    setSaving(true);
    const view = await runOperation("gvs", t("editors.briefing.saving"), () => gvsApi.bsfoWrite(path, edit));
    setSaving(false);
    if (!view) return;
    fileChanged(path);
    packageChanged();
    setNonce((value) => value + 1);
  };

  const castInputs = (field: "playerCast" | "bossCast" | "enemyCast", size: number, label: string) => (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex gap-2">
        {castRow(edit[field], size).map((value, index) => (
          <IntInput key={index} kind="i32" value={value} disabled={!writable} className="w-20" onCommit={(next) => setCast(field, size, index, next)} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={cn("text-xs", loaded.data.roundTrip ? "text-muted-foreground" : "text-destructive")}>
          {loaded.data.roundTrip ? t("editors.briefing.roundTrip") : t("editors.briefing.noRoundTrip")}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setNonce((value) => value + 1)} disabled={saving} className="inline-flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            {t("editors.reload")}
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={!dirty || !writable} className="inline-flex items-center gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("editors.save")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("editors.briefing.sceneClass")}
          <Select value={String(edit.sceneClass)} onValueChange={(value) => patch({ sceneClass: Number(value) })} disabled={!writable}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCENE_CLASSES.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {t(`editors.briefing.class${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("editors.briefing.mapHash")}
          <IntInput kind="u32" value={edit.mapHash} disabled={!writable} onCommit={(value) => patch({ mapHash: value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("editors.briefing.timeLimit")}
          <IntInput kind="i32" value={edit.timeLimitSeconds} disabled={!writable} onCommit={(value) => patch({ timeLimitSeconds: value })} />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-xs text-muted-foreground">
          <Checkbox checked={edit.hasTarget} disabled={!writable} onCheckedChange={(checked) => patch({ hasTarget: checked === true })} />
          {t("editors.briefing.hasTarget")}
        </label>
      </div>

      <div className="flex flex-wrap gap-6 rounded-lg border p-3">
        {castInputs("playerCast", PLAYER_POSITIONS, t("editors.briefing.playerCast"))}
        {castInputs("bossCast", BOSS_POSITIONS, t("editors.briefing.bossCast"))}
        {castInputs("enemyCast", ENEMY_POSITIONS, t("editors.briefing.enemyCast"))}
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">{t("editors.briefing.units", { count: edit.units.length })}</div>
          <Button size="sm" variant="outline" disabled={!writable} onClick={() => patch({ units: [...edit.units, { word0: 0, unitId: 0, pilotId: 0, word3: 0 }] })} className="inline-flex items-center gap-2">
            <Plus className="h-4 w-4" />
            {t("editors.table.add")}
          </Button>
        </div>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>{t("editors.briefing.unitId")}</TableHead>
                <TableHead>{t("editors.briefing.pilotId")}</TableHead>
                <TableHead>word0</TableHead>
                <TableHead>word3</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {edit.units.map((unit, index) => (
                <TableRow key={index}>
                  <TableCell className="font-mono text-xs">{index}</TableCell>
                  <TableCell><IntInput kind="i32" value={unit.unitId} disabled={!writable} onCommit={(value) => setUnit(index, { unitId: value })} /></TableCell>
                  <TableCell><IntInput kind="i32" value={unit.pilotId} disabled={!writable} onCommit={(value) => setUnit(index, { pilotId: value })} /></TableCell>
                  <TableCell><IntInput kind="i32" value={unit.word0} disabled={!writable} onCommit={(value) => setUnit(index, { word0: value })} /></TableCell>
                  <TableCell><IntInput kind="i32" value={unit.word3} disabled={!writable} onCommit={(value) => setUnit(index, { word3: value })} /></TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="p-0 text-destructive" disabled={!writable} onClick={() => patch({ units: edit.units.filter((_, at) => at !== index) })} title={t("editors.table.delete")}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">{t("editors.briefing.slots", { count: edit.slots.length })}</div>
          <Button size="sm" variant="outline" disabled={!writable} onClick={() => patch({ slots: [...edit.slots, { unitId: 0, flags: 0, castIndex: -1, word3: 0 }] })} className="inline-flex items-center gap-2">
            <Plus className="h-4 w-4" />
            {t("editors.table.add")}
          </Button>
        </div>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">{t("editors.briefing.slot")}</TableHead>
                <TableHead>{t("editors.briefing.unitId")}</TableHead>
                <TableHead>{t("editors.briefing.castIndex")}</TableHead>
                <TableHead>flags</TableHead>
                <TableHead>word3</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {edit.slots.map((slot, index) => (
                <TableRow key={index}>
                  <TableCell className="font-mono text-xs">{index}</TableCell>
                  <TableCell><IntInput kind="i32" value={slot.unitId} disabled={!writable} onCommit={(value) => setSlot(index, { unitId: value })} /></TableCell>
                  <TableCell><IntInput kind="i32" value={slot.castIndex} disabled={!writable} onCommit={(value) => setSlot(index, { castIndex: value })} /></TableCell>
                  <TableCell><IntInput kind="u32" value={slot.flags} disabled={!writable} onCommit={(value) => setSlot(index, { flags: value })} /></TableCell>
                  <TableCell><IntInput kind="i32" value={slot.word3} disabled={!writable} onCommit={(value) => setSlot(index, { word3: value })} /></TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="p-0 text-destructive" disabled={!writable} onClick={() => patch({ slots: edit.slots.filter((_, at) => at !== index) })} title={t("editors.table.delete")}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

/** Mission briefings of `051mission/outmission`: list on the left, the selected briefing on the right. */
export function GvsBriefingEditor({ title, context, switcher }: { title: string; context: Ps4EditorContext; switcher: ReactNode }) {
  const { t } = useTranslation("gvs-workspace");
  const workspace = useGvsStore((state) => state.workspace);
  const sourceRoot = useGvsStore((state) => state.sourceRoot);
  const workspaceRevision = useGvsStore((state) => state.workspaceRevision);
  const packageRevision = useGvsStore((state) => state.packageRevision);
  const location = useAsync(() => gvsApi.locate(workspace, sourceRoot, [OUTMISSION]).then(([item]) => item), [workspace, sourceRoot, workspaceRevision]);
  const packageDir = location.data?.packages[0] ?? null;
  const view = useAsync(packageDir ? () => gvsApi.packageView(packageDir) : null, [packageDir, packageRevision]);
  const briefings = useMemo(() => (view.data?.members ?? []).filter((member) => member.kind === "bsfo"), [view.data]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const current = briefings.find((member) => member.path === selected) ?? briefings[0];
  const { onUnsavedChanges } = context;
  useEffect(() => onUnsavedChanges(dirty), [dirty, onUnsavedChanges]);

  const meta = (
    <>
      {switcher}
      {packageDir ? <PathLine label={t("editors.package")} path={packageDir} folder={packageDir} /> : null}
    </>
  );

  let body;
  if (location.error) body = <EditorError message={location.error} />;
  else if (!location.data) body = <EditorNote busy>{t("editors.loading")}</EditorNote>;
  else if (!packageDir) body = <ArchiveGate archive={location.data} onOpenContentIndex={context.openContentIndex} />;
  else if (view.error) body = <EditorError message={view.error} />;
  else if (!view.data) body = <EditorNote busy>{t("editors.loading")}</EditorNote>;
  else
    body = (
      <div className="flex h-full min-h-[24rem] gap-4">
        <div className="flex w-56 shrink-0 flex-col overflow-hidden rounded-lg border p-3">
          <div className="mb-3 text-sm font-semibold">{t("editors.briefing.count", { count: briefings.length })}</div>
          <div className="min-h-0 flex-1 overflow-auto">
            {briefings.map((member) => (
              <button
                key={member.path}
                type="button"
                disabled={dirty && member.path !== current?.path}
                onClick={() => setSelected(member.path)}
                className={cn(
                  "mb-1 w-full rounded-md border px-2 py-1.5 text-left font-mono text-xs transition-colors hover:bg-accent/50 disabled:opacity-50",
                  current?.path === member.path && "bg-accent ring-2 ring-inset ring-primary",
                )}
              >
                {member.path}
              </button>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border p-4">
          {current ? (
            <BriefingForm key={current.path} path={joinPath(packageDir, current.path)} onDirty={setDirty} />
          ) : (
            <EditorNote>{t("editors.briefing.none")}</EditorNote>
          )}
        </div>
      </div>
    );

  return (
    <EditorFrame title={title} meta={meta}>
      {body}
    </EditorFrame>
  );
}
