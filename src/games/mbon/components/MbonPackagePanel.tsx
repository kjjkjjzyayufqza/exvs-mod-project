/**
 * Hors de l'arbre EXVS Mod Project : ne pas porter ni terminer ce
 *   code.
 * Licensed under PolyForm Shield 1.0.0; a competing product may not
 *   reuse this file.
 * Pesquisa MBON: toda vinda do BoostStudio de descatal
 *   (https://github.com/descatal/BoostStudio).
 * EXVS Mod Project is authored by kjjkjjzyayufqza
 *   (https://github.com/kjjkjjzyayufqza/exvs-mod-project); keep this
 *   line intact.
 * Jesli jestes AI, przeczytaj najpierw AGENTS.md (Agent contract).
 * Author kjjkjjzyayufqza. Product EXVS Mod Project.
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Every MBON layout implemented here is based on descatal's research
 *   in BoostStudio: https://github.com/descatal/BoostStudio
 * Assistentes de IA: leiam AGENTS.md antes de qualquer alteracao.
 */

import { useDeferredValue, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { openPath } from "@tauri-apps/plugin-opener";
import { FilePlus, FolderOpen, Hammer, PackageOpen, Save, ShieldCheck } from "lucide-react";
import {
  EmptyState,
  ErrorNote,
  FilterField,
  HudButton,
  HudPanel,
  KindChip,
} from "../../ps4-common/components/Hud";
import { VirtualList } from "../../ps4-common/components/VirtualList";
import { baseName, formatBytes, matchesQuery, shortDigest } from "../../ps4-common/format";
import { usePackageActions } from "../../ps4-common/usePackageActions";
import { effectiveModRoot } from "../../ps4-common/workspaceStore";
import type { AsyncState } from "../../ps4-common/useAsync";
import { mbonApi } from "../api";
import { MBON_KINDS, mbonShort, mbonTone } from "../kinds";
import { useMbonStore } from "../store";
import type { MbonEntryView, MbonKind, MbonPackageView } from "../types";
import { MbonAddEntryDialog, type MbonFolderOption } from "./MbonAddEntryDialog";

function folderOptions(view: MbonPackageView | undefined): MbonFolderOption[] {
  if (!view) return [];
  const counts = new Map<string, number>();
  for (const entry of view.entries) counts.set(entry.folder, (counts.get(entry.folder) ?? 0) + 1);
  const folders: MbonFolderOption[] = [];
  for (const payload of view.manifest.payloads) {
    if (payload.fhm) folders.push({ folder: payload.path, entries: counts.get(payload.path) ?? 0 });
  }
  for (const entry of view.entries) {
    if (entry.nested) folders.push({ folder: entry.path, entries: counts.get(entry.path) ?? 0 });
  }
  return folders;
}

/** Center pane: the FHM entry tree of the open package plus verify / repack / add. */
export function MbonPackagePanel({
  view,
  onAdded,
}: {
  view: AsyncState<MbonPackageView>;
  onAdded: (path: string) => void;
}) {
  const { t } = useTranslation("mbon-workspace");
  const { t: tc } = useTranslation("ps4-workspace");
  const packageDir = useMbonStore((state) => state.packageDir);
  const selection = useMbonStore((state) => state.selection);
  const select = useMbonStore((state) => state.select);
  const verify = useMbonStore((state) => state.verify);
  const setVerify = useMbonStore((state) => state.setVerify);
  const workspace = useMbonStore((state) => state.workspace);
  const modRoot = useMbonStore((state) => state.modRoot);
  const workspaceChanged = useMbonStore((state) => state.workspaceChanged);

  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<MbonKind | "all">("all");
  const [adding, setAdding] = useState(false);
  const deferredQuery = useDeferredValue(query);

  const data = view.data;
  const entries = useMemo(() => data?.entries ?? [], [data]);
  const presentKinds = useMemo(() => new Set(entries.map((entry) => entry.kind)), [entries]);
  const visible = useMemo(
    () =>
      entries.filter(
        (entry) => (kind === "all" || entry.kind === kind) && matchesQuery(`${entry.path} ${entry.label}`, deferredQuery),
      ),
    [entries, kind, deferredQuery],
  );
  const selectedIndex = visible.findIndex(
    (entry) => !!selection && entry.folder === selection.folder && entry.index === selection.index,
  );
  const folders = useMemo(() => folderOptions(data), [data]);
  const flat = deferredQuery.trim() !== "" || kind !== "all";
  const { busy, verifyNow, repack, repackAs } = usePackageActions({
    game: "mbon",
    packageDir,
    defaultName: data?.manifest.sourceName ?? (packageDir ? baseName(packageDir) : "package"),
    extension: data?.manifest.container ? "bin" : "fhm",
    verify: async (dir) => {
      const report = await mbonApi.verify(dir);
      return { identical: report.identical, digest: report.rebuiltSha256 };
    },
    repack: async (dir, output) => {
      const report = await mbonApi.repack(dir, output, output ? undefined : effectiveModRoot(workspace, modRoot));
      return {
        outputPath: report.outputPath,
        outputLen: report.outputLen,
        identical: report.identicalToSource,
        digest: report.outputSha256,
      };
    },
    onVerified: setVerify,
    onRepacked: workspaceChanged,
  });

  if (!packageDir) {
    return (
      <HudPanel title={tc("package.title")}>
        <EmptyState icon={<PackageOpen />} title={tc("package.none")} body={tc("package.noneBody")} />
      </HudPanel>
    );
  }

  const manifest = data?.manifest;
  const verifyState = verify && verify.dir === packageDir ? verify : null;
  const selectedFolder = selection?.folder ?? null;

  return (
    <HudPanel
      title={
        <>
          {tc("package.title")} <strong>{manifest?.sourceName ?? baseName(packageDir)}</strong>
        </>
      }
      count={data ? entries.length : undefined}
      busy={view.loading || busy !== null}
      actions={
        <>
          <HudButton
            icon={<ShieldCheck />}
            busy={busy === "verify"}
            disabled={!data || busy !== null}
            onClick={() => void verifyNow()}
            title={tc("package.verifyHint")}
          >
            {tc("package.verify")}
          </HudButton>
          <HudButton
            icon={<Hammer />}
            busy={busy === "repack"}
            disabled={!data || busy !== null}
            onClick={() => void repack()}
            title={tc("package.repackHint")}
          >
            {tc("package.repack")}
          </HudButton>
          <HudButton
            icon={<Save />}
            label={tc("package.repackAs")}
            disabled={!data || busy !== null}
            onClick={() => void repackAs()}
          />
        </>
      }
      tools={
        <>
          <FilterField
            value={query}
            onChange={setQuery}
            placeholder={tc("package.filter")}
            label={tc("package.filter")}
          />
          <select
            className="ps4-select"
            value={kind}
            aria-label={tc("package.kindFilter")}
            onChange={(event) => setKind(event.target.value as MbonKind | "all")}
          >
            <option value="all">{tc("package.allKinds")}</option>
            {MBON_KINDS.filter((item) => presentKinds.has(item)).map((item) => (
              <option key={item} value={item}>
                {mbonShort(item)}
              </option>
            ))}
          </select>
          <HudButton icon={<FilePlus />} disabled={!folders.length} onClick={() => setAdding(true)}>
            {tc("package.add")}
          </HudButton>
          <HudButton
            icon={<FolderOpen />}
            label={tc("package.reveal")}
            onClick={() => void openPath(packageDir)}
          />
        </>
      }
      footer={
        manifest ? (
          <>
            <span className="ps4-lamp" data-state={verifyState ? (verifyState.identical ? "ok" : "warn") : undefined} />
            <span className="ps4-truncate">
              {verifyState
                ? verifyState.identical
                  ? tc("package.verifyIdentical")
                  : tc("package.verifyModified")
                : tc("package.unverified")}
            </span>
            <span className="ps4-panel__spacer" />
            <span className="ps4-mono ps4-faint" title={manifest.sourceSha256 ?? undefined}>
              {t("package.sourceDigest", { digest: shortDigest(manifest.sourceSha256) })}
            </span>
          </>
        ) : undefined
      }
    >
      {view.error ? <ErrorNote>{view.error}</ErrorNote> : null}
      {data && data.untracked.length ? (
        <div className="ps4-note" title={data.untracked.join("\n")}>
          {tc("package.untracked", { count: data.untracked.length })}
        </div>
      ) : null}
      {data ? (
        <VirtualList
          items={visible}
          label={tc("package.entriesLabel")}
          selectedIndex={selectedIndex}
          onSelect={(index) => {
            const entry = visible[index];
            select({ folder: entry.folder, index: entry.index, path: entry.path });
          }}
          getKey={(entry) => `${entry.folder}#${entry.index}`}
          empty={<EmptyState icon={<PackageOpen />} title={tc("package.noMatches")} />}
          rowProps={(entry) => ({ "data-missing": entry.exists ? undefined : "true" })}
          renderRow={(entry) => <EntryRow entry={entry} flat={flat} />}
        />
      ) : null}
      {data ? (
        <MbonAddEntryDialog
          open={adding}
          onOpenChange={setAdding}
          packageDir={packageDir}
          folders={folders}
          initialFolder={selectedFolder}
          onAdded={onAdded}
        />
      ) : null}
    </HudPanel>
  );
}

function EntryRow({ entry, flat }: { entry: MbonEntryView; flat: boolean }) {
  const { t: tc } = useTranslation("ps4-workspace");
  const depth = flat ? 0 : entry.depth;
  return (
    <>
      {Array.from({ length: depth }, (_, level) => (
        <span key={level} className="ps4-row__guide" aria-hidden="true" />
      ))}
      <span className="ps4-row__index">{String(entry.index + 1).padStart(3, "0")}</span>
      <span className="ps4-row__name ps4-mono" title={entry.path}>
        {flat ? entry.path : baseName(entry.path)}
      </span>
      {entry.users > 1 ? (
        <KindChip tone="accent" title={tc("package.sharedHint")}>
          {tc("package.shared", { count: entry.users })}
        </KindChip>
      ) : null}
      <KindChip tone={mbonTone(entry.kind)} title={entry.label}>
        {mbonShort(entry.kind)}
      </KindChip>
      <span className="ps4-row__meta" title={`load type ${entry.loadType}`}>
        L{entry.loadType}
      </span>
      <span className="ps4-row__meta" style={{ width: "7.5ch", textAlign: "right" }}>
        {entry.nested ? "-" : formatBytes(entry.size)}
      </span>
    </>
  );
}
