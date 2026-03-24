import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TestTreeNode } from "../types";
import { ImagePreview, isImageFile } from "./ImagePreview";
import { NutexbPreview } from "./NutexbPreview";
import { SsbhModelPreviewInspector } from "./ssbh-model-preview/SsbhModelPreviewPanel";

const TAB_ITEMS = [
  { name: "Info", value: "info" },
  { name: "Model Preview", value: "modelPreview" },
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
      return <p className="text-muted-foreground">Select a node in the tree to see file details.</p>;
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
          <span className="wrap-break-word text-xs" title={selected.path}>
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
        return <div className="space-y-2">{renderInfoContent()}</div>;
      case "modelPreview":
        return <SsbhModelPreviewInspector />;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="flex h-full flex-col rounded-none">
        <TabsList className="flex h-10 w-full shrink-0 items-center justify-start gap-1 overflow-x-auto border-b bg-muted/30 px-2 py-1">
          {TAB_ITEMS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="h-8 shrink-0 rounded-md px-3 text-[11px] font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              {tab.name}
            </TabsTrigger>
          ))}
        </TabsList>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0 shadow-none">
          <CardHeader className="shrink-0 space-y-1 border-b bg-muted/10 py-3">
            <CardTitle className="text-xs font-bold uppercase tracking-widest">
              {activeTab === "info" ? "File info" : "Viewport inspector"}
            </CardTitle>
            <CardDescription className="text-[10px] italic">
              {activeTab === "info"
                ? "Selection, path, and texture previews"
                : "Display, lighting, meshes, and scene stats for the 3D view"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-4 text-sm">
            <div className="space-y-2">{renderContent()}</div>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
};

export default InfoPanel;
