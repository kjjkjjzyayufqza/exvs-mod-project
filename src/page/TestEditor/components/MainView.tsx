import { useCallback, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RepackFolderStructureView from "./RepackFolderStructureView";
import CharacterIdTableView from "./CharacterIdTableView";
import CharacterListView from "./CharacterListView";
import SeriesListView from "./SeriesListView";
import CardIconListView from "./CardIconListView";
import StageIconListView from "./StageIconListView";
import StageListView from "./StageListView";

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
    content: (
      <div>
        3D viewport placeholder
      </div>
    ),
  },
  {
    name: "Preview",
    value: "preview",
    content: (
      <div>
        Alternate view placeholder
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

const MainView = ({ jsonFilePath, folderPath, onUnsavedChanges, onRevealTreeFolder }: MainViewProps) => {
  const [activeTab, setActiveTab] = useState<string>(tabs[0]?.value ?? "3d");
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

  return (
    <div className="flex h-full w-full bg-background">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full w-full flex-col rounded-none p-0 m-0">
        <TabsList className="w-full justify-start rounded-none h-10 flex items-center bg-muted/50 px-2 border-b">
          {resolvedTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}
              className="rounded-md px-4 py-1.5 text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm">
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
        {resolvedTabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="flex-1 h-full w-full px-4 pt-4 m-0 overflow-auto">
            {tab.render ? tab.render({ jsonFilePath, folderPath, onUnsavedChanges, onRevealTreeFolder }) : tab.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default MainView;

