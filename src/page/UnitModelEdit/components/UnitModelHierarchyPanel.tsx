import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { UnitModelModelManagerPanel } from "./UnitModelModelManagerPanel";
import { UnitModelStructureTreeView } from "./UnitModelStructureTreeView";
import type { UnitModelTreeNode } from "../utils/unitModelStructureTree";

type UnitModelHierarchyPanelProps = {
  structureJson: unknown | null;
  structureJsonPath?: string | null;
  modelRoot?: string | null;
  onMutated?: () => void;
  onOpenEditor?: (node: UnitModelTreeNode) => void;
  onRevealNode?: (node: UnitModelTreeNode) => void;
  onCopyNodePath?: (node: UnitModelTreeNode) => void;
  onShowTextureInPanel?: (node: UnitModelTreeNode) => void;
  /** Forwarded to the model manager so the host can pause the viewport during FBX/DAE import. */
  onModelImportViewportSuspendChange?: (suspended: boolean) => void;
  editingPaths?: ReadonlySet<string>;
  modifiedPaths?: ReadonlySet<string>;
};

/**
 * Left-column hierarchy: structure tree (primary) stacked above model manager (add/remove).
 * Matches the pre-redesign layout where both surfaces were always visible together.
 */
export function UnitModelHierarchyPanel({
  structureJson,
  structureJsonPath,
  modelRoot,
  onMutated,
  onOpenEditor,
  onRevealNode,
  onCopyNodePath,
  onShowTextureInPanel,
  onModelImportViewportSuspendChange,
  editingPaths,
  modifiedPaths,
}: UnitModelHierarchyPanelProps) {
  return (
    <ResizablePanelGroup orientation="vertical" className="h-full min-h-0">
      <ResizablePanel id="unit-model-structure-tree" defaultSize="62%" minSize="25%">
        <UnitModelStructureTreeView
          structureJson={structureJson}
          structureJsonPath={structureJsonPath}
          className="h-full border-r-0"
          onOpenEditor={onOpenEditor}
          onRevealNode={onRevealNode}
          onCopyNodePath={onCopyNodePath}
          onShowTextureInPanel={onShowTextureInPanel}
          editingPaths={editingPaths}
          modifiedPaths={modifiedPaths}
        />
      </ResizablePanel>

      <ResizableHandle withHandle className="h-1 bg-border/60 transition-colors hover:bg-primary/25" />

      <ResizablePanel id="unit-model-model-list" defaultSize="38%" minSize="18%">
        <UnitModelModelManagerPanel
          structureJson={structureJson}
          structureJsonPath={structureJsonPath}
          modelRoot={modelRoot}
          onMutated={onMutated}
          onViewportSuspendChange={onModelImportViewportSuspendChange}
          className="h-full border-r-0"
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
