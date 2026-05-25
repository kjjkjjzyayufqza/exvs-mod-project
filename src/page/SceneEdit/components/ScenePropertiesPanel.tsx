import { type ReactNode } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

export type ScenePropertiesTab = "inspect" | "graphic" | "placement";

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
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden border-l">
      <div className="flex shrink-0 items-center border-b bg-muted/20 px-3 py-1 select-none whitespace-nowrap">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Details
        </span>
        {headerActions ? <span className="ml-auto">{headerActions}</span> : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-0 pb-4">
          {/* Context-aware inspect sections (rendered by parent based on selection) */}
          {inspectContent}

          {/* Stage-global data: always accessible below context sections */}
          {graphicContent}
          {placementContent}
        </div>
      </ScrollArea>
    </div>
  );
}
