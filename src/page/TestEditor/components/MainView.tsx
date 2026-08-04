import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { MainViewTabNav } from "./main-view/MainViewTabNav";
import RepackFolderStructureView from "./RepackFolderStructureView";
import CharacterIdTableView from "./CharacterIdTableView";
import CharacterCostView from "./CharacterCostView";
import CharacterListView from "./CharacterListView";
import SeriesListView from "./SeriesListView";
import CardIconListView from "./CardIconListView";
import StageIconListView from "./StageIconListView";
import StageListView from "./StageListView";
import MscWorkspaceView from "./msc-editor/MscWorkspaceView";
import ParamEditorView from "./param-editor/ParamEditorView";
import { BulletEditorView } from "./param-editors/bullet-editor/BulletEditorView";
import { ArmsEditorView } from "./param-editors/arms-editor/ArmsEditorView";
import { SpeedEditorView } from "./param-editors/speed-editor/SpeedEditorView";
import { CharacterEditorView } from "./param-editors/character-editor/CharacterEditorView";
import { ChrSysEditorView } from "./param-editors/chrsys-editor/ChrSysEditorView";
import { GrapEditorView } from "./param-editors/grap-editor/GrapEditorView";
import { DepictionEditorView } from "./param-editors/depiction-editor/DepictionEditorView";
import { HitGroupEditorView } from "./param-editors/hitgroup-editor/HitGroupEditorView";
import { InteractionEditorView } from "./param-editors/interaction-editor/InteractionEditorView";
import EffectFolderEditorView from "./effect-folder-editor/EffectFolderEditorView";
import { resolveEffectPackFromStructureJson } from "./effect-folder-editor/effectFolderEditorUtils";
import MotionFolderEditorView from "./motion-folder-editor/MotionFolderEditorView";
import { resolveMotionPackFromStructureJson } from "./motion-folder-editor/motionFolderEditorUtils";
import type { TestEditorWorkspaceDocument, WorkspacePackIdentity } from "@/services/testEditorWorkspace/types";
import { shouldAutoActivateMscWorkspaceTab } from "../utils/mscWorkspaceUtils";

type StageTab = {
  name: string;
  value: string;
  content?: React.ReactNode;
  render?: (props: MainViewProps) => React.ReactNode;
};

interface MainViewProps {
  jsonFilePath?: string | null;
  folderPath?: string | null;
  /** Folder path for MSC Workspace when the tree selection is a folder (or file parent) that contains .bscex/.cscex/.dscex files. */
  mscWorkspaceFolderPath?: string | null;
  onMscWorkspaceFolderChange?: (path: string | null) => void;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  onRevealTreeFolder?: (path: string) => void;
  workspaceDocument: TestEditorWorkspaceDocument;
  workspaceRouteRoots: Record<string, string>;
  modFolderPath?: string;
  onPackMutated?: (pack: WorkspacePackIdentity) => void;
  onPackRepacked?: (packKey: string) => void;
  onOpenAsEffectProject?: (filePath: string) => void;
}

