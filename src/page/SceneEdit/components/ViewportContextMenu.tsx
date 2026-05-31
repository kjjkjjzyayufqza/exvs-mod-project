import type { ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuCheckboxItem,
} from "@/components/ui/context-menu";
import {
  Eye,
  Grid3x3,
  Axis3D,
  Frame,
  RotateCcw,
  Move,
  RotateCw,
  Scaling,
  Download,
  Upload,
  Trash2,
  Copy,
} from "lucide-react";

interface ViewportContextMenuProps {
  children: ReactNode;
  showGrid: boolean;
  showAxes: boolean;
  wireframe: boolean;
  onToggleGrid: () => void;
  onToggleAxes: () => void;
  onToggleWireframe: () => void;
  onResetCamera: () => void;
  onFocusSelected: () => void;
  onGizmoMode: (mode: "translate" | "rotate" | "scale") => void;
  gizmoMode: "translate" | "rotate" | "scale";
  onImportDAE?: () => void;
  onExportDAE?: () => void;
  onDeleteSelected?: () => void;
  onDuplicateSelected?: () => void;
  hasSelection: boolean;
}

export function ViewportContextMenu({
  children,
  showGrid,
  showAxes,
  wireframe,
  onToggleGrid,
  onToggleAxes,
  onToggleWireframe,
  onResetCamera,
  onFocusSelected,
  onGizmoMode,
  gizmoMode,
  onImportDAE,
  onExportDAE,
  onDeleteSelected,
  onDuplicateSelected,
  hasSelection,
}: ViewportContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onClick={onFocusSelected} disabled={!hasSelection}>
          <Frame className="mr-2 h-3.5 w-3.5" />
          Focus Selected
          <ContextMenuShortcut>F</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={onResetCamera}>
          <RotateCcw className="mr-2 h-3.5 w-3.5" />
          Reset Camera
        </ContextMenuItem>
        <ContextMenuSeparator />

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Move className="mr-2 h-3.5 w-3.5" />
            Transform Mode
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuItem onClick={() => onGizmoMode("translate")}>
              <Move className="mr-2 h-3.5 w-3.5" />
              Translate
              <ContextMenuShortcut>W</ContextMenuShortcut>
              {gizmoMode === "translate" && <span className="ml-auto text-primary">●</span>}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onGizmoMode("rotate")}>
              <RotateCw className="mr-2 h-3.5 w-3.5" />
              Rotate
              <ContextMenuShortcut>E</ContextMenuShortcut>
              {gizmoMode === "rotate" && <span className="ml-auto text-primary">●</span>}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onGizmoMode("scale")}>
              <Scaling className="mr-2 h-3.5 w-3.5" />
              Scale
              <ContextMenuShortcut>R</ContextMenuShortcut>
              {gizmoMode === "scale" && <span className="ml-auto text-primary">●</span>}
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={onDuplicateSelected} disabled={!hasSelection}>
          <Copy className="mr-2 h-3.5 w-3.5" />
          Duplicate
          <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={onDeleteSelected} disabled={!hasSelection} className="text-destructive">
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          Delete
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Eye className="mr-2 h-3.5 w-3.5" />
            View Options
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuCheckboxItem checked={showGrid} onCheckedChange={onToggleGrid}>
              <Grid3x3 className="mr-2 h-3.5 w-3.5" />
              Show Grid
            </ContextMenuCheckboxItem>
            <ContextMenuCheckboxItem checked={showAxes} onCheckedChange={onToggleAxes}>
              <Axis3D className="mr-2 h-3.5 w-3.5" />
              Show Axes
            </ContextMenuCheckboxItem>
            <ContextMenuCheckboxItem checked={wireframe} onCheckedChange={onToggleWireframe}>
              Wireframe
            </ContextMenuCheckboxItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={onImportDAE}>
          <Upload className="mr-2 h-3.5 w-3.5" />
          Import Static Mesh...
        </ContextMenuItem>
        <ContextMenuItem onClick={onExportDAE} disabled={!hasSelection}>
          <Download className="mr-2 h-3.5 w-3.5" />
          Export Selected Model...
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
