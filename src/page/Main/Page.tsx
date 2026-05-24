import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConfigStore } from "@/store/configStore";
import { HomePageHero } from "./components/HomePageHero";
import { ModuleLauncherGrid } from "./components/ModuleLauncherGrid";
import { SetupStatusCard, type SetupPathItem } from "./components/SetupStatusCard";
import { WorkflowStepsCard } from "./components/WorkflowStepsCard";

const SETUP_PATH_KEYS: Omit<SetupPathItem, "path">[] = [
  { key: "obDplCachePath", label: "OB DPL Cache" },
  { key: "obModPath", label: "Mod Folder" },
  { key: "extractOutputPath", label: "Extract Output" },
];

export default function MainPage() {
  const { obDplCachePath, obModPath, extractOutputPath } = useConfigStore();

  const setupItems = useMemo<SetupPathItem[]>(
    () =>
      SETUP_PATH_KEYS.map((item, index) => {
        const paths = [obDplCachePath, obModPath, extractOutputPath];
        return { ...item, path: paths[index] ?? "" };
      }),
    [obDplCachePath, obModPath, extractOutputPath],
  );

  const configuredCount = setupItems.filter((item) => item.path.trim().length > 0).length;

  return (
    <ScrollArea className="h-full custom-scrollbar-thin">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 pb-8">
        <HomePageHero
          configuredCount={configuredCount}
          totalSetupItems={setupItems.length}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_300px]">
          <ModuleLauncherGrid />
          <aside className="flex flex-col gap-4 lg:sticky lg:top-0 lg:self-start">
            <SetupStatusCard items={setupItems} />
            <WorkflowStepsCard />
          </aside>
        </div>
      </div>
    </ScrollArea>
  );
}
