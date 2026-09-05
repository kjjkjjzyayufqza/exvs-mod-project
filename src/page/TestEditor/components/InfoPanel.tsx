import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TestTreeNode } from "../types";
import { ImagePreview, isImageFile } from "./ImagePreview";
import { NutexbPreview } from "./NutexbPreview";
import { JnttblFileEditorPanel } from "@/components/ssbh-model-preview/JnttblFileEditorPanel";
import { NumdlbFileEditorPanel } from "@/components/ssbh-model-preview/NumdlbFileEditorPanel";
import { useBulletEditorStore } from "./param-editors/bullet-editor/BulletEditorStore";
import { BULLET_GROUPS, buildBulletComputedSections } from "./param-editors/bullet-editor/BulletPropertyPanel";
import { ScenarioPanel } from "./param-editors/bullet-editor/ScenarioPanel";
import { ShootingLoopPanel } from "./param-editors/bullet-editor/ShootingLoopPanel";
import { BulletDpsPanel } from "./param-editors/bullet-editor/BulletDpsPanel";
import { PropertyField } from "./param-editors/shared/PropertyField";
import { MayaSection } from "@/components/ssbh-model-preview/MayaInspectorSection";
import { formatHash } from "@/models/commandTable";
import { Crosshair, Info, Repeat, SlidersHorizontal, Swords } from "lucide-react";

const BASE_TAB_ITEMS = [
  { name: "Info", value: "info" },
  { name: "Bullet Info", value: "bulletInfo" },
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

function infoTabNameKey(value: TabValue): string {
  if (value === "bulletInfo") return "info.tabBulletInfo";
  if (value === "numdlbMapping") return "info.tabNumdlbMapping";
  if (value === "jnttblMapping") return "info.tabJnttTable";
  return "info.tabInfo";
}

function infoTabTitleKey(value: TabValue): string {
  if (value === "bulletInfo") return "info.titleBulletInfo";
  if (value === "numdlbMapping") return "info.titleNumdlbMapping";
  if (value === "jnttblMapping") return "info.titleJnttTable";
  return "info.titleFileInfo";
}

function infoTabDescriptionKey(value: TabValue): string {
  if (value === "bulletInfo") return "info.descBulletInfo";
  if (value === "numdlbMapping") return "info.descNumdlbMapping";
  if (value === "jnttblMapping") return "info.descJnttTable";
  return "info.descFileInfo";
}

function BulletInfoTabContent() {
  const { t } = useTranslation("test-workspace");
  const data = useBulletEditorStore((s) => s.data);
  const selectedIndex = useBulletEditorStore((s) => s.selectedIndex);
  const trajectory = useBulletEditorStore((s) => s.trajectory);
  const shootingLoopResult = useBulletEditorStore((s) => s.shootingLoopResult);
  const entry = data?.entries[selectedIndex] ?? null;

  if (!entry) {
    return <p className="text-muted-foreground">{t("info.noBullet")}</p>;
  }

  const entryId = typeof entry.entryId === "number" ? (entry.entryId as number) : 0;
  const computedSections = buildBulletComputedSections(entry);
  const onFieldChange = (key: string, value: number) =>
    useBulletEditorStore.getState().updateField(key, value);
  const visibleGroups = BULLET_GROUPS.filter((g) => !g.visible || g.visible(entry));

  return (
    <div className="-mx-4 flex min-w-0 flex-col border-t bg-background/50">
      <div className="flex items-center justify-between border-b border-muted bg-muted/20 px-3 py-1.5">
        <span className="text-[10px] text-muted-foreground" data-i18n-ignore="">
          {t("info.entryId")}
        </span>
        <span className="font-mono text-[11px]">{formatHash(entryId)}</span>
      </div>

      {computedSections.map((section) => (
        <MayaSection key={section.label} title={section.label} icon={<Info className="h-3.5 w-3.5" />}>
          <div className="flex flex-col gap-1.5" data-i18n-ignore="">
            {section.values.map((cv) => (
              <div key={cv.label} className="flex items-center justify-between gap-2" title={cv.tooltip}>
                <span className="min-w-0 shrink-0 text-[11px] text-muted-foreground">
                  {cv.label}
                  {cv.unit && <span className="ml-1 text-[9px] text-muted-foreground/60">({cv.unit})</span>}
                </span>
                <span
                  className="font-mono text-[11px] font-medium"
                  style={cv.color ? { color: cv.color } : undefined}
                >
                  {typeof cv.value === "number"
                    ? Number.isInteger(cv.value) ? cv.value : cv.value.toFixed(4)
                    : cv.value}
                </span>
              </div>
            ))}
          </div>
        </MayaSection>
      ))}

      {visibleGroups.map((group) => (
        <MayaSection key={group.id} title={group.label} icon={<SlidersHorizontal className="h-3.5 w-3.5" />}>
          <div className="flex flex-col gap-1.5" data-i18n-ignore="">
            {group.fields.map((def) => (
              <PropertyField
                key={def.key}
                def={def}
                value={entry[def.key] ?? 0}
                onChange={(key, value) => {
                  if (typeof value === "number") {
                    onFieldChange(key, value);
                  }
                }}
              />
            ))}
          </div>
        </MayaSection>
      ))}

      <MayaSection title={t("info.targetScenario")} icon={<Crosshair className="h-3.5 w-3.5" />}>
        <div className="-mx-1">
          <ScenarioPanel />
        </div>
      </MayaSection>
      <MayaSection title={t("info.shootingLoop")} icon={<Repeat className="h-3.5 w-3.5" />}>
        <div className="[&>div]:border-0 [&>div]:p-0 [&>div]:shadow-none">
          <ShootingLoopPanel result={shootingLoopResult} />
        </div>
      </MayaSection>
      <MayaSection title={t("info.combatStats")} icon={<Swords className="h-3.5 w-3.5" />}>
        <div className="[&>div]:border-0 [&>div]:p-0 [&>div]:shadow-none">
          <BulletDpsPanel entry={entry} trajectory={trajectory} />
        </div>
      </MayaSection>
    </div>
  );
}

const TAB_STRIP_SCROLL_EPSILON_px = 2;

const InfoPanel = ({ selected }: InfoPanelProps) => {
  const { t } = useTranslation("test-workspace");
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
      return <p className="text-muted-foreground">{t("info.selectNode")}</p>;
    }

    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t("info.name")}</span>
          <span className="truncate" title={selected.name} data-i18n-ignore="">
            {selected.name}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t("info.type")}</span>
          <span className="uppercase">{selected.isDir ? t("info.folder") : t("info.file")}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">{t("info.path")}</span>
          <span className="wrap-break-word text-xs" title={selected.path} data-i18n-ignore="">
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
      case "numdlbMapping":
        return <NumdlbFileEditorPanel selected={selected} />;
      case "jnttblMapping":
        return <JnttblFileEditorPanel selected={selected} />;
      case "bulletInfo":
        return <BulletInfoTabContent />;
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
            aria-label={t("info.scrollLeft")}
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
                  {t(infoTabNameKey(tab.value))}
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
            aria-label={t("info.scrollRight")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0 shadow-none">
          <CardHeader className="shrink-0 space-y-1 border-b bg-muted/10 py-3">
            <CardTitle className="text-xs font-bold uppercase tracking-widest">
              {t(infoTabTitleKey(activeTab))}
            </CardTitle>
            <CardDescription className="text-[10px] italic">
              {t(infoTabDescriptionKey(activeTab))}
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
