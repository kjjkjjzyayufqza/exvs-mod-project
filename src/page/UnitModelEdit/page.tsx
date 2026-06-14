import { useEffect, useState } from "react";

import { exists, readTextFile } from "@tauri-apps/plugin-fs";

import { useIsKeepAliveRouteActive } from "@/layout/KeepAliveContext";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { SsbhModelPreviewProvider, SsbhModelPreviewViewport } from "@/components/ssbh-model-preview/SsbhModelPreviewPanel";
import { UNIT_MODEL_EDIT_ROUTE_URL } from "./constants";
import { UnitModelInspectorPanel } from "./components/UnitModelInspectorPanel";
import { UnitModelModelManagerPanel } from "./components/UnitModelModelManagerPanel";
import { UnitModelStructureTreeView } from "./components/UnitModelStructureTreeView";
import { UnitModelToolsPanel } from "./components/UnitModelToolsPanel";
import { inferUnitModelStructurePath } from "./utils/unitModelRepackService";

export default function UnitModelEdit() {
  const [unitRoot, setUnitRoot] = useState<string | null>(null);
  const [structureJson, setStructureJson] = useState<unknown | null>(null);
  const [structurePath, setStructurePath] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const isPageActive = useIsKeepAliveRouteActive(UNIT_MODEL_EDIT_ROUTE_URL);

  useEffect(() => {
    let cancelled = false;
    if (!unitRoot) {
      setStructureJson(null);
      setStructurePath(null);
      return;
    }
    (async () => {
      try {
        const path = inferUnitModelStructurePath(unitRoot);
        if (!(await exists(path))) {
          if (!cancelled) {
            setStructurePath(path);
            setStructureJson(null);
          }
          return;
        }
        const raw = await readTextFile(path);
        const parsed = JSON.parse(raw);
        if (!cancelled) {
          setStructurePath(path);
          setStructureJson(parsed);
        }
      } catch (error) {
        console.error("Failed to load unit-model structure JSON", error);
        if (!cancelled) {
          setStructureJson(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [unitRoot, reloadTick]);

  return (
    <SsbhModelPreviewProvider workspaceRoot={unitRoot} previewSuspended={!isPageActive}>
      <div className="flex h-full min-h-0 flex-col bg-background p-2 text-xs">
        <ResizablePanelGroup
          orientation="horizontal"
          className="h-full min-h-0 rounded-lg border bg-card shadow-sm"
        >
          <ResizablePanel defaultSize={20} minSize={15}>
            <ResizablePanelGroup orientation="vertical" className="h-full min-h-0">
              <ResizablePanel defaultSize={62} minSize={30}>
                <UnitModelStructureTreeView
                  structureJson={structureJson}
                  structureJsonPath={structurePath}
                />
              </ResizablePanel>
              <ResizableHandle withHandle className="h-1 bg-border transition-colors hover:bg-primary/20" />
              <ResizablePanel defaultSize={38} minSize={20}>
                <UnitModelModelManagerPanel
                  structureJson={structureJson}
                  structureJsonPath={structurePath}
                  modelRoot={unitRoot}
                  onMutated={() => setReloadTick((t) => t + 1)}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle withHandle className="w-1 bg-border transition-colors hover:bg-primary/20" />

          <ResizablePanel defaultSize={20} minSize={16}>
            <UnitModelToolsPanel unitRoot={unitRoot} onUnitRootChange={setUnitRoot} />
          </ResizablePanel>

          <ResizableHandle withHandle className="w-1 bg-border transition-colors hover:bg-primary/20" />

          <ResizablePanel defaultSize={44} minSize={32}>
            <div className="h-full min-h-0 bg-muted/30 p-2">
              <SsbhModelPreviewViewport />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className="w-1 bg-border transition-colors hover:bg-primary/20" />

          <ResizablePanel defaultSize={16} minSize={14}>
            <UnitModelInspectorPanel unitRoot={unitRoot} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </SsbhModelPreviewProvider>
  );
}