const tabs: StageTab[] = [
  {
    name: "Folder structure",
    value: "folder-structure",
    render: (props: MainViewProps) => (
      <RepackFolderStructureView
        jsonFilePath={props.jsonFilePath}
        onUnsavedChanges={props.onUnsavedChanges}
      />
    ),
  },
  {
    name: "Character ID Table",
    value: "character-id-table",
    render: (props: MainViewProps) => (
      <CharacterIdTableView
        folderPath={props.folderPath ?? ""}
        isActive={false}
        onUnsavedChanges={props.onUnsavedChanges}
        workspaceDocument={props.workspaceDocument}
      />
    ),
  },
  {
    name: "Character Cost",
    value: "character-cost",
    render: (props: MainViewProps) => (
      <CharacterCostView
        folderPath={props.folderPath ?? ""}
        isActive={false}
        onUnsavedChanges={props.onUnsavedChanges}
        workspaceDocument={props.workspaceDocument}
      />
    ),
  },
  {
    name: "Character list",
    value: "character-list",
    render: (props: MainViewProps) => (
      <CharacterListView
        folderPath={props.folderPath ?? ""}
        isActive={false}
        onUnsavedChanges={props.onUnsavedChanges}
        workspaceDocument={props.workspaceDocument}
      />
    ),
  },
  {
    name: "Series List",
    value: "series-list",
    render: (props: MainViewProps) => (
      <SeriesListView
        folderPath={props.folderPath ?? ""}
        isActive={false}
        onUnsavedChanges={props.onUnsavedChanges}
        workspaceDocument={props.workspaceDocument}
      />
    ),
  },
  {
    name: "Card Icon List",
    value: "card-icon-list",
    render: (props: MainViewProps) => (
      <CardIconListView
        folderPath={props.folderPath ?? ""}
        isActive={false}
        onUnsavedChanges={props.onUnsavedChanges}
        workspaceDocument={props.workspaceDocument}
      />
    ),
  },
  {
    name: "Stage Icon List",
    value: "stage-icon-list",
    render: (props: MainViewProps) => (
      <StageIconListView
        folderPath={props.folderPath ?? ""}
        isActive={false}
        onUnsavedChanges={props.onUnsavedChanges}
        workspaceDocument={props.workspaceDocument}
      />
    ),
  },
  {
    name: "Stage List",
    value: "stage-list",
    render: (props: MainViewProps) => (
      <StageListView
        folderPath={props.folderPath ?? ""}
        isActive={false}
        onUnsavedChanges={props.onUnsavedChanges}
        workspaceDocument={props.workspaceDocument}
      />
    ),
  },
  {
    name: "MSC Workspace",
    value: "msc-workspace",
    render: (props: MainViewProps) => (
      <MscWorkspaceView
        workspaceRoot={props.folderPath ?? ""}
        mscFolderPath={props.mscWorkspaceFolderPath ?? null}
        onMscFolderChange={props.onMscWorkspaceFolderChange}
        isActive={false}
        onUnsavedChanges={props.onUnsavedChanges}
        workspaceDefaultPath={props.workspaceRouteRoots["msc.workspace"]}
        modFolderPath={props.modFolderPath}
      />
    ),
  },
  {
    name: "Param Editor",
    value: "param-editor",
    render: (props: MainViewProps) => (
      <ParamEditorView
        onUnsavedChanges={props.onUnsavedChanges}
        workspaceDefaultPath={props.workspaceRouteRoots["unit.param"]}
      />
    ),
  },
  {
    name: "Bullet Editor (outdated)",
    value: "bullet-editor",
    render: (props: MainViewProps) => (
      <BulletEditorView
        onUnsavedChanges={props.onUnsavedChanges}
        workspaceDefaultPath={props.workspaceRouteRoots["unit.param"]}
      />
    ),
  },
  {
    name: "Arms Editor (outdated)",
    value: "arms-editor",
    render: (props: MainViewProps) => (
      <ArmsEditorView
        onUnsavedChanges={props.onUnsavedChanges}
        workspaceDefaultPath={props.workspaceRouteRoots["unit.param"]}
      />
    ),
  },
  {
    name: "Speed Editor (outdated)",
    value: "speed-editor",
    render: (props: MainViewProps) => (
      <SpeedEditorView
        onUnsavedChanges={props.onUnsavedChanges}
        workspaceDefaultPath={props.workspaceRouteRoots["unit.param"]}
      />
    ),
  },
  {
    name: "Character Editor (outdated)",
    value: "character-editor",
    render: (props: MainViewProps) => (
      <CharacterEditorView
        onUnsavedChanges={props.onUnsavedChanges}
        workspaceDefaultPath={props.workspaceRouteRoots["unit.param"]}
      />
    ),
  },
  {
    name: "ChrSys Editor (outdated)",
    value: "chrsys-editor",
    render: (props: MainViewProps) => (
      <ChrSysEditorView
        onUnsavedChanges={props.onUnsavedChanges}
        workspaceDefaultPath={props.workspaceRouteRoots["unit.param"]}
      />
    ),
  },
  {
    name: "Grap Editor (outdated)",
    value: "grap-editor",
    render: (props: MainViewProps) => (
      <GrapEditorView
        onUnsavedChanges={props.onUnsavedChanges}
        workspaceDefaultPath={props.workspaceRouteRoots["unit.param"]}
      />
    ),
  },
  {
    name: "Depiction Editor (outdated)",
    value: "depiction-editor",
    render: (props: MainViewProps) => (
      <DepictionEditorView
        onUnsavedChanges={props.onUnsavedChanges}
        workspaceDefaultPath={props.workspaceRouteRoots["unit.param"]}
      />
    ),
  },
  {
    name: "HitGroup Editor (outdated)",
    value: "hitgroup-editor",
    render: (props: MainViewProps) => (
      <HitGroupEditorView
        onUnsavedChanges={props.onUnsavedChanges}
        workspaceDefaultPath={props.workspaceRouteRoots["unit.param"]}
      />
    ),
  },
  {
    name: "Interaction Editor (outdated)",
    value: "interaction-editor",
    render: (props: MainViewProps) => (
      <InteractionEditorView
        onUnsavedChanges={props.onUnsavedChanges}
        workspaceDefaultPath={props.workspaceRouteRoots["unit.param"]}
      />
    ),
  },
  {
    name: "Effect Folder",
    value: "effect-folder",
    render: (props: MainViewProps) => (
      <EffectFolderEditorView
        workspaceRoot={props.folderPath ?? ""}
        structureJsonPath={props.jsonFilePath ?? null}
        workspaceDocument={props.workspaceDocument}
        modFolderPath={props.modFolderPath ?? ""}
        isActive={false}
        onPackMutated={props.onPackMutated}
        onPackRepacked={props.onPackRepacked}
        onOpenAsEffectProject={props.onOpenAsEffectProject}
      />
    ),
  },
  {
    name: "Motion Folder",
    value: "motion-folder",
    render: (props: MainViewProps) => (
      <MotionFolderEditorView
        workspaceRoot={props.folderPath ?? ""}
        structureJsonPath={props.jsonFilePath ?? null}
        workspaceDocument={props.workspaceDocument}
        isActive={false}
        onUnsavedChanges={props.onUnsavedChanges}
        onPackMutated={props.onPackMutated}
      />
    ),
  },
];

