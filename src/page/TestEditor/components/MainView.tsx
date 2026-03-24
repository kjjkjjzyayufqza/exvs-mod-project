import { useCallback, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import RepackFolderStructureView from "./RepackFolderStructureView";
import CharacterIdTableView from "./CharacterIdTableView";
import CharacterListView from "./CharacterListView";
import SeriesListView from "./SeriesListView";
import CardIconListView from "./CardIconListView";
import StageIconListView from "./StageIconListView";
import StageListView from "./StageListView";
import { SsbhModelPreviewViewport } from "./ssbh-model-preview/SsbhModelPreviewPanel";

type StageTab = {
  name: string;
  value: string;
  content?: React.ReactNode;
  render?: (props: MainViewProps) => React.ReactNode;
};

interface MainViewProps {
  jsonFilePath?: string | null;
  folderPath?: string | null;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  onRevealTreeFolder?: (path: string) => void;
}

const tabs: StageTab[] = [
  {
    name: "3D View",
    value: "3d",
    render: () => <SsbhModelPreviewViewport />,
  },
  {
    name: "Preview",
    value: "preview",
    content: (
      <div className="text-sm text-muted-foreground space-y-2 max-w-lg">
        <p>
          SSBH model preview lives in the <span className="font-medium text-foreground">3D View</span> tab: Rust loads
          <code className="mx-1 rounded bg-muted px-1">numdlb</code> /
          <code className="mx-1 rounded bg-muted px-1">numshb</code> /
          <code className="mx-1 rounded bg-muted px-1">nusktb</code> /
          <code className="mx-1 rounded bg-muted px-1">numatb</code> via{" "}
          <code className="rounded bg-muted px-1">ssbh_data</code>, returns JSON, then the viewport renders with React
          Three Fiber.
        </p>
        <p>
          Open a model folder (or a <code className="rounded bg-muted px-1">.numdlb</code> file), then use the right{" "}
          <span className="font-medium text-foreground">Model Preview</span> tab (mesh list, lighting, grid) while you
          orbit in <span className="font-medium text-foreground">3D View</span>.
        </p>
      </div>
    ),
  },
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
];

const MainView = ({
  jsonFilePath,
  folderPath,
  onUnsavedChanges,
  onRevealTreeFolder,
}: MainViewProps) => {
  const initialTab = tabs[0]?.value ?? "3d";
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set([initialTab]));
  const [folderStructureHasUnsaved, setFolderStructureHasUnsaved] = useState(false);
  const [characterIdTableHasUnsaved, setCharacterIdTableHasUnsaved] = useState(false);
  const [characterListHasUnsaved, setCharacterListHasUnsaved] = useState(false);
  const [seriesListHasUnsaved, setSeriesListHasUnsaved] = useState(false);
  const [stageListHasUnsaved, setStageListHasUnsaved] = useState(false);
  const [stageIconListHasUnsaved, setStageIconListHasUnsaved] = useState(false);

  const handleUnsavedChanges = useCallback((hasChanges: boolean) => {
    setFolderStructureHasUnsaved(hasChanges);
    onUnsavedChanges?.(hasChanges);
  }, [onUnsavedChanges]);

  const handleCharacterIdTableUnsaved = useCallback((hasChanges: boolean) => {
    setCharacterIdTableHasUnsaved(hasChanges);
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

      return tab;
    });
  }, [activeTab, handleCharacterIdTableUnsaved, handleCharacterListUnsaved, handleSeriesListUnsaved, handleStageIconListUnsaved, handleStageListUnsaved, handleUnsavedChanges]);

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
    const props: MainViewProps = { jsonFilePath, folderPath, onUnsavedChanges, onRevealTreeFolder };
    if (tab.render) return tab.render(props);
    return tab.content ?? null;
  };

  return (
    <div className="flex h-full w-full min-h-0 bg-background">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex h-full w-full min-h-0 flex-col rounded-none p-0 m-0">
        <TabsList className="w-full shrink-0 justify-start rounded-none h-10 flex items-center bg-muted/50 px-2 border-b">
          {resolvedTabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              id={`mainview-tab-${tab.value}`}
              value={tab.value}
              className="rounded-md px-4 py-1.5 text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
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
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="relative flex min-h-0 flex-1 flex-col">
          {resolvedTabs.map((tab) => {
            if (!visitedTabs.has(tab.value)) return null;
            const isActive = activeTab === tab.value;
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
                  tab.value === "3d"
                    ? isActive
                      ? "m-0 flex h-full w-full flex-1 flex-col overflow-hidden p-0"
                      : "p-0"
                    : isActive
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

