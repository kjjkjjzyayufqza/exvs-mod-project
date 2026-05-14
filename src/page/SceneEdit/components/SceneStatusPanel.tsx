import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Info, Layers, Settings, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { StageTreeNode } from "./StageHierarchyTree";
import type { PlacementRow } from "./PlacementPanel";
import type { SceneDrawStats } from "./SceneViewportOverlay";

const TAB_ITEMS = [
  { name: "Info", value: "info", icon: Info },
  { name: "Stats", value: "stats", icon: Layers },
  { name: "Files", value: "files", icon: FileText },
] as const;

type TabValue = (typeof TAB_ITEMS)[number]["value"];

interface SceneStatusPanelProps {
  stageName: string | null;
  stageRoot: string | null;
  selectedNode: StageTreeNode | null;
  selectedPlacementIdx: number | null;
  placementEntry: PlacementRow | null;
  drawStats: SceneDrawStats | null;
  subModelCount: number;
  textureCount: number;
}

const TAB_STRIP_SCROLL_EPSILON_px = 2;

export function SceneStatusPanel({
  stageName,
  stageRoot,
  selectedNode,
  selectedPlacementIdx,
  placementEntry,
  drawStats,
  subModelCount,
  textureCount,
}: SceneStatusPanelProps) {
  const [activeTab, setActiveTab] = useState<TabValue>("info");
  const tabStripRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const syncTabStripScrollEdges = useCallback(() => {
    const el = tabStripRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > TAB_STRIP_SCROLL_EPSILON_px);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - TAB_STRIP_SCROLL_EPSILON_px);
  }, []);

  const scrollTabStrip = (direction: -1 | 1) => {
    const el = tabStripRef.current;
    if (!el) return;
    const delta = Math.max(80, Math.round(el.clientWidth * 0.45));
    el.scrollBy({ left: direction * delta, behavior: "smooth" });
  };

  useEffect(() => {
    const el = tabStripRef.current;
    if (!el) return;
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
  }, [syncTabStripScrollEdges]);

  const renderInfoContent = () => {
    if (!stageName) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Info className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm">No stage loaded</p>
          <p className="text-xs mt-1 opacity-60">Open a stage folder to see details</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {/* Stage Overview */}
        <div className="rounded-lg border bg-muted/20 p-3 hover:bg-muted/30 transition-colors">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-2.5 flex items-center gap-1.5">
            <div className="w-1 h-3 bg-primary/40 rounded-full" />
            Stage Overview
          </h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between group">
              <span className="text-muted-foreground text-xs group-hover:text-foreground transition-colors">Name</span>
              <span className="truncate text-xs font-mono font-medium max-w-[60%] bg-background/50 px-1.5 py-0.5 rounded border border-transparent group-hover:border-border transition-all" title={stageName}>
                {stageName}
              </span>
            </div>
            <div className="flex items-center justify-between group">
              <span className="text-muted-foreground text-xs group-hover:text-foreground transition-colors">Path</span>
              <span className="truncate text-[10px] text-muted-foreground/80 max-w-[60%] font-mono" title={stageRoot ?? ""}>
                {stageRoot ? stageRoot.split(/[/\\]/).slice(-3).join("/") : "-"}
              </span>
            </div>
            <div className="flex items-center justify-between group">
              <span className="text-muted-foreground text-xs group-hover:text-foreground transition-colors">Objects</span>
              <span className="text-xs font-mono font-bold text-primary/80">{subModelCount}</span>
            </div>
            <div className="flex items-center justify-between group">
              <span className="text-muted-foreground text-xs group-hover:text-foreground transition-colors">Textures</span>
              <span className="text-xs font-mono font-bold text-purple-400/80">{textureCount}</span>
            </div>
          </div>
        </div>

        {/* Selected Node */}
        {selectedNode && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 hover:bg-primary/10 transition-colors animate-in zoom-in-95 duration-200">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary/70 mb-2.5 flex items-center gap-1.5">
              <div className="w-1 h-3 bg-primary rounded-full" />
              Selected Node
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between group">
                <span className="text-muted-foreground text-xs group-hover:text-foreground transition-colors">Name</span>
                <span className="truncate text-xs font-mono font-medium max-w-[60%] text-primary" title={selectedNode.label}>
                  {selectedNode.label}
                </span>
              </div>
              <div className="flex items-center justify-between group">
                <span className="text-muted-foreground text-xs group-hover:text-foreground transition-colors">Type</span>
                <span className="text-[9px] font-bold uppercase bg-primary/20 text-primary px-1.5 py-0.5 rounded border border-primary/10 tracking-tighter">{selectedNode.role}</span>
              </div>
              {selectedNode.objectIndex !== undefined && (
                <div className="flex items-center justify-between group">
                  <span className="text-muted-foreground text-xs group-hover:text-foreground transition-colors">Object #</span>
                  <span className="text-xs font-bold font-mono text-primary/90">{selectedNode.objectIndex}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Placement Info */}
        {placementEntry && (
          <div className="rounded-lg border bg-muted/20 p-3 hover:bg-muted/30 transition-colors">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-2.5 flex items-center gap-1.5">
              <div className="w-1 h-3 bg-amber-400/40 rounded-full" />
              Placement #{selectedPlacementIdx}
            </h4>
            <div className="grid grid-cols-1 gap-2.5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase">Position</span>
                  <div className="h-px flex-1 bg-border/40 mx-2" />
                </div>
                <div className="grid grid-cols-3 gap-1 font-mono text-[10px]">
                  <div className="bg-background/40 p-1 rounded border border-border/20 flex flex-col items-center">
                    <span className="text-[8px] text-muted-foreground/50">X</span>
                    <span className="text-blue-400/90">{placementEntry.posX.toFixed(2)}</span>
                  </div>
                  <div className="bg-background/40 p-1 rounded border border-border/20 flex flex-col items-center">
                    <span className="text-[8px] text-muted-foreground/50">Y</span>
                    <span className="text-emerald-400/90">{placementEntry.posY.toFixed(2)}</span>
                  </div>
                  <div className="bg-background/40 p-1 rounded border border-border/20 flex flex-col items-center">
                    <span className="text-[8px] text-muted-foreground/50">Z</span>
                    <span className="text-red-400/90">{placementEntry.posZ.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase">Rotation</span>
                  <div className="h-px flex-1 bg-border/40 mx-2" />
                </div>
                <div className="grid grid-cols-3 gap-1 font-mono text-[10px]">
                  <div className="bg-background/40 p-1 rounded border border-border/20 flex flex-col items-center">
                    <span className="text-[8px] text-muted-foreground/50">X</span>
                    <span>{placementEntry.rotX.toFixed(1)}°</span>
                  </div>
                  <div className="bg-background/40 p-1 rounded border border-border/20 flex flex-col items-center">
                    <span className="text-[8px] text-muted-foreground/50">Y</span>
                    <span>{placementEntry.rotY.toFixed(1)}°</span>
                  </div>
                  <div className="bg-background/40 p-1 rounded border border-border/20 flex flex-col items-center">
                    <span className="text-[8px] text-muted-foreground/50">Z</span>
                    <span>{placementEntry.rotZ.toFixed(1)}°</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderStatsContent = () => {
    if (!drawStats) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Layers className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm">No stats collected</p>
          <p className="text-xs mt-1 opacity-60 text-center px-4">
            Load a stage first. Enable the viewport toolbar Stats toggle for the Three.js Stats overlay (upper-right).
          </p>
        </div>
      );
    }

    const formatCount = (n: number): string => {
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
      return String(n);
    };

    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border bg-muted/20 p-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Rendering Stats (mesh)
          </h4>
          <p className="text-[10px] text-muted-foreground mb-2">
            GPU metrics: enable the viewport toolbar Stats button for Three.js Stats (upper-right).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between rounded bg-background/50 px-2 py-1.5">
              <span className="text-muted-foreground text-xs">Draw Calls</span>
              <span className="text-sm font-mono font-medium text-blue-400">{drawStats.drawCount}</span>
            </div>
            <div className="flex items-center justify-between rounded bg-background/50 px-2 py-1.5">
              <span className="text-muted-foreground text-xs">Triangles</span>
              <span className="text-sm font-mono font-medium text-emerald-400">{formatCount(drawStats.triangleCount)}</span>
            </div>
            <div className="flex items-center justify-between rounded bg-background/50 px-2 py-1.5">
              <span className="text-muted-foreground text-xs">Vertices</span>
              <span className="text-sm font-mono font-medium text-amber-400">{formatCount(drawStats.vertexCount)}</span>
            </div>
            <div className="flex items-center justify-between rounded bg-background/50 px-2 py-1.5">
              <span className="text-muted-foreground text-xs">Sub-models</span>
              <span className="text-sm font-mono font-medium text-purple-400">{drawStats.subModelCount}</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Scene Summary
          </h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Total Objects</span>
              <span className="text-xs font-medium">{subModelCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Loaded Textures</span>
              <span className="text-xs font-medium">{textureCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Stage</span>
              <span className="text-xs font-medium truncate max-w-[50%]" title={stageName ?? "-"}>
                {stageName ?? "-"}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderFilesContent = () => {
    if (!stageName) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <FileText className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm">No files loaded</p>
          <p className="text-xs mt-1 opacity-60">Open a stage folder to see file details</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border bg-muted/20 p-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            File Structure
          </h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Base Model</span>
              <span className="text-[10px] text-muted-foreground">stage/base.numdlb</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Placement CSV</span>
              <span className="text-[10px] text-muted-foreground">stage/info/placement.csv</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Graphic Params</span>
              <span className="text-[10px] text-muted-foreground">stage/info/graphic_param.csv</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Sub-models ({subModelCount})
          </h4>
          <div className="text-[10px] text-muted-foreground">
            Each object has its own folder with numdlb, nusktb, and nutexb files
          </div>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case "info":
        return renderInfoContent();
      case "stats":
        return renderStatsContent();
      case "files":
        return renderFilesContent();
    }
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case "info":
        return "Scene Info";
      case "stats":
        return "Rendering Stats";
      case "files":
        return "File Structure";
    }
  };

  const getTabDescription = () => {
    switch (activeTab) {
      case "info":
        return "Stage overview, selected node details, and placement information";
      case "stats":
        return "Real-time rendering metrics and scene statistics";
      case "files":
        return "Stage file structure and asset locations";
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="flex h-full flex-col rounded-none">
        {/* Scrollable Tab Strip */}
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
            className="min-h-8 min-w-0 flex-1 overflow-x-auto scroll-smooth scrollbar-none"
          >
            <TabsList className="inline-flex h-8 min-w-min flex-nowrap items-center justify-start gap-1 border-0 bg-transparent p-0 shadow-none">
              {TAB_ITEMS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="h-8 shrink-0 rounded-md px-2.5 text-[11px] font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm flex items-center gap-1.5"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {tab.name}
                  </TabsTrigger>
                );
              })}
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

        {/* Card Content */}
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0 shadow-none">
          <CardHeader className="shrink-0 space-y-1 border-b bg-muted/10 py-3">
            <CardTitle className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
              {activeTab === "info" && <Info className="h-3.5 w-3.5" />}
              {activeTab === "stats" && <Layers className="h-3.5 w-3.5" />}
              {activeTab === "files" && <FileText className="h-3.5 w-3.5" />}
              {getTabTitle()}
            </CardTitle>
            <CardDescription className="text-[10px] italic">
              {getTabDescription()}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-3 text-sm">
            {renderContent()}
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
