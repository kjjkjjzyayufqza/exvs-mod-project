import { useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "react-i18next";

export type ScenePropertiesTab = "inspect" | "texture" | "graphic" | "placement";

interface ScenePropertiesPanelProps {
  headerActions?: ReactNode;
  inspectContent: ReactNode;
  textureContent: ReactNode;
  graphicContent: ReactNode;
  placementContent: ReactNode;
  placementBadge?: number;
  graphicBadge?: string;
  textureBadge?: number;
}

const TAB_TRIGGER =
  "h-5 px-2 text-[10px] data-[state=active]:bg-background";
const TAB_BADGE =
  "ml-0.5 inline-block min-w-[1rem] text-center text-[8px] font-mono leading-none opacity-60";

export function ScenePropertiesPanel({
  headerActions,
  inspectContent,
  textureContent,
  graphicContent,
  placementContent,
  placementBadge,
  graphicBadge,
  textureBadge,
}: ScenePropertiesPanelProps) {
  const [tab, setTab] = useState<ScenePropertiesTab>("inspect");
  const { t } = useTranslation("scene-texture");

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden border-l">
      <div className="flex shrink-0 items-center border-b bg-muted/20 px-3 py-1 select-none whitespace-nowrap">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {t("panel.details")}
        </span>
        {headerActions ? <span className="ml-auto">{headerActions}</span> : null}
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as ScenePropertiesTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="shrink-0 h-7 w-full justify-start rounded-none border-b bg-muted/20 px-1">
          <TabsTrigger value="inspect" className={TAB_TRIGGER}>
            {t("panel.inspect")}
          </TabsTrigger>
          <TabsTrigger value="texture" className={TAB_TRIGGER}>
            {t("panel.texture")}
            {textureBadge !== undefined && textureBadge > 0 && (
              <span className={TAB_BADGE}>{textureBadge}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="graphic" className={TAB_TRIGGER}>
            {t("panel.graphic")}
            {graphicBadge && <span className={TAB_BADGE}>{graphicBadge}</span>}
          </TabsTrigger>
          <TabsTrigger value="placement" className={TAB_TRIGGER}>
            {t("panel.placement")}
            {placementBadge !== undefined && placementBadge > 0 && (
              <span className={TAB_BADGE}>{placementBadge}</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inspect" className="mt-0 min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="pb-4">{inspectContent}</div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="texture" className="mt-0 min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="pb-4">{textureContent}</div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="graphic" className="mt-0 min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="pb-4">{graphicContent}</div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="placement" className="mt-0 min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="pb-4">{placementContent}</div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
