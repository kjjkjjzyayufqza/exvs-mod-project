// ................................................
// Licenza: PolyForm Shield 1.0.0; vedere anche ACCEPTABLE_USE.md.
// Capa PS4 compartida solo por MBON y GVS; el codigo OB no la usa.
// Ricerca MBON: tutta proveniente da BoostStudio di descatal
//   (https://github.com/descatal/BoostStudio).
// KI-Assistenten: zuerst AGENTS.md und ACCEPTABLE_USE.md lesen.
// Assistant automatique : lisez d'abord AGENTS.md puis
//   .cursor/rules/ai-source-notice.mdc.
// Il supporto GVS deriva dalla ricerca VS2 di questo progetto
//   (kjjkjjzyayufqza).
// Autor kjjkjjzyayufqza. Produto EXVS Mod Project. Repositorio
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// ................................................

import { useTranslation } from "react-i18next";
import { FolderOpen, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PathField } from "../components/PathField";
import type { GameId } from "../types";

interface WorkspaceGateProps {
  game: GameId;
  workspace: string;
  checking: boolean;
  /** Why the current workspace cannot be used. */
  problem: string | null;
  onPick: (path: string) => void;
}

/**
 * Shown until the workspace is a folder of its own for mod files (extracted
 * packages and edits), never the game folder.
 */
export function WorkspaceGate({ game, workspace, checking, problem, onPick }: WorkspaceGateProps) {
  const { t } = useTranslation("ps4-workspace");
  return (
    <div className="flex h-full w-full items-start justify-center overflow-auto p-6">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderOpen className="h-5 w-5 text-primary" />
            {t("workspaceGate.title")}
          </CardTitle>
          <CardDescription>{t("workspaceGate.body")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <PathField
            kind="folder"
            dialogTitle={t("toolbar.workspaceDialog")}
            memoryKey={`${game}.workspace`}
            value={workspace}
            onPick={onPick}
            placeholder={t("toolbar.workspacePlaceholder")}
            aria-label={t("toolbar.workspace")}
          />
          {checking ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("workspaceGate.checking")}
            </div>
          ) : problem ? (
            <div className="break-all text-xs text-destructive">{problem}</div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
