import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import RepackFolderStructureView from "./RepackFolderStructureView";
import CharacterIdTableView from "./CharacterIdTableView";
import CharacterCostView from "./CharacterCostView";
import CharacterListView from "./CharacterListView";
import SeriesListView from "./SeriesListView";
import CardIconListView from "./CardIconListView";
import StageIconListView from "./StageIconListView";
import StageListView from "./StageListView";
import MscWorkspaceView from "./msc-editor/MscWorkspaceView";
import ParamEditorView from "./param-editor/ParamEditorView";
import { BulletEditorView } from "./param-editors/bullet-editor/BulletEditorView";
import { ArmsEditorView } from "./param-editors/arms-editor/ArmsEditorView";
import { SpeedEditorView } from "./param-editors/speed-editor/SpeedEditorView";
import { CharacterEditorView } from "./param-editors/character-editor/CharacterEditorView";
import { ChrSysEditorView } from "./param-editors/chrsys-editor/ChrSysEditorView";
import { GrapEditorView } from "./param-editors/grap-editor/GrapEditorView";
import { DepictionEditorView } from "./param-editors/depiction-editor/DepictionEditorView";
import { HitGroupEditorView } from "./param-editors/hitgroup-editor/HitGroupEditorView";
import { InteractionEditorView } from "./param-editors/interaction-editor/InteractionEditorView";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";

type StageTab = {
  name: string;
  value: string;
  content?: React.ReactNode;
  render?: (props: MainViewProps) => React.ReactNode;
};

interface MainViewProps {
  jsonFilePath?: string | null;
  folderPath?: string | null;
  /** Folder path for MSC Workspace when the tree selection is a folder (or file parent) that contains .bscex/.cscex/.dscex files. */
  mscWorkspaceFolderPath?: string | null;
  onMscWorkspaceFolderChange?: (path: string | null) => void;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  onRevealTreeFolder?: (path: string) => void;
  workspaceDocument: TestEditorWorkspaceDocument;
}

const TAB_STRIP_SCROLL_EPSILON_px = 2;

