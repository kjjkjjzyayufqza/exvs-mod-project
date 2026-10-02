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
import { openPath } from "@tauri-apps/plugin-opener";
import { FolderInput, FolderOpen, Loader2, PackageOpen, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { runOperation } from "../../activity";
import { baseName, formatBytes, joinPath, parentDir } from "../../format";
import type { ExtractOutcome, Ps4GameAdapter } from "../../gameAdapter";
import type { NameSuggestion } from "../../types";
import { useAsync } from "../../useAsync";
import { usePersistentPath } from "../../usePersistentPath";
import { PathField } from "../../components/PathField";
import { FactList, SectionBlock, SectionPanel } from "../../components/SectionPanel";
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
  const [previewNonce, setPreviewNonce] = useState(0);
  const [result, setResult] = useState<(ExtractOutcome & { workspace: string }) | null>(null);
  const suggested = useRef("");

  const preview = useAsync(source ? () => adapter.preview(source) : null, [source, adapter, previewNonce]);

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
    <div className="space-y-4">
      <FlowStrip from={source || null} to={target} empty={t("single.flowEmpty")} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <SectionPanel>
          <SectionBlock title={t("single.sourceTitle")} description={t("single.sourceDescription")}>
            <div className="space-y-1.5">
              <Label htmlFor={`${game}-single-source`} className="text-xs">
                {t("single.source")}
              </Label>
              <PathField
                id={`${game}-single-source`}
                kind="file"
                dialogTitle={t("single.sourceDialog")}
                value={source}
                defaultPath={source ? parentDir(source) : undefined}
                filters={[
                  { name: t("single.sourceFilter", { code: adapter.code }), extensions: [...adapter.sourceExtensions] },
                  { name: t("single.allFiles"), extensions: ["*"] },
                ]}
                onPick={(picked) => {
                  setSource(picked);
                  setResult(null);
                }}
                placeholder={t("single.sourcePlaceholder")}
              />
            </div>
          </SectionBlock>

          <SectionBlock title={t("single.destination")} description={t("single.destinationDescription")}>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`${game}-single-output`} className="text-xs">
                  {t("single.output")}
                </Label>
                {output && workspace && output !== workspace ? (
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    onClick={() => setOutput("")}
                  >
                    {t("single.useWorkspace")}
                  </button>
                ) : null}
              </div>
              <PathField
                id={`${game}-single-output`}
                kind="folder"
                dialogTitle={t("single.outputDialog")}
                value={output}
                defaultPath={base || undefined}
                onPick={setOutput}
                placeholder={workspace ? t("single.outputDefault", { path: workspace }) : t("single.outputPlaceholder")}
              />
            </div>

            {subfolder ? (
              <div className="space-y-1.5">
                <Label htmlFor={`${game}-single-name`} className="text-xs">
                  {t("single.name")}
                </Label>
                <Input
                  id={`${game}-single-name`}
                  value={name}
                  spellCheck={false}
                  placeholder={suggestion?.relativeDir ?? "012list/character_list"}
                  onChange={(event) => setName(event.target.value)}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  {suggestion?.known
                    ? t("single.known", { title: suggestion.title ?? suggestion.name, folder: suggestion.relativeDir })
                    : suggestion
                      ? t("single.unknown", { hash: suggestion.hash ?? suggestion.stem })
                      : t("single.nameHint")}
                </p>
              </div>
            ) : null}

            <label className="flex items-start gap-2 text-xs">
              <Checkbox checked={subfolder} onCheckedChange={(value) => setSubfolder(value === true)} className="mt-0.5" />
              <span>
                <span className="font-medium">{t("single.subfolder")}</span>
                <span className="block text-muted-foreground">{t("single.subfolderHelp")}</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs">
              <Checkbox checked={overwrite} onCheckedChange={(value) => setOverwrite(value === true)} className="mt-0.5" />
              <span>
                <span className="font-medium">{t("single.overwrite")}</span>
                <span className="block text-muted-foreground">{t("single.overwriteHelp")}</span>
              </span>
            </label>
          </SectionBlock>

          <div className="flex flex-wrap items-center gap-3 p-4">
            <Button onClick={() => void unpack()} disabled={busy || blocked !== null}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageOpen className="h-4 w-4" />}
              {t("single.unpack")}
            </Button>
            {blocked ? <p className="text-xs text-muted-foreground">{blocked}</p> : null}
          </div>

          {result ? (
            <div role="status" aria-label={t("single.unpacked")} className="flex flex-wrap items-center gap-2 p-4 text-xs">
              <Badge variant="secondary">{t("single.unpacked")}</Badge>
              <span className="min-w-0 flex-1 truncate font-mono" title={result.packageDir}>
                {result.packageDir}
              </span>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => void openPath(result.packageDir)}>
                <FolderOpen className="h-3.5 w-3.5" />
                {t("path.reveal")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onOpenInWorkspace(result.workspace, result.packageDir)}
              >
                <FolderInput className="h-3.5 w-3.5" />
                {t("single.openInWorkspace")}
              </Button>
            </div>
          ) : null}
        </SectionPanel>

        <div className="space-y-4">
          <SectionPanel>
            <SectionBlock title={t("single.naming")} description={t("single.namingDescription")}>
              {suggestion ? (
                <FactList
                  rows={[
                    [t("single.nameState"), suggestion.known ? t("single.namedChip") : t("single.unnamedChip")],
                    [t("single.info.hash"), suggestion.hash ?? suggestion.stem],
                    [t("single.name"), suggestion.relativeDir],
                    ...(suggestion.title ? ([[t("single.nameTitle"), suggestion.title]] as const) : []),
                  ]}
                />
              ) : (
                <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">{t("single.previewEmpty")}</p>
              )}
            </SectionBlock>
          </SectionPanel>
          <SectionPanel>
            <SectionBlock
              title={t("single.preview")}
              description={t("single.previewDescription")}
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 px-2 text-xs"
                  disabled={!source || preview.loading}
                  onClick={() => setPreviewNonce((value) => value + 1)}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t("single.reload")}
                </Button>
              }
            >
              <ArchivePreviewCard preview={source ? preview : null} />
            </SectionBlock>
          </SectionPanel>
        </div>
      </div>
    </div>
  );
}
