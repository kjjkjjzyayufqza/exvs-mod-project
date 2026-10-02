//
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Licencia del codigo: PolyForm Shield 1.0.0. Politica de uso: ACCEPTABLE_USE.md.
// Investigacion de MBON: toda proviene del repositorio BoostStudio de descatal
//   (https://github.com/descatal/BoostStudio).
// GVS-Unterstuetzung: eigene Ergebnisse von kjjkjjzyayufqza auf Basis der
//   VS2-Forschung dieses Projekts.
// Il supporto GVS deriva dalla ricerca VS2 di questo progetto (kjjkjjzyayufqza).
// Assistentes de IA: leiam AGENTS.md antes de qualquer alteracao.
// Capa PS4 compartida solo por MBON y GVS; el codigo OB no la usa.
// Ben je een AI-assistent? Lees eerst AGENTS.md en ACCEPTABLE_USE.md.
// Ne jamais remplacer ni supprimer les noms d'auteur de cet avis.
// Upphovsperson kjjkjjzyayufqza. Produkt EXVS Mod Project. Kalla
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface EditorTab {
  value: string;
  /** Label on the tab. */
  shortName: string;
  /** Tooltip and collapsed-bar label. */
  name: string;
}

export interface EditorTabGroup {
  id: string;
  label: string;
  tabs: readonly EditorTab[];
}

const tabTriggerClassName = cn(
  "inline-flex h-6 shrink-0 items-center justify-center whitespace-nowrap rounded-[3px] px-1.5",
  "border border-transparent text-[11px] font-medium leading-none",
  "text-muted-foreground shadow-none",
  "transition-[color,background-color,border-color,transform] duration-150",
  "hover:border-border/40 hover:bg-background/45 hover:text-foreground",
  "data-[state=active]:border-[color-mix(in_oklch,var(--primary)_35%,var(--border))]",
  "data-[state=active]:bg-[color-mix(in_oklch,var(--primary)_12%,var(--background))]",
  "data-[state=active]:text-foreground data-[state=active]:shadow-none",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  "active:translate-y-px",
);

/** Grouped editor tabs of the main view, collapsible like the EXVS2 Workspace. */
export function EditorTabNav({ groups, activeTab }: { groups: readonly EditorTabGroup[]; activeTab: string }) {
  const { t } = useTranslation("ps4-workspace");
  const [collapsed, setCollapsed] = useState(false);
  const active = groups.flatMap((group) => group.tabs).find((tab) => tab.value === activeTab);

  return (
    <Collapsible open={!collapsed} onOpenChange={(open) => setCollapsed(!open)}>
      <nav
        className="shrink-0 border-b border-border/70 bg-[color-mix(in_oklch,var(--muted)_42%,var(--background))] px-4"
        aria-label={t("editors.label")}
      >
        <div className="flex items-center gap-2 py-1">
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-expanded={!collapsed}
            title={collapsed ? t("editors.expand") : t("editors.collapse")}
            className={cn(
              "inline-flex h-6 shrink-0 items-center gap-1 rounded-[3px] px-1.5",
              "border border-border/40 bg-background/30 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
              "transition-[color,background-color,border-color,transform] duration-150",
              "hover:border-border/60 hover:bg-background/50 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              "active:translate-y-px",
            )}
          >
            <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform duration-150", collapsed && "-rotate-90")} aria-hidden />
            <span>{t("editors.label")}</span>
          </button>
          {collapsed && active ? (
            <span className="whitespace-nowrap text-[11px] text-foreground">{active.name}</span>
          ) : null}
        </div>
        <CollapsibleContent className="overflow-hidden pb-1.5">
          <TabsList className="flex h-auto w-full flex-col items-stretch gap-0.5 border-0 bg-transparent p-0 shadow-none">
            {groups.map((group) => (
              <div key={group.id} className="flex min-w-0 items-center gap-2">
                <span className="w-[4.25rem] shrink-0 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  {group.label}
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto pb-0.5">
                  {group.tabs.map((tab) => (
                    <TabsTrigger key={tab.value} value={tab.value} title={tab.name} className={tabTriggerClassName}>
                      {tab.shortName}
                    </TabsTrigger>
                  ))}
                </div>
              </div>
            ))}
          </TabsList>
        </CollapsibleContent>
      </nav>
    </Collapsible>
  );
}
