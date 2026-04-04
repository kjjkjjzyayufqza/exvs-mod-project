import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TestTreeNode } from "../types";
import { ImagePreview, isImageFile } from "./ImagePreview";
import { NutexbPreview } from "./NutexbPreview";
import { SsbhDaeExchangePanel } from "./ssbh-model-preview/SsbhDaeExchangePanel";
import { SsbhModelPreviewInspector } from "./ssbh-model-preview/SsbhModelPreviewPanel";
import { SsbhModelPreviewMotionPanel } from "./ssbh-model-preview/SsbhModelPreviewMotionPanel";
import { JnttblFileEditorPanel } from "./ssbh-model-preview/JnttblFileEditorPanel";
import { NumdlbFileEditorPanel } from "./ssbh-model-preview/NumdlbFileEditorPanel";

const BASE_TAB_ITEMS = [
  { name: "Info", value: "info" },
  { name: "Model Preview", value: "modelPreview" },
  { name: "Motion", value: "motion" },
  { name: "COLLADA (.dae)", value: "daeExchange" },
] as const;
const NUMDLB_TAB_ITEM = { name: "NUMDLB Mapping", value: "numdlbMapping" } as const;
const JNTT_TAB_ITEM = { name: "JNTT Table", value: "jnttblMapping" } as const;

type TabValue =
  | (typeof BASE_TAB_ITEMS)[number]["value"]
  | typeof NUMDLB_TAB_ITEM.value
  | typeof JNTT_TAB_ITEM.value;

type InfoPanelProps = {
  selected?: TestTreeNode | null;
};

const TAB_STRIP_SCROLL_EPSILON_px = 2;

const InfoPanel = ({ selected }: InfoPanelProps) => {
  const [activeTab, setActiveTab] = useState<TabValue>("info");
  const tabStripRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const isNutexb =
    !selected?.isDir && selected?.name.toLowerCase().endsWith(".nutexb");
  const isImage =
    !selected?.isDir && selected?.name && isImageFile(selected.name);
  const isNumdlb = !selected?.isDir && selected?.name?.toLowerCase().endsWith(".numdlb");
  const isJnttbl = !selected?.isDir && selected?.name?.toLowerCase().endsWith(".jnttbl");
  const tabItems = [
    ...BASE_TAB_ITEMS,
    ...(isNumdlb ? [NUMDLB_TAB_ITEM] : []),
    ...(isJnttbl ? [JNTT_TAB_ITEM] : []),
  ];

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
      throw new Error("InfoPanel: tab strip scroll container is not mounted");
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

  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => syncTabStripScrollEdges());
    return () => cancelAnimationFrame(id);
  }, [isNumdlb, isJnttbl, syncTabStripScrollEdges]);

  useEffect(() => {
    if (!isNumdlb && activeTab === "numdlbMapping") {
      setActiveTab("info");
    }
  }, [activeTab, isNumdlb]);

  useEffect(() => {
    if (!isJnttbl && activeTab === "jnttblMapping") {
      setActiveTab("info");
    }
  }, [activeTab, isJnttbl]);

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
      case "motion":
        return <SsbhModelPreviewMotionPanel />;
      case "daeExchange":
        return <SsbhDaeExchangePanel />;
      case "numdlbMapping":
        return <NumdlbFileEditorPanel selected={selected} />;
      case "jnttblMapping":
        return <JnttblFileEditorPanel selected={selected} />;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="flex h-full flex-col rounded-none">
        <div className="flex min-h-10 w-full shrink-0 items-stretch gap-1 border-b bg-muted/30 px-1 py-1">
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
              {tabItems.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="h-8 shrink-0 rounded-md px-2.5 text-[11px] font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  {tab.name}
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

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0 shadow-none">
          <CardHeader className="shrink-0 space-y-1 border-b bg-muted/10 py-3">
            <CardTitle className="text-xs font-bold uppercase tracking-widest">
              {activeTab === "info"
                ? "File info"
                : activeTab === "modelPreview"
                  ? "Viewport inspector"
                  : activeTab === "motion"
                    ? "Motion (NUANMB)"
                    : activeTab === "daeExchange"
                    ? "COLLADA exchange"
                    : activeTab === "numdlbMapping"
                      ? "NUMDLB mapping"
                      : "JNTT joint table"}
            </CardTitle>
            <CardDescription className="text-[10px] italic">
              {activeTab === "info"
                ? "Selection, path, and texture previews"
                : activeTab === "modelPreview"
                  ? "Display, lighting, meshes, and scene stats for the 3D view"
                  : activeTab === "motion"
                    ? "Load motion files and inspect clip metadata for the 3D view"
                    : activeTab === "daeExchange"
                    ? "Export SSBH to .dae and convert .dae to SSBH (separate from scene preview)"
                    : activeTab === "numdlbMapping"
                      ? "Edit mesh object to material label mapping for the selected .numdlb"
                      : "Edit hash to bone index pairs for the selected .jnttbl"}
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