const MainView = ({
  jsonFilePath,
  folderPath,
  mscWorkspaceFolderPath,
  onMscWorkspaceFolderChange,
  onUnsavedChanges,
  onRevealTreeFolder,
  workspaceDocument,
  workspaceRouteRoots,
  modFolderPath,
  onPackMutated,
  onPackRepacked,
  onOpenAsEffectProject,
}: MainViewProps) => {
  const initialTab = tabs[0]?.value ?? "folder-structure";
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const effectPackForSelection = useMemo(
    () =>
      resolveEffectPackFromStructureJson(
        folderPath ?? "",
        jsonFilePath ?? null,
        workspaceDocument,
      ),
    [folderPath, jsonFilePath, workspaceDocument],
  );
  const motionPackForSelection = useMemo(
    () =>
      resolveMotionPackFromStructureJson(
        folderPath ?? "",
        jsonFilePath ?? null,
        workspaceDocument,
      ),
    [folderPath, jsonFilePath, workspaceDocument],
  );
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set([initialTab]));
  const [pendingCharacterIdTableSelection, setPendingCharacterIdTableSelection] = useState<number | null>(null);
  const [folderStructureHasUnsaved, setFolderStructureHasUnsaved] = useState(false);
  const [characterIdTableHasUnsaved, setCharacterIdTableHasUnsaved] = useState(false);
  const [characterCostHasUnsaved, setCharacterCostHasUnsaved] = useState(false);
  const [characterListHasUnsaved, setCharacterListHasUnsaved] = useState(false);
  const [seriesListHasUnsaved, setSeriesListHasUnsaved] = useState(false);
  const [stageListHasUnsaved, setStageListHasUnsaved] = useState(false);
  const [stageIconListHasUnsaved, setStageIconListHasUnsaved] = useState(false);
  const [mscWorkspaceHasUnsaved, setMscWorkspaceHasUnsaved] = useState(false);
  const [motionFolderHasUnsaved, setMotionFolderHasUnsaved] = useState(false);
  const lastAutoActivatedMscFolderRef = useRef<string | null>(null);

  useEffect(() => {
    if (!effectPackForSelection) return;
    setActiveTab("effect-folder");
    setVisitedTabs((prev) => {
      if (prev.has("effect-folder")) return prev;
      const next = new Set(prev);
      next.add("effect-folder");
      return next;
    });
  }, [effectPackForSelection?.structureJsonPath]);

  useEffect(() => {
    if (!motionPackForSelection) return;
    setActiveTab("motion-folder");
    setVisitedTabs((prev) => {
      if (prev.has("motion-folder")) return prev;
      const next = new Set(prev);
      next.add("motion-folder");
      return next;
    });
  }, [motionPackForSelection?.structureJsonPath]);

  useEffect(() => {
    if (!mscWorkspaceFolderPath) {
      lastAutoActivatedMscFolderRef.current = null;
      return;
    }
    if (
      !shouldAutoActivateMscWorkspaceTab({
        activeTab,
        mscWorkspaceFolderPath,
        lastAutoActivatedFolderPath: lastAutoActivatedMscFolderRef.current,
      })
    ) {
      return;
    }

    lastAutoActivatedMscFolderRef.current = mscWorkspaceFolderPath;
    setActiveTab("msc-workspace");
    setVisitedTabs((prev) => {
      if (prev.has("msc-workspace")) return prev;
      const next = new Set(prev);
      next.add("msc-workspace");
      return next;
    });
  }, [activeTab, mscWorkspaceFolderPath]);

  const handleUnsavedChanges = useCallback((hasChanges: boolean) => {
    setFolderStructureHasUnsaved(hasChanges);
    onUnsavedChanges?.(hasChanges);
  }, [onUnsavedChanges]);

  const handleCharacterIdTableUnsaved = useCallback((hasChanges: boolean) => {
    setCharacterIdTableHasUnsaved(hasChanges);
  }, []);

  const handleCharacterCostUnsaved = useCallback((hasChanges: boolean) => {
    setCharacterCostHasUnsaved(hasChanges);
  }, []);

  const handleCharacterListUnsaved = useCallback((hasChanges: boolean) => {
    setCharacterListHasUnsaved(hasChanges);
  }, []);

  const handleSeriesListUnsaved = useCallback((hasChanges: boolean) => {
    setSeriesListHasUnsaved(hasChanges);
  }, []);

  const handleStageListUnsaved = useCallback((hasChanges: boolean) => {
    setStageListHasUnsaved(hasChanges);
  }, []);

  const handleStageIconListUnsaved = useCallback((hasChanges: boolean) => {
    setStageIconListHasUnsaved(hasChanges);
  }, []);

  const handleMscWorkspaceUnsaved = useCallback((hasChanges: boolean) => {
    setMscWorkspaceHasUnsaved(hasChanges);
  }, []);

  const handleMotionFolderUnsaved = useCallback((hasChanges: boolean) => {
    setMotionFolderHasUnsaved(hasChanges);
  }, []);

  const [paramEditorHasUnsaved, setParamEditorHasUnsaved] = useState(false);
  const handleParamEditorUnsaved = useCallback((hasChanges: boolean) => {
    setParamEditorHasUnsaved(hasChanges);
  }, []);
  const unsavedTabMap = useMemo<Record<string, boolean>>(
    () => ({
      "folder-structure": folderStructureHasUnsaved,
      "character-id-table": characterIdTableHasUnsaved,
      "character-cost": characterCostHasUnsaved,
      "character-list": characterListHasUnsaved,
      "series-list": seriesListHasUnsaved,
      "card-icon-list": stageIconListHasUnsaved,
      "stage-icon-list": stageIconListHasUnsaved,
      "stage-list": stageListHasUnsaved,
      "msc-workspace": mscWorkspaceHasUnsaved,
      "motion-folder": motionFolderHasUnsaved,
      "param-editor": paramEditorHasUnsaved,
    }),
    [
      folderStructureHasUnsaved,
      characterIdTableHasUnsaved,
      characterCostHasUnsaved,
      characterListHasUnsaved,
      seriesListHasUnsaved,
      stageIconListHasUnsaved,
      stageListHasUnsaved,
      mscWorkspaceHasUnsaved,
      motionFolderHasUnsaved,
      paramEditorHasUnsaved,
    ],
  );

  const handleJumpToCharacterIdTable = useCallback((characterId: number) => {
    setPendingCharacterIdTableSelection(characterId);
    setActiveTab("character-id-table");
    setVisitedTabs((prev) => {
      if (prev.has("character-id-table")) return prev;
      const next = new Set(prev);
      next.add("character-id-table");
      return next;
    });
  }, []);

  const handleConsumePendingCharacterIdTableSelection = useCallback(() => {
    setPendingCharacterIdTableSelection(null);
  }, []);

  const resolvedTabs = useMemo<StageTab[]>(() => {
    return tabs.map((tab) => {
      if (tab.value === "folder-structure") {
        return {
          ...tab,
          render: (props: MainViewProps) => (
            <RepackFolderStructureView
              jsonFilePath={props.jsonFilePath}
              onUnsavedChanges={handleUnsavedChanges}
            />
          ),
        };
      }

      if (tab.value === "character-id-table") {
        return {
          ...tab,
          render: (props: MainViewProps) => (
            <CharacterIdTableView
              folderPath={props.folderPath ?? ""}
              isActive={activeTab === "character-id-table"}
              onUnsavedChanges={handleCharacterIdTableUnsaved}
              onRevealTreeFolder={props.onRevealTreeFolder}
              pendingSelectCharacterId={pendingCharacterIdTableSelection}
              onConsumePendingSelect={handleConsumePendingCharacterIdTableSelection}
              workspaceDocument={props.workspaceDocument}
            />
          ),
        };
      }

      if (tab.value === "character-cost") {
        return {
          ...tab,
          render: (props: MainViewProps) => (
            <CharacterCostView
              folderPath={props.folderPath ?? ""}
              isActive={activeTab === "character-cost"}
              onUnsavedChanges={handleCharacterCostUnsaved}
              workspaceDocument={props.workspaceDocument}
            />
          ),
        };
      }

      if (tab.value === "character-list") {
        return {
          ...tab,
          render: (props: MainViewProps) => (
            <CharacterListView
              folderPath={props.folderPath ?? ""}
              isActive={activeTab === "character-list"}
              onUnsavedChanges={handleCharacterListUnsaved}
              onJumpToCharacterIdTable={handleJumpToCharacterIdTable}
              workspaceDocument={props.workspaceDocument}
            />
          ),
        };
      }

      if (tab.value === "series-list") {
        return {
          ...tab,
          render: (props: MainViewProps) => (
            <SeriesListView
              folderPath={props.folderPath ?? ""}
              isActive={activeTab === "series-list"}
              onUnsavedChanges={handleSeriesListUnsaved}
              workspaceDocument={props.workspaceDocument}
            />
          ),
        };
      }

      if (tab.value === "card-icon-list") {
        return {
          ...tab,
          render: (props: MainViewProps) => (
            <CardIconListView
              folderPath={props.folderPath ?? ""}
              isActive={activeTab === "card-icon-list"}
              onUnsavedChanges={props.onUnsavedChanges}
              workspaceDocument={props.workspaceDocument}
            />
          ),
        };
      }

      if (tab.value === "stage-icon-list") {
        return {
          ...tab,
          render: (props: MainViewProps) => (
            <StageIconListView
              folderPath={props.folderPath ?? ""}
              isActive={activeTab === "stage-icon-list"}
              onUnsavedChanges={handleStageIconListUnsaved}
              workspaceDocument={props.workspaceDocument}
            />
          ),
        };
      }

      if (tab.value === "stage-list") {
        return {
          ...tab,
          render: (props: MainViewProps) => (
            <StageListView
              folderPath={props.folderPath ?? ""}
              isActive={activeTab === "stage-list"}
              onUnsavedChanges={handleStageListUnsaved}
              onRevealTreeFolder={props.onRevealTreeFolder}
              workspaceDocument={props.workspaceDocument}
            />
          ),
        };
      }

      if (tab.value === "msc-workspace") {
        return {
          ...tab,
          render: (props: MainViewProps) => (
            <MscWorkspaceView
              workspaceRoot={props.folderPath ?? ""}
              mscFolderPath={props.mscWorkspaceFolderPath ?? null}
              onMscFolderChange={props.onMscWorkspaceFolderChange}
              isActive={activeTab === "msc-workspace"}
              onUnsavedChanges={handleMscWorkspaceUnsaved}
              workspaceDefaultPath={props.workspaceRouteRoots["msc.workspace"]}
              modFolderPath={props.modFolderPath}
            />
          ),
        };
      }

      if (tab.value === "param-editor") {
        return {
          ...tab,
          render: (props: MainViewProps) => (
            <ParamEditorView
              onUnsavedChanges={handleParamEditorUnsaved}
              workspaceDefaultPath={props.workspaceRouteRoots["unit.param"]}
            />
          ),
        };
      }

      if (tab.value === "effect-folder") {
        return {
          ...tab,
          render: (props: MainViewProps) => (
            <EffectFolderEditorView
              workspaceRoot={props.folderPath ?? ""}
              structureJsonPath={props.jsonFilePath ?? null}
              workspaceDocument={props.workspaceDocument}
              modFolderPath={props.modFolderPath ?? ""}
              isActive={activeTab === "effect-folder"}
              onPackMutated={props.onPackMutated}
              onPackRepacked={props.onPackRepacked}
              onOpenAsEffectProject={props.onOpenAsEffectProject}
            />
          ),
        };
      }

      if (tab.value === "motion-folder") {
        return {
          ...tab,
          render: (props: MainViewProps) => (
            <MotionFolderEditorView
              workspaceRoot={props.folderPath ?? ""}
              structureJsonPath={props.jsonFilePath ?? null}
              workspaceDocument={props.workspaceDocument}
              isActive={activeTab === "motion-folder"}
              onUnsavedChanges={handleMotionFolderUnsaved}
              onPackMutated={props.onPackMutated}
            />
          ),
        };
      }

      return tab;
    });
  }, [
    activeTab,
    handleCharacterIdTableUnsaved,
    handleCharacterCostUnsaved,
    handleCharacterListUnsaved,
    handleConsumePendingCharacterIdTableSelection,
    handleJumpToCharacterIdTable,
    handleSeriesListUnsaved,
    handleStageIconListUnsaved,
    handleStageListUnsaved,
    handleMscWorkspaceUnsaved,
    handleMotionFolderUnsaved,
    handleParamEditorUnsaved,
    handleUnsavedChanges,
    mscWorkspaceFolderPath,
    onMscWorkspaceFolderChange,
    pendingCharacterIdTableSelection,
  ]);

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value);
    setVisitedTabs((prev) => {
      if (prev.has(value)) return prev;
      const next = new Set(prev);
      next.add(value);
      return next;
    });
  }, []);

  const renderTabPanel = (tab: StageTab) => {
    const props: MainViewProps = {
      jsonFilePath,
      folderPath,
      mscWorkspaceFolderPath,
      onMscWorkspaceFolderChange,
      onUnsavedChanges,
      onRevealTreeFolder,
      workspaceDocument,
      workspaceRouteRoots,
      modFolderPath,
      onPackMutated,
      onPackRepacked,
      onOpenAsEffectProject,
    };
    if (tab.render) return tab.render(props);
    return tab.content ?? null;
  };

  return (
    <div className="flex h-full w-full min-h-0 bg-background">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex h-full w-full min-h-0 flex-col rounded-none p-0 m-0">
        <MainViewTabNav activeTab={activeTab} unsavedTabMap={unsavedTabMap} />
        <div className="relative flex min-h-0 flex-1 flex-col">
          {resolvedTabs.map((tab) => {
            if (!visitedTabs.has(tab.value)) return null;
            const isActive = activeTab === tab.value;
            const shouldKeepMounted = isActive || tab.value === "bullet-editor" || tab.value === "speed-editor" || tab.value === "depiction-editor" || Boolean(unsavedTabMap[tab.value]);
            if (!shouldKeepMounted) {
              return null;
            }
            return (
              <div
                key={tab.value}
                role="tabpanel"
                id={`mainview-panel-${tab.value}`}
                aria-labelledby={`mainview-tab-${tab.value}`}
                className={cn(
                  "flex min-h-0 flex-col",
                  isActive
                    ? "relative z-10 flex-1"
                    : "pointer-events-none invisible absolute inset-0 z-0 overflow-hidden",
                  isActive
                    ? "h-full w-full flex-1 overflow-auto px-4 pt-4"
                    : "px-4 pt-4",
                )}
                aria-hidden={!isActive}
                {...(!isActive ? { inert: true } : {})}
              >
                {renderTabPanel(tab)}
              </div>
            );
          })}
        </div>
      </Tabs>
    </div>
  );
};

export default MainView;
