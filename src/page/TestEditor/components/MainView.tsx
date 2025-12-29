import { useCallback, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RepackFolderStructureView from "./RepackFolderStructureView";

type StageTab = {
  name: string;
  value: string;
  content?: React.ReactNode;
  render?: (props: MainViewProps) => React.ReactNode;
};

interface MainViewProps {
  jsonFilePath?: string | null;
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
];

const MainView = ({ jsonFilePath, onUnsavedChanges }: MainViewProps) => {
  const [activeTab, setActiveTab] = useState<string>(tabs[0]?.value ?? "3d");
  const [folderStructureHasUnsaved, setFolderStructureHasUnsaved] = useState(false);

  const handleUnsavedChanges = useCallback((hasChanges: boolean) => {
    setFolderStructureHasUnsaved(hasChanges);
    onUnsavedChanges?.(hasChanges);
  }, [onUnsavedChanges]);

  const resolvedTabs = useMemo<StageTab[]>(() => {
    return tabs.map((tab) => {
      if (tab.value !== "folder-structure") return tab;
      return {
        ...tab,
        render: (props: MainViewProps) => (
          <RepackFolderStructureView
            jsonFilePath={props.jsonFilePath}
            onUnsavedChanges={handleUnsavedChanges}
          />
        ),
      };
    });
  }, [handleUnsavedChanges]);

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
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {resolvedTabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="flex-1 h-full w-full p-0 m-0">
            {tab.value === "folder-structure" ? (
              <div className="h-full w-full p-0 m-0">
                {tab.render ? tab.render({ jsonFilePath, onUnsavedChanges }) : tab.content}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
                {tab.render ? tab.render({ jsonFilePath, onUnsavedChanges }) : tab.content}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default MainView;

