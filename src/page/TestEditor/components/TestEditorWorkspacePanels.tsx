import { memo, type ReactNode } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

type Props = {
  left: ReactNode;
  center: ReactNode;
};

/**
 * Horizontal split for the file tree and the main editor.
 * Kept as a separate memoized shell so layout structure is isolated from session modal state.
 */
export const TestEditorWorkspacePanels = memo(function TestEditorWorkspacePanels({ left, center }: Props) {
  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-full min-h-0 rounded-lg border bg-card shadow-sm"
    >
      <ResizablePanel defaultSize="22%" minSize="15%">
        <div className="h-full">{left}</div>
      </ResizablePanel>

      <ResizableHandle withHandle className="w-1 bg-border hover:bg-primary/20 transition-colors" />

      <ResizablePanel defaultSize="78%" minSize="40%">
        <div className="h-full min-h-0 bg-muted/30">{center}</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
});

TestEditorWorkspacePanels.displayName = "TestEditorWorkspacePanels";
