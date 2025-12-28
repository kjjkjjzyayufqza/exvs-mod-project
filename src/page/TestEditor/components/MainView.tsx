import { useMemo, useState } from "react";
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

  return (
    <div className="flex h-full w-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full w-full flex-col rounded-none">
        <TabsList className="w-full justify-start">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.name}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="flex-1 h-full w-full">
            {tab.value === "folder-structure" ? (
              <div className="h-full w-full p-2">
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