const tabs: StageTab[] = [
  {
    name: "Folder structure",
    value: "folder-structure",
    render: (props: MainViewProps) => (
      <RepackFolderStructureView
        jsonFilePath={props.jsonFilePath}
        onUnsavedChanges={props.onUnsavedChanges}
      />
    ),
  },
  {
    name: "Character ID Table",
    value: "character-id-table",
    render: (props: MainViewProps) => (
      <CharacterIdTableView
        folderPath={props.folderPath ?? ""}
        isActive={false}
        onUnsavedChanges={props.onUnsavedChanges}
        workspaceDocument={props.workspaceDocument}
      />
    ),
  },
  {
    name: "Character Cost",
    value: "character-cost",
    render: (props: MainViewProps) => (
      <CharacterCostView
        folderPath={props.folderPath ?? ""}
        isActive={false}
        onUnsavedChanges={props.onUnsavedChanges}
      />
    ),
  },
  {
    name: "Character list",
    value: "character-list",
    render: (props: MainViewProps) => (
      <CharacterListView
        folderPath={props.folderPath ?? ""}
        isActive={false}
        onUnsavedChanges={props.onUnsavedChanges}
        workspaceDocument={props.workspaceDocument}
      />
    ),
  },
  {
    name: "Series List",
    value: "series-list",
    render: (props: MainViewProps) => (
      <SeriesListView
        folderPath={props.folderPath ?? ""}
        isActive={false}
        onUnsavedChanges={props.onUnsavedChanges}
        workspaceDocument={props.workspaceDocument}
      />
    ),
  },
  {
    name: "Card Icon List",
    value: "card-icon-list",
    render: (props: MainViewProps) => (
      <CardIconListView
        folderPath={props.folderPath ?? ""}
        isActive={false}
        onUnsavedChanges={props.onUnsavedChanges}
      />
    ),
  },
  {
    name: "Stage Icon List",
    value: "stage-icon-list",
    render: (props: MainViewProps) => (
      <StageIconListView
        folderPath={props.folderPath ?? ""}
        isActive={false}
        onUnsavedChanges={props.onUnsavedChanges}
      />
    ),
  },
  {
    name: "Stage List",
    value: "stage-list",
    render: (props: MainViewProps) => (
      <StageListView
        folderPath={props.folderPath ?? ""}
        isActive={false}
        onUnsavedChanges={props.onUnsavedChanges}
      />
    ),
  },
  {
    name: "MSC Workspace",
    value: "msc-workspace",
    render: (props: MainViewProps) => (
      <MscWorkspaceView
        workspaceRoot={props.folderPath ?? ""}
        mscFolderPath={props.mscWorkspaceFolderPath ?? null}
        onMscFolderChange={props.onMscWorkspaceFolderChange}
        isActive={false}
        onUnsavedChanges={props.onUnsavedChanges}
      />
    ),
  },
  {
    name: "Param Editor",
    value: "param-editor",
    render: (props: MainViewProps) => <ParamEditorView onUnsavedChanges={props.onUnsavedChanges} />,
  },
  {
    name: "Bullet Editor",
    value: "bullet-editor",
    render: (props: MainViewProps) => <BulletEditorView onUnsavedChanges={props.onUnsavedChanges} />,
  },
  {
    name: "Arms Editor",
    value: "arms-editor",
    render: (props: MainViewProps) => <ArmsEditorView onUnsavedChanges={props.onUnsavedChanges} />,
  },
  {
    name: "Speed Editor",
    value: "speed-editor",
    render: (props: MainViewProps) => <SpeedEditorView onUnsavedChanges={props.onUnsavedChanges} />,
  },
  {
    name: "Character Editor",
    value: "character-editor",
    render: (props: MainViewProps) => <CharacterEditorView onUnsavedChanges={props.onUnsavedChanges} />,
  },
  {
    name: "ChrSys Editor",
    value: "chrsys-editor",
    render: (props: MainViewProps) => <ChrSysEditorView onUnsavedChanges={props.onUnsavedChanges} />,
  },
  {
    name: "Grap Editor",
    value: "grap-editor",
    render: (props: MainViewProps) => <GrapEditorView onUnsavedChanges={props.onUnsavedChanges} />,
  },
  {
    name: "Depiction Editor",
    value: "depiction-editor",
    render: (props: MainViewProps) => <DepictionEditorView onUnsavedChanges={props.onUnsavedChanges} />,
  },
  {
    name: "HitGroup Editor",
    value: "hitgroup-editor",
    render: (props: MainViewProps) => <HitGroupEditorView onUnsavedChanges={props.onUnsavedChanges} />,
  },
  {
    name: "Interaction Editor",
    value: "interaction-editor",
    render: (props: MainViewProps) => <InteractionEditorView onUnsavedChanges={props.onUnsavedChanges} />,
  },
];

