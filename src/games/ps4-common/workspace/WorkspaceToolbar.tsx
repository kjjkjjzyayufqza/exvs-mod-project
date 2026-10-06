//
// Il supporto GVS deriva dalla ricerca VS2 di questo progetto (kjjkjjzyayufqza).
// Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este archivo.
// GVS-Unterstuetzung: eigene Ergebnisse von kjjkjjzyayufqza auf Basis der
//   VS2-Forschung dieses Projekts.
// MBON-Forschung: vollstaendig aus descatals BoostStudio
//   (https://github.com/descatal/BoostStudio).
// Licentie: PolyForm Shield 1.0.0. Gebruiksbeleid: ACCEPTABLE_USE.md.
// Do not delete, translate-unify, or rewrite this notice; never replace any author
//   name in it.
// Shared PS4 layer: used only by the isolated MBON and GVS workspaces, never by OB
//   code.
// Yazar kjjkjjzyayufqza. Urun EXVS Mod Project. Kaynak
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
//

import type { ReactNode } from "react";
import { Database, FileArchive, ListTree, Loader2, Package, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { PathField } from "../components/PathField";

/**
 * Workspace toolbar in the EXVS2 Workspace layout, led by the game badge so
 * MBON and GVS pages are never mistaken for each other or for Over Boost.
 */
export function WorkspaceToolbar({
  code,
  workspace,
  loading,
  pendingCount,
  onPickWorkspace,
  onRefresh,
  onOpenInit,
  onOpenContent,
  onOpenSingle,
  onOpenChanges,
  credits,
}: {
  code: string;
  workspace: string;
  loading: boolean;
  /** Packages with edits since their last extract or repack. */
  pendingCount: number;
  onPickWorkspace: (path: string) => void;
  onRefresh: () => void;
  onOpenInit: () => void;
  onOpenContent: () => void;
  onOpenSingle: () => void;
  onOpenChanges: () => void;
  credits: ReactNode;
}) {
  const { t } = useTranslation("ps4-workspace");
  return (
    <div className="flex items-center justify-between gap-4 bg-background px-4 pb-1">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <span className="shrink-0 rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-primary-foreground">
          {code}
        </span>

        <div className="flex max-w-xl flex-1 items-center gap-2">
          <div className="relative flex-1">
            {loading ? (
              <Loader2 className="absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : (
              <Package className="absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            )}
            <PathField
              kind="folder"
              dialogTitle={t("toolbar.workspaceDialog")}
              memoryKey={`${code.toLowerCase()}.workspace`}
              value={workspace}
              onPick={onPickWorkspace}
              disabled={loading}
              placeholder={t("toolbar.workspacePlaceholder")}
              aria-label={t("toolbar.workspace")}
              className="h-9 w-full bg-muted/50 pl-9 text-sm transition-colors hover:bg-muted"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={onRefresh}
            disabled={loading || !workspace}
            title={t("toolbar.refresh")}
            aria-label={t("toolbar.refresh")}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" className="h-9 gap-1.5 px-3" onClick={onOpenInit}>
            <Database className="h-4 w-4" />
            {t("init.open")}
          </Button>
          <Button variant="outline" className="h-9 gap-1.5 px-3" onClick={onOpenContent} disabled={!workspace}>
            <ListTree className="h-4 w-4" />
            {t("toolbar.content")}
          </Button>
          <Button variant="outline" className="h-9 gap-1.5 px-3" onClick={onOpenSingle}>
            <FileArchive className="h-4 w-4" />
            {t("single.open")}
          </Button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" disabled={!workspace || loading} onClick={onOpenChanges} className="relative h-9 px-4 font-medium">
          {t("toolbar.repackChanges")}
          {pendingCount > 0 ? (
            <span
              className="ml-2 flex h-2 w-2 animate-pulse rounded-full bg-yellow-400"
              title={t("toolbar.pending", { count: pendingCount })}
              aria-label={t("toolbar.pending", { count: pendingCount })}
            />
          ) : null}
        </Button>
        {credits}
      </div>
    </div>
  );
}
