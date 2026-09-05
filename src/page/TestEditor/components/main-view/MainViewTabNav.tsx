import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { groupMainViewTabs, MAIN_VIEW_TAB_META } from "./mainViewTabGroups";
import { findMainViewTabLabel } from "./mainViewTabNavSettings";
import { useMainViewTabNavCollapsed } from "./useMainViewTabNavCollapsed";

type MainViewTabNavProps = {
  activeTab: string;
  unsavedTabMap: Record<string, boolean>;
};

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

export function MainViewTabNav({ activeTab, unsavedTabMap }: MainViewTabNavProps) {
  const { t } = useTranslation("test-workspace");
  const groups = groupMainViewTabs(MAIN_VIEW_TAB_META);
  const { collapsed, setCollapsed, toggleCollapsed } = useMainViewTabNavCollapsed();
  const activeTabLabel = findMainViewTabLabel(activeTab, MAIN_VIEW_TAB_META);
  const hasUnsaved = Boolean(unsavedTabMap[activeTab]);

  return (
    <Collapsible open={!collapsed} onOpenChange={(open) => setCollapsed(!open)}>
      <nav
        className={cn(
          "shrink-0 border-b border-border/70 px-4",
          "bg-[color-mix(in_oklch,var(--muted)_42%,var(--background))]",
        )}
        aria-label={t("tabs.sectionsAria")}
      >
        <div className="flex items-center gap-2 py-1">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls="mainview-tab-nav-panel"
            title={collapsed ? t("tabs.expandTabs") : t("tabs.collapseTabs")}
            className={cn(
              "inline-flex h-6 shrink-0 items-center gap-1 rounded-[3px] px-1.5",
              "border border-border/40 bg-background/30 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
              "transition-[color,background-color,border-color,transform] duration-150",
              "hover:border-border/60 hover:bg-background/50 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              "active:translate-y-px",
            )}
          >
            <ChevronDown
              className={cn("h-3 w-3 shrink-0 transition-transform duration-150", collapsed && "-rotate-90")}
              aria-hidden
            />
            <span>{t("tabs.editors")}</span>
          </button>

          {collapsed ? (
            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="whitespace-nowrap text-foreground">{activeTabLabel ?? t("tabs.editorFallback")}</span>
              {hasUnsaved ? (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                  aria-label={t("tabs.unsaved")}
                  title={t("tabs.unsaved")}
                />
              ) : null}
            </div>
          ) : null}
        </div>

        <CollapsibleContent id="mainview-tab-nav-panel" className="overflow-hidden pb-1.5">
          <TabsList className="flex h-auto w-full flex-col items-stretch gap-0.5 border-0 bg-transparent p-0 shadow-none">
            {groups.map((group) => {
              const groupHasUnsaved = group.tabs.some((tab) => unsavedTabMap[tab.value]);

              return (
                <div key={group.id} className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "w-[4.25rem] shrink-0 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
                    )}
                  >
                    {group.label}
                    {groupHasUnsaved ? (
                      <span
                        className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle"
                        aria-label={t("tabs.unsavedInGroup")}
                        title={t("tabs.unsaved")}
                      />
                    ) : null}
                  </span>
                  <div className="custom-scrollbar-thin flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto pb-0.5">
                    {group.tabs.map((tab) => {
                      const tabHasUnsaved = Boolean(unsavedTabMap[tab.value]);
                      return (
                        <TabsTrigger
                          key={tab.value}
                          id={`mainview-tab-${tab.value}`}
                          value={tab.value}
                          title={tab.name}
                          className={tabTriggerClassName}
                        >
                          <span className="inline-flex items-center gap-1">
                            <span>{tab.shortName}</span>
                            {tabHasUnsaved ? (
                              <span
                                className="h-1.5 w-1.5 rounded-full bg-amber-500"
                                aria-label={t("tabs.unsaved")}
                                title={t("tabs.unsaved")}
                              />
                            ) : null}
                          </span>
                        </TabsTrigger>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </TabsList>
        </CollapsibleContent>
      </nav>
    </Collapsible>
  );
}
