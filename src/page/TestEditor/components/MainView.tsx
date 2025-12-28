import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type StageTab = {
  name: string;
  value: string;
  content?: React.ReactNode;
  render?: () => React.ReactNode;
};

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
];

const MainView = () => {
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
          <TabsContent key={tab.value} value={tab.value} className="flex-1 w-full h-full">
            <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
              {tab.render ? tab.render() : tab.content}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default MainView;

