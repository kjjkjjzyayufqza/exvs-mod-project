import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TestTreeNode } from "../types";

type InfoTab = {
  name: string;
  value: string;
  content?: React.ReactNode;
  render?: (selected?: TestTreeNode | null) => React.ReactNode;
};

const tabs: InfoTab[] = [
  {
    name: "Info",
    value: "info",
    render: (selected) =>
      selected ? (
        <>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="truncate" title={selected.name}>
              {selected.name}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Type</span>
            <span className="uppercase">{selected.isDir ? "Folder" : "File"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">Path</span>
            <span className="truncate text-xs" title={selected.path}>
              {selected.path}
            </span>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">Select a node to see details</p>
      ),
  },
  {
    name: "Explore",
    value: "explore",
    content: (
      <>
        Discover <span className="text-foreground font-semibold">fresh ideas</span>, trending topics, and hidden gems
        curated just for you. Start exploring and let your curiosity lead the way!
      </>
    ),
  },
  {
    name: "Favorites",
    value: "favorites",
    content: (
      <>
        All your <span className="text-foreground font-semibold">favorites</span> are saved here. Revisit articles,
        collections, and moments you love, any time you want a little inspiration.
      </>
    ),
  },
  {
    name: "Surprise Me",
    value: "surprise",
    content: (
      <>
        <span className="text-foreground font-semibold">Surprise!</span> Here&apos;s something unexpected—a fun fact, a
        quirky tip, or a daily challenge. Come back for a new surprise every day!
      </>
    ),
  },
];

type InfoPanelProps = {
  selected?: TestTreeNode | null;
};

const InfoPanel = ({ selected }: InfoPanelProps) => {
  const [activeTab, setActiveTab] = useState<string>(tabs[0]?.value ?? "info");

  const activeContent = useMemo(() => {
    const tab = tabs.find((item) => item.value === activeTab);
    if (!tab) return null;
    if (tab.render) return tab.render(selected);
    return tab.content ?? null;
  }, [activeTab, selected]);

  return (
    <div className="flex h-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full rounded-none">
        <TabsList className="rounded-none flex h-full w-[2em] flex-col items-start justify-start overflow-visible">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="rounded-none w-full shrink-0 items-center justify-center px-2 py-3 whitespace-nowrap"
              style={{ writingMode: "sideways-lr", textOrientation: "mixed" }}
            >
              {tab.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card className="h-full flex-1 rounded-none">
        <CardHeader>
          <CardTitle>Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">{activeContent}</CardContent>
      </Card>
    </div>
  );
};

export default InfoPanel;

