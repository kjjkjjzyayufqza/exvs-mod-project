import { useCallback, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RepackFolderStructureView from "./RepackFolderStructureView";
import CharacterIdTableView from "./CharacterIdTableView";

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
];

const MainView = ({ jsonFilePath, folderPath, onUnsavedChanges }: MainViewProps) => {
  const [activeTab, setActiveTab] = useState<string>(tabs[0]?.value ?? "3d");
  const [folderStructureHasUnsaved, setFolderStructureHasUnsaved] = useState(false);
  const [characterIdTableHasUnsaved, setCharacterIdTableHasUnsaved] = useState(false);

  const handleUnsavedChanges = useCallback((hasChanges: boolean) => {
    setFolderStructureHasUnsaved(hasChanges);
    onUnsavedChanges?.(hasChanges);
  }, [onUnsavedChanges]);

  const handleCharacterIdTableUnsaved = useCallback((hasChanges: boolean) => {
    setCharacterIdTableHasUnsaved(hasChanges);
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
            />
          ),
        };
      }

      return tab;
    });
  }, [activeTab, handleCharacterIdTableUnsaved, handleUnsavedChanges]);

  return (
    <div className="flex h-full w-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full w-full flex-col rounded-none p-0 m-0">
        <TabsList className="w-full justify-start rounded-none h-[2.5em] flex items-start">
          {resolvedTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}
              className="rounded-none relative ">
              <span className="inline-flex items-center gap-2">
                <span>{tab.name}</span>
                {tab.value === "folder-structure" && folderStructureHasUnsaved && (
                  <span
                    className="h-2 w-2 rounded-full bg-yellow-500"
                    aria-label="Unsaved changes"
                    title="Unsaved changes"
                  />
                )}
                {tab.value === "character-id-table" && characterIdTableHasUnsaved && (
                  <span
                    className="h-2 w-2 rounded-full bg-yellow-500"
                    aria-label="Unsaved changes"
                    title="Unsaved changes"
                  />
                )}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {resolvedTabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="flex-1 h-full w-full p-0 m-0">
            {tab.value === "folder-structure" || tab.value === "character-id-table" ? (
              <div className="h-full w-full p-0 m-0">
                {tab.render ? tab.render({ jsonFilePath, folderPath, onUnsavedChanges }) : tab.content}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
                {tab.render ? tab.render({ jsonFilePath, folderPath, onUnsavedChanges }) : tab.content}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default MainView;

