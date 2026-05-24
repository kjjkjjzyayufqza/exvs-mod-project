import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type ScenePropertiesTab = "inspect" | "graphic" | "placement";

const TAB_ITEMS: Array<{
  value: ScenePropertiesTab;
  name: string;
  title: string;
  description: string;
}> = [
  {
    value: "inspect",
    name: "Inspect",
    title: "Scene inspector",
    description: "Transform, textures, asset config, and viewport stats",
  },
  {
    value: "graphic",
    name: "Graphic",
    title: "Graphic params",
    description: "Stage graphic_param keys and preview toggles",
  },
  {
    value: "placement",
    name: "Placement",
    title: "Placement table",
    description: "CSV placement rows, fields, and object spawn config",
  },
];

const TAB_STRIP_SCROLL_EPSILON_PX = 2;

interface ScenePropertiesPanelProps {
  headerActions?: ReactNode;
  inspectContent: ReactNode;
  graphicContent: ReactNode;
  placementContent: ReactNode;
}

export function ScenePropertiesPanel({
  headerActions,
  inspectContent,
  graphicContent,
  placementContent,
}: ScenePropertiesPanelProps) {
  const [activeTab, setActiveTab] = useState<ScenePropertiesTab>("inspect");
  const tabStripRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const activeMeta = TAB_ITEMS.find((tab) => tab.value === activeTab) ?? TAB_ITEMS[0];

  const syncTabStripScrollEdges = useCallback(() => {
    const el = tabStripRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > TAB_STRIP_SCROLL_EPSILON_PX);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - TAB_STRIP_SCROLL_EPSILON_PX);
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

  const tabContent: Record<ScenePropertiesTab, ReactNode> = {
    inspect: inspectContent,
    graphic: graphicContent,
    placement: placementContent,
  };

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden border-l">
      <div className="flex shrink-0 items-center border-b bg-muted/20 px-3 py-1 select-none whitespace-nowrap">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Properties
        </span>
        {headerActions ? <span className="ml-auto">{headerActions}</span> : null}
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as ScenePropertiesTab)}
        className="flex min-h-0 flex-1 flex-col rounded-none"
      >
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
              {TAB_ITEMS.map((tab) => (
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
              {activeMeta.title}
            </CardTitle>
            <CardDescription className="text-[10px] italic">{activeMeta.description}</CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto p-0 text-sm">
            {TAB_ITEMS.map((tab) => (
              <TabsContent
                key={tab.value}
                value={tab.value}
                className="m-0 min-w-0 overflow-x-hidden pb-3 focus-visible:outline-none"
              >
                <div className="min-w-0 w-full">{tabContent[tab.value]}</div>
              </TabsContent>
            ))}
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
