//
// ................................................
// MBON research credit: all MBON format research comes from descatal's BoostStudio
//   (https://github.com/descatal/BoostStudio).
// Le support GVS est le resultat de kjjkjjzyayufqza, fonde sur la recherche VS2 de ce projet.
// Licensed under PolyForm Shield 1.0.0; a competing product may not reuse this file.
// Auteur kjjkjjzyayufqza. Produit EXVS Mod Project.
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// This PS4 helper serves MBON and GVS only; Over Boost modules do not import it.
// No elimines ni sustituyas los nombres de autor de este aviso.
// Machine readers start at AGENTS.md (Agent contract) and
//   docs/adr/0010-mbon-gvs-isolated-workspaces.md.
// ................................................
//

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { FileSearch, FolderInput, FolderOpen, PackageOpen } from "lucide-react";
import { runOperation } from "../../activity";
import { baseName, formatBytes, joinPath, parentDir } from "../../format";
import type { ExtractOutcome, Ps4GameAdapter } from "../../gameAdapter";
import type { NameSuggestion } from "../../types";
import { useAsync } from "../../useAsync";
import { usePersistentPath } from "../../usePersistentPath";
import { HudButton, HudPanel, KindChip, Section } from "../../components/Hud";
import { PathPicker } from "../../components/PathPicker";
import { ArchivePreviewCard } from "./ArchivePreviewCard";
import { FlowStrip } from "./FlowStrip";

export interface UnpackPanelProps {
  adapter: Ps4GameAdapter;
  workspace: string;
  onOpenInWorkspace: (workspace: string, packageDir: string) => void;
}

/**
 * Single unpack, as in the Over Boost "Single FHM2D" page: one archive into
 * one package folder. Known archives get their VS2 / BoostStudio name; the
 * folder may sit in the workspace or anywhere else.
 */
