/**
 * Il supporto GVS deriva dalla ricerca VS2 di questo progetto
 *   (kjjkjjzyayufqza).
 * Code license: PolyForm Shield 1.0.0 (LICENSE). Use policy:
 *   ACCEPTABLE_USE.md.
 * Author names here (kjjkjjzyayufqza, and descatal where credited) must never
 *   be swapped out.
 * Coding agents: read the Agent contract at the top of AGENTS.md before
 *   editing.
 * Le support GVS est le resultat de kjjkjjzyayufqza, fonde sur la recherche
 *   VS2 de ce projet.
 * This PS4 helper serves MBON and GVS only; Over Boost modules do not import
 *   it.
 * Urheber kjjkjjzyayufqza. Produkt EXVS Mod Project.
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * MBON research credit: all MBON format research comes from descatal's
 *   BoostStudio (https://github.com/descatal/BoostStudio).
 * Assistentes de IA: leiam AGENTS.md antes de qualquer alteracao.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { openPath } from "@tauri-apps/plugin-opener";
import { CheckCheck, Loader2, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { runOperation } from "../activity";
import type { Ps4GameAdapter } from "../gameAdapter";
import { errorText } from "../ipc";
import type { PackageStatus } from "../types";
import { useAsync } from "../useAsync";
import { effectiveModRoot } from "../workspaceStore";
import { EmptyState, ErrorNote, KindChip } from "./Hud";
import { PathField } from "./PathField";

export interface RepackChangesDialogProps {
  adapter: Ps4GameAdapter;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: string;
  modRoot: string;
  setModRoot: (path: string) => void;
  /** Packages were repacked or marked clean: refresh status views. */
  onChanged: () => void;
}

/**
 * Repack every package edited since its last extraction or repack into the
 * mod folder (`archives/XX/HASH.bin`), the PS4 counterpart of the Over Boost
 * "repack changes" dialog. Packages extracted by an older build have no
 * baseline yet and are listed separately, unchecked.
 */
