import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { UnitModelModelManagerPanel } from "./UnitModelModelManagerPanel";
import { UnitModelStructureTreeView } from "./UnitModelStructureTreeView";

type UnitModelHierarchyPanelProps = {
  structureJson: unknown | null;
  structureJsonPath?: string | null;
  modelRoot?: string | null;
  onMutated?: () => void;
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
}: UnitModelHierarchyPanelProps) {
  return (
    <ResizablePanelGroup orientation="vertical" className="h-full min-h-0">
      <ResizablePanel id="unit-model-structure-tree" defaultSize="62%" minSize="25%">
        <UnitModelStructureTreeView
          structureJson={structureJson}
          structureJsonPath={structureJsonPath}
          className="h-full border-r-0"
        />
      </ResizablePanel>

      <ResizableHandle withHandle className="h-1 bg-border/60 transition-colors hover:bg-primary/25" />

      <ResizablePanel id="unit-model-model-list" defaultSize="38%" minSize="18%">
        <UnitModelModelManagerPanel
          structureJson={structureJson}
          structureJsonPath={structureJsonPath}
          modelRoot={modelRoot}
          onMutated={onMutated}
          className="h-full border-r-0"
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
