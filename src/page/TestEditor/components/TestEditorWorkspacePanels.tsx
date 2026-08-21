import { memo, useCallback, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePanelRef } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";

type Props = {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
};

/**
 * Horizontal split for file tree, main editor, and info panel.
 * Kept as a separate memoized shell so layout structure is isolated from session modal state.
 */
export const TestEditorWorkspacePanels = memo(function TestEditorWorkspacePanels({
  left,
  center,
  right,
}: Props) {
  const infoPanelRef = usePanelRef();
  const [infoCollapsed, setInfoCollapsed] = useState(false);

  const toggleInfoPanel = useCallback(() => {
    const panel = infoPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
      return;
    }
    panel.collapse();
  }, [infoPanelRef]);

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-full min-h-0 rounded-lg border bg-card shadow-sm"
    >
      <ResizablePanel defaultSize="20%" minSize="15%">
        <div className="h-full">{left}</div>
      </ResizablePanel>

      <ResizableHandle withHandle className="w-1 bg-border hover:bg-primary/20 transition-colors" />

      <ResizablePanel defaultSize="60%" minSize="40%">
        <div className="h-full min-h-0 bg-muted/30">{center}</div>
      </ResizablePanel>

      <ResizableHandle withHandle className="w-1 bg-border hover:bg-primary/20 transition-colors" />

      <ResizablePanel
        id="test-editor-info"
        panelRef={infoPanelRef}
        collapsible
        collapsedSize="2.75rem"
        defaultSize="20%"
        minSize="15%"
        onResize={() => setInfoCollapsed(Boolean(infoPanelRef.current?.isCollapsed()))}
      >
        <div className="flex h-full min-h-0">
          <button
            type="button"
            onClick={toggleInfoPanel}
            title={infoCollapsed ? "Expand info panel" : "Collapse info panel"}
            aria-expanded={!infoCollapsed}
            aria-controls="test-editor-info-content"
            className={cn(
              "flex w-6 shrink-0 flex-col items-center justify-center gap-2 border-r bg-muted/20",
              "text-muted-foreground transition-[background-color,color] duration-150",
              "hover:bg-muted/40 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              "active:translate-y-px",
            )}
          >
            {infoCollapsed ? (
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            )}
            {infoCollapsed ? (
              <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-semibold uppercase tracking-[0.14em]">
                Info
              </span>
            ) : null}
          </button>
          <div
            id="test-editor-info-content"
            className={cn("min-h-0 min-w-0 flex-1", infoCollapsed && "hidden")}
          >
            {right}
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
});

TestEditorWorkspacePanels.displayName = "TestEditorWorkspacePanels";