const MainView = ({
  jsonFilePath,
  folderPath,
  mscWorkspaceFolderPath,
  onMscWorkspaceFolderChange,
  onUnsavedChanges,
  onRevealTreeFolder,
  workspaceDocument,
}: MainViewProps) => {
  const initialTab = tabs[0]?.value ?? "folder-structure";
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set([initialTab]));
  const [pendingCharacterIdTableSelection, setPendingCharacterIdTableSelection] = useState<number | null>(null);
  const [folderStructureHasUnsaved, setFolderStructureHasUnsaved] = useState(false);
  const [characterIdTableHasUnsaved, setCharacterIdTableHasUnsaved] = useState(false);
  const [characterCostHasUnsaved, setCharacterCostHasUnsaved] = useState(false);
  const [characterListHasUnsaved, setCharacterListHasUnsaved] = useState(false);
  const [seriesListHasUnsaved, setSeriesListHasUnsaved] = useState(false);
  const [stageListHasUnsaved, setStageListHasUnsaved] = useState(false);
  const [stageIconListHasUnsaved, setStageIconListHasUnsaved] = useState(false);
  const [mscWorkspaceHasUnsaved, setMscWorkspaceHasUnsaved] = useState(false);

  const tabStripRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const syncTabStripScrollEdges = useCallback(() => {
    const el = tabStripRef.current;
    if (!el) {
      return;
    }
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > TAB_STRIP_SCROLL_EPSILON_px);
    setCanScrollRight(
      scrollLeft + clientWidth < scrollWidth - TAB_STRIP_SCROLL_EPSILON_px,
    );
  }, []);

  const scrollTabStrip = (direction: -1 | 1) => {
    const el = tabStripRef.current;
    if (!el) {
      throw new Error("MainView: tab strip scroll container is not mounted");
    }
    const delta = Math.max(80, Math.round(el.clientWidth * 0.45));
    el.scrollBy({ left: direction * delta, behavior: "smooth" });
  };

  useEffect(() => {
    const el = tabStripRef.current;
    if (!el) {
      return;
    }
    syncTabStripScrollEdges();
    const onScroll = () => syncTabStripScrollEdges();
    const ro = new ResizeObserver(() => syncTabStripScrollEdges());
    ro.observe(el);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  }, [syncTabStripScrollEdges]);

  const handleUnsavedChanges = useCallback((hasChanges: boolean) => {
    setFolderStructureHasUnsaved(hasChanges);
    onUnsavedChanges?.(hasChanges);
  }, [onUnsavedChanges]);

  const handleCharacterIdTableUnsaved = useCallback((hasChanges: boolean) => {
    setCharacterIdTableHasUnsaved(hasChanges);
  }, []);

  const handleCharacterCostUnsaved = useCallback((hasChanges: boolean) => {
    setCharacterCostHasUnsaved(hasChanges);
  }, []);

  const handleCharacterListUnsaved = useCallback((hasChanges: boolean) => {
    setCharacterListHasUnsaved(hasChanges);
  }, []);

  const handleSeriesListUnsaved = useCallback((hasChanges: boolean) => {
    setSeriesListHasUnsaved(hasChanges);
  }, []);

  const handleStageListUnsaved = useCallback((hasChanges: boolean) => {
    setStageListHasUnsaved(hasChanges);
  }, []);

  const handleStageIconListUnsaved = useCallback((hasChanges: boolean) => {
    setStageIconListHasUnsaved(hasChanges);
  }, []);

  const handleMscWorkspaceUnsaved = useCallback((hasChanges: boolean) => {
    setMscWorkspaceHasUnsaved(hasChanges);
  }, []);

  const [paramEditorHasUnsaved, setParamEditorHasUnsaved] = useState(false);
  const handleParamEditorUnsaved = useCallback((hasChanges: boolean) => {
    setParamEditorHasUnsaved(hasChanges);
  }, []);
  const unsavedTabMap = useMemo<Record<string, boolean>>(
    () => ({
      "folder-structure": folderStructureHasUnsaved,
      "character-id-table": characterIdTableHasUnsaved,
      "character-cost": characterCostHasUnsaved,
      "character-list": characterListHasUnsaved,
      "series-list": seriesListHasUnsaved,
      "card-icon-list": stageIconListHasUnsaved,
      "stage-icon-list": stageIconListHasUnsaved,
      "stage-list": stageListHasUnsaved,
      "msc-workspace": mscWorkspaceHasUnsaved,
      "param-editor": paramEditorHasUnsaved,
    }),
    [
      folderStructureHasUnsaved,
      characterIdTableHasUnsaved,
      characterCostHasUnsaved,
      characterListHasUnsaved,
      seriesListHasUnsaved,
      stageIconListHasUnsaved,
      stageListHasUnsaved,
      mscWorkspaceHasUnsaved,
      paramEditorHasUnsaved,
    ],
  );

  const handleJumpToCharacterIdTable = useCallback((characterId: number) => {
    setPendingCharacterIdTableSelection(characterId);
    setActiveTab("character-id-table");
    setVisitedTabs((prev) => {
      if (prev.has("character-id-table")) return prev;
      const next = new Set(prev);
      next.add("character-id-table");
      return next;
    });
  }, []);

  const handleConsumePendingCharacterIdTableSelection = useCallback(() => {
    setPendingCharacterIdTableSelection(null);
  }, []);

  const resolvedTabs = useMemo<StageTab[]>(() => {
    return tabs.map((tab) => {
      if (tab.value === "folder-structure") {
        return {
          ...tab,
          render: (props: MainViewProps) => (
            <RepackFolderStructureView
              jsonFilePath={props.jsonFilePath}
              onUnsavedChanges={handleUnsavedChanges}
            />
          ),
        };
      }

      if (tab.value === "character-id-table") {
        return {
          ...tab,
          render: (props: MainViewProps) => (
            <CharacterIdTableView
              folderPath={props.folderPath ?? ""}
              isActive={activeTab === "character-id-table"}
              onUnsavedChanges={handleCharacterIdTableUnsaved}
              onRevealTreeFolder={props.onRevealTreeFolder}
              pendingSelectCharacterId={pendingCharacterIdTableSelection}
              onConsumePendingSelect={handleConsumePendingCharacterIdTableSelection}
              workspaceDocument={props.workspaceDocument}
            />
          ),
        };
      }

      if (tab.value === "character-cost") {
        return {
          ...tab,
          render: (props: MainViewProps) => (
            <CharacterCostView
              folderPath={props.folderPath ?? ""}
              isActive={activeTab === "character-cost"}
              onUnsavedChanges={handleCharacterCostUnsaved}
            />
          ),
        };
      }

      if (tab.value === "character-list") {
        return {
          ...tab,
          render: (props: MainViewProps) => (
            <CharacterListView
              folderPath={props.folderPath ?? ""}
              isActive={activeTab === "character-list"}
              onUnsavedChanges={handleCharacterListUnsaved}
              onJumpToCharacterIdTable={handleJumpToCharacterIdTable}
              workspaceDocument={props.workspaceDocument}
            />
          ),
        };
      }

      if (tab.value === "series-list") {
        return {
          ...tab,
          render: (props: MainViewProps) => (
            <SeriesListView
              folderPath={props.folderPath ?? ""}
              isActive={activeTab === "series-list"}
              onUnsavedChanges={handleSeriesListUnsaved}
              workspaceDocument={props.workspaceDocument}
            />
          ),
        };
      }

      if (tab.value === "card-icon-list") {
        return {
          ...tab,
          render: (props: MainViewProps) => (
            <CardIconListView
              folderPath={props.folderPath ?? ""}
              isActive={activeTab === "card-icon-list"}
              onUnsavedChanges={props.onUnsavedChanges}
            />
          ),
        };
      }

      if (tab.value === "stage-icon-list") {
        return {
          ...tab,
          render: (props: MainViewProps) => (
            <StageIconListView
              folderPath={props.folderPath ?? ""}
              isActive={activeTab === "stage-icon-list"}
              onUnsavedChanges={handleStageIconListUnsaved}
            />
          ),
        };
      }

      if (tab.value === "stage-list") {
        return {
          ...tab,
          render: (props: MainViewProps) => (
            <StageListView
              folderPath={props.folderPath ?? ""}
              isActive={activeTab === "stage-list"}
              onUnsavedChanges={handleStageListUnsaved}
              onRevealTreeFolder={props.onRevealTreeFolder}
            />
          ),
        };
      }

      if (tab.value === "msc-workspace") {
        return {
          ...tab,
          render: (props: MainViewProps) => (
            <MscWorkspaceView
              workspaceRoot={props.folderPath ?? ""}
              mscFolderPath={props.mscWorkspaceFolderPath ?? null}
              onMscFolderChange={props.onMscWorkspaceFolderChange}
              isActive={activeTab === "msc-workspace"}
              onUnsavedChanges={handleMscWorkspaceUnsaved}
            />
          ),
        };
      }

      if (tab.value === "param-editor") {
        return {
          ...tab,
          render: (props: MainViewProps) => <ParamEditorView onUnsavedChanges={handleParamEditorUnsaved} />,
        };
      }

      return tab;
    });
  }, [
    activeTab,
    handleCharacterIdTableUnsaved,
    handleCharacterCostUnsaved,
    handleCharacterListUnsaved,
    handleConsumePendingCharacterIdTableSelection,
    handleJumpToCharacterIdTable,
    handleSeriesListUnsaved,
    handleStageIconListUnsaved,
    handleStageListUnsaved,
    handleMscWorkspaceUnsaved,
    handleParamEditorUnsaved,
    handleUnsavedChanges,
    mscWorkspaceFolderPath,
    onMscWorkspaceFolderChange,
    pendingCharacterIdTableSelection,
  ]);

  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => syncTabStripScrollEdges());
    return () => cancelAnimationFrame(id);
  }, [activeTab, syncTabStripScrollEdges]);

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value);
    setVisitedTabs((prev) => {
      if (prev.has(value)) return prev;
      const next = new Set(prev);
      next.add(value);
      return next;
    });
  }, []);

  const renderTabPanel = (tab: StageTab) => {
    const props: MainViewProps = {
      jsonFilePath,
      folderPath,
      mscWorkspaceFolderPath,
      onMscWorkspaceFolderChange,
      onUnsavedChanges,
      onRevealTreeFolder,
      workspaceDocument,
    };
    if (tab.render) return tab.render(props);
    return tab.content ?? null;
  };

  return (
    <div className="flex h-full w-full min-h-0 bg-background">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex h-full w-full min-h-0 flex-col rounded-none p-0 m-0">
        <div className="flex min-h-10 w-full shrink-0 items-stretch gap-1 border-b bg-muted/50 px-1 py-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-auto min-h-8 w-8 shrink-0 self-center"
            onClick={() => scrollTabStrip(-1)}
            disabled={!canScrollLeft}
            aria-label="Scroll tabs left"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div
            ref={tabStripRef}
            className="min-h-8 min-w-0 flex-1 overflow-x-auto scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            <TabsList className="inline-flex h-8 min-w-min flex-nowrap items-center justify-start gap-1 border-0 bg-transparent p-0 shadow-none">
              {resolvedTabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  id={`mainview-tab-${tab.value}`}
                  value={tab.value}
                  className="h-8 shrink-0 rounded-md px-3 text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  <span className="inline-flex items-center gap-2">
                    <span>{tab.name}</span>
                    {tab.value === "folder-structure" && folderStructureHasUnsaved && (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse"
                        aria-label="Unsaved changes"
                        title="Unsaved changes"
                      />
                    )}
                    {tab.value === "character-id-table" && characterIdTableHasUnsaved && (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse"
                        aria-label="Unsaved changes"
                        title="Unsaved changes"
                      />
                    )}
                    {tab.value === "character-cost" && characterCostHasUnsaved && (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse"
                        aria-label="Unsaved changes"
                        title="Unsaved changes"
                      />
                    )}
                    {tab.value === "character-list" && characterListHasUnsaved && (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse"
                        aria-label="Unsaved changes"
                        title="Unsaved changes"
                      />
                    )}
                    {tab.value === "series-list" && seriesListHasUnsaved && (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse"
                        aria-label="Unsaved changes"
                        title="Unsaved changes"
                      />
                    )}
                    {tab.value === "stage-icon-list" && stageIconListHasUnsaved && (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse"
                        aria-label="Unsaved changes"
                        title="Unsaved changes"
                      />
                    )}
                    {tab.value === "stage-list" && stageListHasUnsaved && (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse"
                        aria-label="Unsaved changes"
                        title="Unsaved changes"
                      />
                    )}
                    {tab.value === "msc-workspace" && mscWorkspaceHasUnsaved && (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse"
                        aria-label="Unsaved changes"
                        title="Unsaved changes"
                      />
                    )}
                    {tab.value === "param-editor" && paramEditorHasUnsaved && (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse"
                        aria-label="Unsaved changes"
                        title="Unsaved changes"
                      />
                    )}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-auto min-h-8 w-8 shrink-0 self-center"
            onClick={() => scrollTabStrip(1)}
            disabled={!canScrollRight}
            aria-label="Scroll tabs right"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col">
          {resolvedTabs.map((tab) => {
            if (!visitedTabs.has(tab.value)) return null;
            const isActive = activeTab === tab.value;
            const shouldKeepMounted = isActive || tab.value === "bullet-editor" || tab.value === "speed-editor" || tab.value === "depiction-editor" || Boolean(unsavedTabMap[tab.value]);
            if (!shouldKeepMounted) {
              return null;
            }
            return (
              <div
                key={tab.value}
                role="tabpanel"
                id={`mainview-panel-${tab.value}`}
                aria-labelledby={`mainview-tab-${tab.value}`}
                className={cn(
                  "flex min-h-0 flex-col",
                  isActive
                    ? "relative z-10 flex-1"
                    : "pointer-events-none invisible absolute inset-0 z-0 overflow-hidden",
                  isActive
                    ? "h-full w-full flex-1 overflow-auto px-4 pt-4"
                    : "px-4 pt-4",
                )}
                aria-hidden={!isActive}
                {...(!isActive ? { inert: true } : {})}
              >
                {renderTabPanel(tab)}
              </div>
            );
          })}
        </div>
      </Tabs>
    </div>
  );
};

export default MainView;
