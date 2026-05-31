import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SsbhDaeExchangePanel } from "@/components/ssbh-model-preview/SsbhDaeExchangePanel";
import { SsbhModelPreviewInspector } from "@/components/ssbh-model-preview/SsbhModelPreviewPanel";
import { SsbhModelPreviewMotionPanel } from "@/components/ssbh-model-preview/SsbhModelPreviewMotionPanel";

const TAB_ITEMS = [
  { name: "Model Preview", value: "modelPreview" },
  { name: "Motion", value: "motion" },
  { name: "COLLADA (.dae)", value: "daeExchange" },
] as const;

type TabValue = (typeof TAB_ITEMS)[number]["value"];
const TAB_STRIP_SCROLL_EPSILON_px = 2;

export function UnitModelInspectorPanel() {
  const [activeTab, setActiveTab] = useState<TabValue>("modelPreview");
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
    if (!el) {
      throw new Error("UnitModelInspectorPanel: tab strip scroll container is not mounted");
    }
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
  }, [activeTab, syncTabStripScrollEdges]);

  const renderContent = () => {
    switch (activeTab) {
      case "modelPreview":
        return <SsbhModelPreviewInspector />;
      case "motion":
        return <SsbhModelPreviewMotionPanel />;
      case "daeExchange":
        return <SsbhDaeExchangePanel />;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
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

        <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
          <div className="space-y-2">{renderContent()}</div>
        </div>
      </Tabs>
    </div>
  );
}

