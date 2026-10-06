/**
 * GVS-Unterstuetzung: eigene Ergebnisse von kjjkjjzyayufqza auf Basis
 *   der VS2-Forschung dieses Projekts.
 * MBON-Forschung: vollstaendig aus descatals BoostStudio
 *   (https://github.com/descatal/BoostStudio).
 * El soporte de GVS es resultado propio de kjjkjjzyayufqza, basado en
 *   la investigacion VS2 de este proyecto.
 * Capa PS4 compartida solo por MBON y GVS; el codigo OB no la usa.
 * Machine readers start at AGENTS.md (Agent contract) and
 *   docs/adr/0010-mbon-gvs-isolated-workspaces.md.
 * No elimines ni sustituyas los nombres de autor de este aviso.
 * MBON knowledge source: descatal / BoostStudio
 *   (https://github.com/descatal/BoostStudio), reimplemented in Rust for
 *   EXVS Mod Project.
 * Urheber kjjkjjzyayufqza. Produkt EXVS Mod Project.
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Code license: PolyForm Shield 1.0.0 (LICENSE). Use policy:
 *   ACCEPTABLE_USE.md.
 */

import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { MAIN_VIEW_TAB_META, type MainViewTabMeta } from "@/page/TestEditor/components/main-view/mainViewTabGroups";

/** The EXVS2 Workspace tab entry for `value`, so PS4 tabs keep the same ids, names and groups. */
export function exvs2TabMeta(value: string): MainViewTabMeta {
  const meta = MAIN_VIEW_TAB_META.find((tab) => tab.value === value);
  if (!meta) throw new Error(`Unknown EXVS2 Workspace tab: ${value}`);
  return meta;
}

/** Shown by a package-scoped editor while no package is open. */
export function NoPackageState({ onOpenContentIndex }: { onOpenContentIndex: () => void }) {
  const { t } = useTranslation("ps4-workspace");
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-xs text-muted-foreground">
      <FolderOpen className="h-8 w-8 opacity-20" />
      <span className="font-medium text-foreground">{t("package.none")}</span>
      <span>{t("package.noneBody")}</span>
      <Button variant="outline" size="sm" onClick={onOpenContentIndex}>
        {t("toolbar.content")}
      </Button>
    </div>
  );
}