export function UnpackPanel({ adapter, workspace, onOpenInWorkspace }: UnpackPanelProps) {
  const { t } = useTranslation("ps4-workspace");
  const game = adapter.game;
  const [source, setSource] = usePersistentPath(`${game}.single.source`);
  const [output, setOutput] = usePersistentPath(`${game}.single.output`);
  const [name, setName] = useState("");
  const [suggestion, setSuggestion] = useState<NameSuggestion | null>(null);
  const [subfolder, setSubfolder] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(ExtractOutcome & { workspace: string }) | null>(null);
  const suggested = useRef("");

  const preview = useAsync(source ? () => adapter.preview(source) : null, [source, adapter]);

  useEffect(() => {
    let cancelled = false;
    if (!source) {
      setSuggestion(null);
      return;
    }
    void adapter.suggestName(source).then(
      (value) => {
        if (cancelled) return;
        setSuggestion(value);
        setName((current) => (!current.trim() || current === suggested.current ? value.relativeDir : current));
        suggested.current = value.relativeDir;
      },
      () => {
        if (!cancelled) setSuggestion(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [source, adapter]);

  const base = output.trim() || workspace.trim();
  const cleanName = name.trim().replace(/^[\\/]+|[\\/]+$/g, "");
  const extractRoot = subfolder ? base : parentDir(base);
  const extractName = subfolder ? cleanName : baseName(base);
  const target = base ? (subfolder ? (cleanName ? joinPath(base, cleanName) : null) : base) : null;
  const blocked = !source
    ? t("single.blocked.source")
    : !base
      ? t("single.blocked.output")
      : subfolder && !cleanName
        ? t("single.blocked.name")
        : null;

  const browse = async () => {
    const picked = await open({
      multiple: false,
      directory: false,
      title: t("single.sourceDialog"),
      defaultPath: source ? parentDir(source) : undefined,
      filters: [
        { name: t("single.sourceFilter", { code: adapter.code }), extensions: [...adapter.sourceExtensions] },
        { name: t("single.allFiles"), extensions: ["*"] },
      ],
    });
    if (typeof picked === "string" && picked) {
      setSource(picked);
      setResult(null);
    }
  };

  const unpack = async () => {
    if (blocked || busy) return;
    setBusy(true);
    const report = await runOperation(
      game,
      t("single.unpacking", { name: baseName(source) }),
      () => adapter.extract(source, extractRoot, overwrite, extractName),
      {
        describe: (value) =>
          t("single.unpackDone", { folder: value.packageDir, files: value.files, bytes: formatBytes(value.bytes) }),
        action: (value) => ({ label: t("single.openInWorkspace"), onClick: () => onOpenInWorkspace(extractRoot, value.packageDir) }),
      },
    );
    if (report) setResult({ ...report, workspace: extractRoot });
    setBusy(false);
  };

  return (
    <div className="ps4-single">
      <HudPanel
        title={t("single.tabs.unpack")}
        busy={busy}
        actions={
          <HudButton variant="primary" icon={<PackageOpen />} busy={busy} disabled={!!blocked} onClick={() => void unpack()}>
            {t("single.unpack")}
          </HudButton>
        }
        footer={blocked ? <span className="ps4-truncate">{blocked}</span> : undefined}
      >
        <div className="ps4-single__form">
          <FlowStrip from={source || null} to={target} empty={t("single.flowEmpty")} />
          <div className="ps4-field">
            <span className="ps4-field__label">{t("single.source")}</span>
            <div className="ps4-path">
              <span className="ps4-path__value" data-empty={!source} title={source || undefined}>
                {source ? <bdi>{source}</bdi> : t("single.sourcePlaceholder")}
              </span>
              <HudButton icon={<FileSearch />} onClick={() => void browse()} label={t("single.sourceDialog")} />
              <HudButton
                icon={<FolderOpen />}
                disabled={!source}
                onClick={() => void openPath(parentDir(source))}
                label={t("path.reveal")}
              />
            </div>
          </div>
          <div className="ps4-field">
            <span className="ps4-field__label">{t("single.output")}</span>
            <PathPicker
              value={output}
              onChange={setOutput}
              placeholder={workspace ? t("single.outputDefault", { path: workspace }) : t("single.outputPlaceholder")}
              dialogTitle={t("single.outputDialog")}
            />
            {output && workspace && output !== workspace ? (
              <button type="button" className="ps4-link" onClick={() => setOutput("")}>
                {t("single.useWorkspace")}
              </button>
            ) : null}
          </div>
          <label className="ps4-check">
            <input type="checkbox" checked={subfolder} onChange={(event) => setSubfolder(event.target.checked)} />
            {t("single.subfolder")}
          </label>
          {subfolder ? (
            <div className="ps4-field">
              <span className="ps4-field__label">{t("single.name")}</span>
              <input
                className="ps4-input"
                value={name}
                spellCheck={false}
                aria-label={t("single.name")}
                placeholder={suggestion?.relativeDir ?? "012list/character_list"}
                onChange={(event) => setName(event.target.value)}
              />
              <span className="ps4-field__hint">
                {suggestion?.known
                  ? t("single.known", { title: suggestion.title ?? suggestion.name, folder: suggestion.relativeDir })
                  : suggestion
                    ? t("single.unknown", { hash: suggestion.hash ?? suggestion.stem })
                    : t("single.nameHint")}
              </span>
            </div>
          ) : null}
          <label className="ps4-check">
            <input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />
            {t("single.overwrite")}
          </label>
          {result ? (
            <div className="ps4-note ps4-single__result">
              <KindChip tone="ok">{t("single.unpacked")}</KindChip>
              <span className="ps4-mono ps4-truncate" title={result.packageDir}>
                {result.packageDir}
              </span>
              <span className="ps4-panel__spacer" />
              <HudButton icon={<FolderOpen />} label={t("path.reveal")} onClick={() => void openPath(result.packageDir)} />
              <HudButton icon={<FolderInput />} onClick={() => onOpenInWorkspace(result.workspace, result.packageDir)}>
                {t("single.openInWorkspace")}
              </HudButton>
            </div>
          ) : null}
        </div>
      </HudPanel>
      <HudPanel title={t("single.preview")} busy={preview.loading}>
        <div className="ps4-single__form">
          {suggestion ? (
            <Section title={t("single.naming")}>
              <div className="flex flex-wrap items-center gap-2">
                <KindChip tone={suggestion.known ? "ok" : "warn"}>
                  {suggestion.known ? t("single.namedChip") : t("single.unnamedChip")}
                </KindChip>
                <span className="ps4-mono">{suggestion.relativeDir}</span>
                {suggestion.hash ? <span className="ps4-faint ps4-mono">{suggestion.hash}</span> : null}
              </div>
            </Section>
          ) : null}
          <ArchivePreviewCard preview={source ? preview : null} />
        </div>
      </HudPanel>
    </div>
  );
}