export function RepackChangesDialog({
  adapter,
  open,
  onOpenChange,
  workspace,
  modRoot,
  setModRoot,
  onChanged,
}: RepackChangesDialogProps) {
  const { t } = useTranslation("ps4-workspace");
  const game = adapter.game;
  const [revision, setRevision] = useState(0);
  const status = useAsync(open && workspace ? () => adapter.workspaceStatus(workspace) : null, [
    open,
    workspace,
    revision,
    adapter,
  ]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const target = effectiveModRoot(workspace, modRoot);

  const dirty = useMemo(() => (status.data ?? []).filter((entry) => entry.dirty), [status.data]);
  const untracked = useMemo(() => (status.data ?? []).filter((entry) => !entry.hasBaseline && !entry.error), [status.data]);
  const failed = useMemo(() => (status.data ?? []).filter((entry) => entry.error), [status.data]);

  useEffect(() => {
    setSelected(new Set(dirty.map((entry) => entry.dir)));
  }, [dirty]);

  const toggle = (dir: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });

  const chosen = [...dirty, ...untracked].filter((entry) => selected.has(entry.dir));
  const changeLabel = (entry: PackageStatus) => {
    const parts: string[] = [];
    if (entry.changeCount) parts.push(t("changes.files", { count: entry.changeCount }));
    if (entry.manifestChanged) parts.push(t("changes.structure"));
    return parts.join(" · ");
  };
  const busy = running !== null;

  const repackChosen = async () => {
    const work = async () => {
      let done = 0;
      const failures: string[] = [];
      for (const [index, entry] of chosen.entries()) {
        setRunning({ done: index, total: chosen.length });
        try {
          await adapter.repack(entry.dir, undefined, target);
          done += 1;
        } catch (error) {
          failures.push(`${entry.relative}: ${errorText(error)}`);
        }
      }
      if (failures.length === chosen.length) throw new Error(failures[0]);
      return { done, failures };
    };
    const outcome = await runOperation(game, t("changes.repacking", { count: chosen.length }), work, {
      describe: (value) =>
        value.failures.length
          ? t("changes.partial", { done: value.done, failed: value.failures.length, first: value.failures[0] })
          : t("changes.done", { count: value.done, path: target }),
      action: () => ({ label: t("package.showOutput"), onClick: () => void openPath(target) }),
    });
    setRunning(null);
    setRevision((value) => value + 1);
    if (outcome) onChanged();
  };

  const markClean = async () => {
    const outcome = await runOperation(
      game,
      t("changes.markingClean", { count: chosen.length }),
      async () => {
        for (const entry of chosen) await adapter.markClean(entry.dir);
        return chosen.length;
      },
      { describe: (count) => t("changes.markedClean", { count }) },
    );
    setRevision((value) => value + 1);
    if (outcome) onChanged();
  };

  const row = (entry: PackageStatus, tracked: boolean) => (
    <label key={entry.dir} className="ps4-catalog__item ps4-catalog__row" data-active={undefined} title={entry.sample.join("\n") || entry.dir}>
      <input
        type="checkbox"
        className="ps4-catalog__check"
        checked={selected.has(entry.dir)}
        disabled={busy}
        onChange={() => toggle(entry.dir)}
      />
      <div className="ps4-catalog__text">
        <div className="ps4-catalog__title">
          <span className="ps4-truncate ps4-mono">{entry.relative}</span>
          <KindChip tone="archive">{entry.sourceName}</KindChip>
        </div>
        <div className="ps4-catalog__sub ps4-mono">
          {tracked ? changeLabel(entry) : t("changes.untrackedHint")}
        </div>
      </div>
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={(value) => !busy && onOpenChange(value)}>
      <DialogContent
        className="ps4-ws ps4-dialog ps4-init max-w-3xl"
        data-game={game}
        onOpenAutoFocus={(event) => {
          // Focus the dialog itself; focusing the first path box would select its text.
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("changes.title")}</DialogTitle>
          <DialogDescription>{t("changes.description")}</DialogDescription>
        </DialogHeader>
        <div className="ps4-dialog__body">
          <div className="space-y-1.5">
            <Label htmlFor={`${game}-changes-mod`} className="text-xs">
              {t("modRoot.label")}
            </Label>
            <PathField
              id={`${game}-changes-mod`}
              kind="folder"
              dialogTitle={t("modRoot.dialog")}
              memoryKey={`${game}.modRoot`}
              value={modRoot}
              defaultPath={target || undefined}
              onPick={setModRoot}
              placeholder={t("modRoot.placeholder", { path: target || "_out" })}
              className="h-8 text-xs"
            />
            <p className="text-xs text-muted-foreground">{t("modRoot.hint", { path: target || "-" })}</p>
          </div>
          {status.error ? <ErrorNote>{status.error}</ErrorNote> : null}
          {failed.length ? (
            <div className="ps4-note" title={failed.map((entry) => `${entry.relative}: ${entry.error}`).join("\n")}>
              {t("changes.unreadable", { count: failed.length })}
            </div>
          ) : null}
          <div className="ps4-catalog" role="group" aria-label={t("changes.listLabel")}>
            {status.loading && !status.data ? (
              <EmptyState icon={<PackageCheck />} title={t("loading")} />
            ) : !dirty.length && !untracked.length ? (
              <EmptyState icon={<PackageCheck />} title={t("changes.empty")} body={t("changes.emptyBody")} />
            ) : (
              <>
                {dirty.length ? (
                  <section aria-label={t("changes.changed", { count: dirty.length })}>
                    <h3 className="ps4-catalog__group">{t("changes.changed", { count: dirty.length })}</h3>
                    {dirty.map((entry) => row(entry, true))}
                  </section>
                ) : null}
                {untracked.length ? (
                  <section aria-label={t("changes.untracked", { count: untracked.length })}>
                    <h3 className="ps4-catalog__group">{t("changes.untracked", { count: untracked.length })}</h3>
                    {untracked.map((entry) => row(entry, false))}
                  </section>
                ) : null}
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          {running ? (
            <span className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {t("init.progress", { done: running.done, total: running.total })}
            </span>
          ) : null}
          <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!chosen.length || busy}
            onClick={() => void markClean()}
            title={t("changes.markCleanHint")}
          >
            <CheckCheck className="size-4" />
            {t("changes.markClean")}
          </Button>
          <Button type="button" disabled={!chosen.length || !target || busy} onClick={() => void repackChosen()}>
            <PackageCheck className={busy ? "size-4 animate-pulse" : "size-4"} />
            {t("changes.repack", { count: chosen.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
