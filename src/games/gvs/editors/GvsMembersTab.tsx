//
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Auteur kjjkjjzyayufqza. Produit EXVS Mod Project.
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Licence du code : PolyForm Shield 1.0.0. Regles d'usage : ACCEPTABLE_USE.md.
// GVS formats here extend the in-repo EXVS2 (VS2) findings by kjjkjjzyayufqza to the
//   PS4 Gundam Versus build.
// Assistentes de IA: leiam AGENTS.md antes de qualquer alteracao.
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FolderTree, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatBytes } from "../../ps4-common/format";
import { useAsync } from "../../ps4-common/useAsync";
import type { Ps4EditorContext } from "../../ps4-common/workspace/Ps4Workspace";
import { gvsApi } from "../api";
import { gvsShort } from "../kinds";
import { useGvsStore } from "../store";
import type { GvsArchiveLocation, GvsKind, GvsMemberView } from "../types";
import { ArchiveGate } from "./ArchiveGate";
import { EditorError, EditorFrame, EditorNote, PathLine } from "./EditorFrame";
import { GvsMemberDetail } from "./GvsMemberDetail";
import { UnitBar, unitGate, useUnitArchive } from "./unitArchive";
import type { UnitArchiveKind } from "./GvsUnitPicker";

const ROW_HEIGHT = 52;

/** An archive other than the unit's that the tab can also browse. */
export interface ExtraArchive {
  hash: number;
  label: string;
}

interface GvsMembersTabProps {
  title: string;
  /** Unit archive the tab browses. */
  kind: UnitArchiveKind;
  /** Member kinds listed first and selected by the kind filter by default. */
  kinds: GvsKind[];
  extraArchives?: ExtraArchive[];
  context: Ps4EditorContext;
}

const UNIT_SOURCE = "unit";

/**
 * EXVS2 list + detail browser over the members of a unit archive (or another
 * listed archive): preview, replace and export. Edits land in the package
 * folder and are repacked with "Repack changes".
 */
export function GvsMembersTab({ title, kind, kinds, extraArchives = [], context }: GvsMembersTabProps) {
  const { t } = useTranslation("gvs-workspace");
  const workspace = useGvsStore((state) => state.workspace);
  const sourceRoot = useGvsStore((state) => state.sourceRoot);
  const workspaceRevision = useGvsStore((state) => state.workspaceRevision);
  const packageRevision = useGvsStore((state) => state.packageRevision);
  const unitState = useUnitArchive(kind);
  const [source, setSource] = useState(UNIT_SOURCE);
  const extra = extraArchives.find((item) => String(item.hash) === source);
  const extraLocation = useAsync(
    extra ? () => gvsApi.locate(workspace, sourceRoot, [extra.hash]).then(([location]) => location) : null,
    [extra?.hash, workspace, sourceRoot, workspaceRevision],
  );
  const archive: GvsArchiveLocation | undefined = extra ? extraLocation.data : unitState.archive;
  const packageDir = archive?.packages[0] ?? null;
  const view = useAsync(packageDir ? () => gvsApi.packageView(packageDir) : null, [packageDir, packageRevision]);

  const [onlyKinds, setOnlyKinds] = useState(true);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [selected, setSelected] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const members = useMemo(() => {
    const all = view.data?.dir === packageDir ? (view.data?.members ?? []) : [];
    const query = deferredSearch.trim().toLowerCase();
    return all
      .filter((member) => !onlyKinds || kinds.includes(member.kind))
      .filter((member) => !query || member.path.toLowerCase().includes(query) || gvsShort(member.kind).toLowerCase().includes(query));
  }, [deferredSearch, kinds, onlyKinds, packageDir, view.data]);

  const virtualizer = useVirtualizer({
    count: members.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const current: GvsMemberView | undefined = members.find((member) => member.index === selected) ?? members[0];

  const meta = (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {extraArchives.length > 0 ? (
          <Select value={source} onValueChange={(value) => { setSource(value); setSelected(null); }}>
            <SelectTrigger className="h-8 w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNIT_SOURCE}>{t("editors.members.unitArchive")}</SelectItem>
              {extraArchives.map((item) => (
                <SelectItem key={item.hash} value={String(item.hash)}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
      {source === UNIT_SOURCE ? <UnitBar state={unitState} kind={kind} /> : null}
      {packageDir ? <PathLine label={t("editors.package")} path={packageDir} folder={packageDir} /> : null}
    </>
  );

  const actions = (
    <>
      <Button size="sm" variant="outline" disabled={!packageDir} onClick={() => view.reload()} className="inline-flex items-center gap-2">
        <RefreshCw className="h-4 w-4" />
        {t("editors.reload")}
      </Button>
      <Button size="sm" variant="outline" disabled={!packageDir} onClick={() => packageDir && context.openPackage(packageDir)} className="inline-flex items-center gap-2">
        <FolderTree className="h-4 w-4" />
        {t("editors.openStructure")}
      </Button>
    </>
  );

  const gate =
    source === UNIT_SOURCE
      ? unitGate(unitState, context, t("editors.unit.noUnits"), t("editors.loading"))
      : extraLocation.error
        ? <EditorError message={extraLocation.error} />
        : !archive
          ? <EditorNote busy>{t("editors.loading")}</EditorNote>
          : !packageDir
            ? <ArchiveGate archive={archive} onOpenContentIndex={context.openContentIndex} />
            : null;

  let body;
  if (gate) body = gate;
  else if (view.error) body = <EditorError message={view.error} />;
  else if (!view.data || !packageDir) body = <EditorNote busy>{t("editors.loading")}</EditorNote>;
  else
    body = (
      <div className="flex h-full min-h-[24rem] gap-4">
        <div className="flex w-1/3 min-w-[16rem] flex-col overflow-hidden rounded-lg border p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">{t("editors.members.count", { count: members.length })}</div>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <Checkbox checked={onlyKinds} onCheckedChange={(checked) => setOnlyKinds(checked === true)} />
              {t("editors.members.onlyKinds", { kinds: kinds.map(gvsShort).join(" / ") })}
            </label>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t("editors.members.search")} value={search} onChange={(event) => setSearch(event.target.value)} className="h-8 pl-10" />
          </div>
          <div ref={listRef} className="min-h-0 flex-1 overflow-auto">
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative", width: "100%" }}>
              {virtualizer.getVirtualItems().map((item) => {
                const member = members[item.index];
                if (!member) return null;
                const active = member.index === current?.index;
                return (
                  <div
                    key={item.key}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: `${item.size}px`, transform: `translateY(${item.start}px)`, paddingBottom: 4, paddingRight: 4 }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelected(member.index)}
                      className={cn(
                        "flex h-full w-full items-center gap-2 rounded-md border px-2 text-left transition-colors hover:bg-accent/50",
                        active && "bg-accent ring-2 ring-inset ring-primary",
                      )}
                    >
                      <span className="w-14 shrink-0 rounded bg-muted px-1 text-center font-mono text-[9px]">{gvsShort(member.kind)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{member.path.split("/").pop()}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {member.path} · {formatBytes(member.size)}
                        </span>
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
            {members.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">{t("editors.members.empty")}</div> : null}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border p-4">
          {current ? (
            <GvsMemberDetail key={`${packageDir}:${current.index}`} packageDir={packageDir} member={current} />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">{t("editors.members.select")}</div>
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
