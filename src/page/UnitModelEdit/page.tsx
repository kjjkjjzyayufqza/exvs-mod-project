import { useState } from "react";
import { useIsKeepAliveRouteActive } from "@/layout/KeepAliveContext";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { SsbhModelPreviewProvider, SsbhModelPreviewViewport } from "@/components/ssbh-model-preview/SsbhModelPreviewPanel";
import { UNIT_MODEL_EDIT_ROUTE_URL } from "./constants";
import { UnitModelInspectorPanel } from "./components/UnitModelInspectorPanel";
import { UnitModelToolsPanel } from "./components/UnitModelToolsPanel";

export default function UnitModelEdit() {
  const [unitRoot, setUnitRoot] = useState<string | null>(null);
  const isPageActive = useIsKeepAliveRouteActive(UNIT_MODEL_EDIT_ROUTE_URL);

  return (
    <SsbhModelPreviewProvider workspaceRoot={unitRoot} previewSuspended={!isPageActive}>
      <div className="flex h-full min-h-0 flex-col bg-background p-2 text-xs">
        <ResizablePanelGroup
          orientation="horizontal"
          className="h-full min-h-0 rounded-lg border bg-card shadow-sm"
        >
          <ResizablePanel defaultSize={22} minSize={18}>
            <UnitModelToolsPanel unitRoot={unitRoot} onUnitRootChange={setUnitRoot} />
          </ResizablePanel>

          <ResizableHandle withHandle className="w-1 bg-border transition-colors hover:bg-primary/20" />

          <ResizablePanel defaultSize={56} minSize={38}>
            <div className="h-full min-h-0 bg-muted/30 p-2">
              <SsbhModelPreviewViewport />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className="w-1 bg-border transition-colors hover:bg-primary/20" />

          <ResizablePanel defaultSize={22} minSize={18}>
            <UnitModelInspectorPanel unitRoot={unitRoot} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </SsbhModelPreviewProvider>
  );
}
