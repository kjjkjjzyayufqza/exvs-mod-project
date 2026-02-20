import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TestTreeNode } from "../types";
import { ImagePreview, isImageFile } from "./ImagePreview";
import { NutexbPreview } from "./NutexbPreview";

const TAB_ITEMS = [
  { name: "Info", value: "info" },
  { name: "Explore", value: "explore" },
  { name: "Favorites", value: "favorites" },
  { name: "Surprise Me", value: "surprise" },
] as const;

type TabValue = (typeof TAB_ITEMS)[number]["value"];

type InfoPanelProps = {
  selected?: TestTreeNode | null;
};

const InfoPanel = ({ selected }: InfoPanelProps) => {
  const [activeTab, setActiveTab] = useState<TabValue>("info");

  const isNutexb =
    !selected?.isDir && selected?.name.toLowerCase().endsWith(".nutexb");
  const isImage =
    !selected?.isDir && selected?.name && isImageFile(selected.name);

  const renderInfoContent = () => {
    if (!selected) {
      return (
        <p className="text-muted-foreground">Select a node to see details</p>
      );
    }

    return (
      <div className="flex flex-col gap-2">
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
          <span className="break-all text-xs" title={selected.path}>
            {selected.path}
          </span>
        </div>
        {isNutexb && (
          <div className="border-t pt-3">
            <NutexbPreview path={selected.path} />
          </div>
        )}
        {isImage && !isNutexb && (
          <div className="border-t pt-3">
            <ImagePreview path={selected.path} />
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case "info":
        return renderInfoContent();
      case "explore":
        return (
          <>
            Discover{" "}
            <span className="text-foreground font-semibold">fresh ideas</span>,
            trending topics, and hidden gems curated just for you. Start
            exploring and let your curiosity lead the way!
          </>
        );
      case "favorites":
        return (
          <>
            All your{" "}
            <span className="text-foreground font-semibold">favorites</span> are
            saved here. Revisit articles, collections, and moments you love, any
            time you want a little inspiration.
          </>
        );
      case "surprise":
        return (
          <>
            <span className="text-foreground font-semibold">Surprise!</span>{" "}
            Here&apos;s something unexpected—a fun fact, a quirky tip, or a
            daily challenge. Come back for a new surprise every day!
          </>
        );
    }
  };

  return (
    <div className="flex h-full">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabValue)}
        className="flex h-full rounded-none"
      >
        <TabsList className="rounded-none flex h-full w-[2em] flex-col items-start justify-start overflow-visible">
          {TAB_ITEMS.map((tab) => (
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

      <Card className="h-full flex-1 flex flex-col rounded-none overflow-hidden">
        <CardHeader className="shrink-0">
          <CardTitle>Info</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto space-y-2 text-sm">
          {renderContent()}
        </CardContent>
      </Card>
    </div>
  );
};

export default InfoPanel;
