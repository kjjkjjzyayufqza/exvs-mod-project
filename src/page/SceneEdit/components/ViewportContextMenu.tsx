import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("scene-context");
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onClick={onFocusSelected} disabled={!hasSelection}>
          <Frame className="mr-2 h-3.5 w-3.5" />
          {t("menu.focusSelected")}
          <ContextMenuShortcut data-i18n-ignore="">F</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={onResetCamera}>
          <RotateCcw className="mr-2 h-3.5 w-3.5" />
          {t("menu.resetCamera")}
        </ContextMenuItem>
        <ContextMenuSeparator />

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Move className="mr-2 h-3.5 w-3.5" />
            {t("menu.transformMode")}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuItem onClick={() => onGizmoMode("translate")}>
              <Move className="mr-2 h-3.5 w-3.5" />
              {t("transform.translate")}
              <ContextMenuShortcut data-i18n-ignore="">W</ContextMenuShortcut>
              {gizmoMode === "translate" && <span className="ml-auto text-primary">●</span>}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onGizmoMode("rotate")}>
              <RotateCw className="mr-2 h-3.5 w-3.5" />
              {t("transform.rotate")}
              <ContextMenuShortcut data-i18n-ignore="">E</ContextMenuShortcut>
              {gizmoMode === "rotate" && <span className="ml-auto text-primary">●</span>}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onGizmoMode("scale")}>
              <Scaling className="mr-2 h-3.5 w-3.5" />
              {t("transform.scale")}
              <ContextMenuShortcut data-i18n-ignore="">R</ContextMenuShortcut>
              {gizmoMode === "scale" && <span className="ml-auto text-primary">●</span>}
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={onDuplicateSelected} disabled={!hasSelection}>
          <Copy className="mr-2 h-3.5 w-3.5" />
          {t("menu.duplicate")}
          <ContextMenuShortcut data-i18n-ignore="">Ctrl+D</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={onDeleteSelected} disabled={!hasSelection} className="text-destructive">
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          {t("menu.delete")}
          <ContextMenuShortcut data-i18n-ignore="">Del</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Eye className="mr-2 h-3.5 w-3.5" />
            {t("menu.viewOptions")}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuCheckboxItem checked={showGrid} onCheckedChange={onToggleGrid}>
              <Grid3x3 className="mr-2 h-3.5 w-3.5" />
              {t("view.showGrid")}
            </ContextMenuCheckboxItem>
            <ContextMenuCheckboxItem checked={showAxes} onCheckedChange={onToggleAxes}>
              <Axis3D className="mr-2 h-3.5 w-3.5" />
              {t("view.showAxes")}
            </ContextMenuCheckboxItem>
            <ContextMenuCheckboxItem checked={wireframe} onCheckedChange={onToggleWireframe}>
              {t("view.wireframe")}
            </ContextMenuCheckboxItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={onImportDAE}>
          <Upload className="mr-2 h-3.5 w-3.5" />
          {t("menu.importStaticMesh")}
        </ContextMenuItem>
        <ContextMenuItem onClick={onExportDAE} disabled={!hasSelection}>
          <Download className="mr-2 h-3.5 w-3.5" />
          {t("menu.exportSelectedModel")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
