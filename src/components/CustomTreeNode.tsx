import { FolderOpen, Folder, FileText, ChevronRight, AlertTriangle, GripVertical } from "lucide-react";
import { toast } from "sonner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { NodeApi } from "react-arborist";
import type { TreeDataItem } from "@/lib/utils";

interface CustomTreeNodeProps {
  node: NodeApi<TreeDataItem>;
  style: React.CSSProperties;
  dragHandle?: (el: HTMLDivElement | null) => void;
  enableExampleHighlight?: boolean;
  mode?: string;
}

export function CustomTreeNode({
  node,
  style,
  dragHandle,
  enableExampleHighlight = false,
  mode = 'Model'
}: CustomTreeNodeProps) {
  const isFolder = !node.isLeaf;
  const nodeData = node.data.data;

  // Check if this is a Texture Folder and needs warning
  const showBarispecularWarning = mode === 'Model' &&
    nodeData?.type === 'Folder' &&
    node.data.name?.includes('Textures Folder') &&
    !hasBarispecularFile(node);

  function hasBarispecularFile(folderNode: NodeApi<TreeDataItem>): boolean {
    if (!folderNode.children) return false;
    return folderNode.children.some(child => {
      const childData = child.data.data;
      if (childData?.type === 'Item' && childData.fileType === '.nutexb') {
        return /barispecular/i.test(child.data.name);
      }
      return false;
    });
  }

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    node.toggle();
  };

  const depth = node.level;
  const indentPadding = depth * 12;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={dragHandle}
          style={{
            ...style,
            paddingLeft: `${indentPadding}px`,
          }}
          className={cn(
            "group relative flex items-center gap-1.5 py-1.5 pr-3 cursor-pointer select-none",
            "transition-all duration-150 ease-out",
            // Selection states
            node.isSelected
              ? "bg-primary/10 text-primary"
              : "hover:bg-muted/60 text-foreground/80",
            // Focus state
            node.isFocused && "ring-1 ring-inset ring-primary/40",
            // Drag states
            node.isDragging && "opacity-60 shadow-lg",
            node.willReceiveDrop && "bg-primary/5 border-primary/30",
            // Drop target indicator
            node.willReceiveDrop && "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-primary"
          )}
          onClick={() => node.select()}
          onDoubleClick={() => isFolder && node.toggle()}
        >
      {/* Drag handle indicator - shows on hover */}
      <div className={cn(
        "w-3 flex items-center justify-center opacity-0 transition-opacity",
        "group-hover:opacity-40 cursor-grab active:cursor-grabbing"
      )}>
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </div>

      {/* Expand/collapse toggle */}
      <button
        onClick={handleToggle}
        className={cn(
          "flex items-center justify-center w-5 h-5 rounded-sm",
          "transition-colors duration-150",
          "hover:bg-muted-foreground/10",
          !isFolder && "invisible"
        )}
        aria-label={node.isOpen ? "Collapse" : "Expand"}
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
            node.isOpen && "rotate-90"
          )}
        />
      </button>

      {/* Icon with dynamic styling */}
      <div className={cn(
        "flex items-center justify-center w-5 h-5 rounded",
        isFolder
          ? node.isOpen
            ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
            : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          : "bg-muted text-muted-foreground"
      )}>
        {isFolder ? (
          node.isOpen ? (
            <FolderOpen className="h-3.5 w-3.5" />
          ) : (
            <Folder className="h-3.5 w-3.5" />
          )
        ) : (
          <FileText className="h-3.5 w-3.5" />
        )}
      </div>

      {/* Name with edit mode support */}
      <div className="flex-1 min-w-0">
        {node.isEditing ? (
          <input
            type="text"
            defaultValue={node.data.name}
            onBlur={(e) => node.submit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') node.submit(e.currentTarget.value);
              if (e.key === 'Escape') node.reset();
            }}
            className={cn(
              "w-full px-1.5 py-0.5 text-sm bg-background border rounded",
              "focus:outline-none focus:ring-2 focus:ring-primary/50"
            )}
            autoFocus
          />
        ) : (
          <span
            className={cn(
              "block text-sm truncate",
              node.isSelected && "font-medium",
              enableExampleHighlight && nodeData?.isExample && "text-destructive font-medium"
            )}
            title={node.data.name}
          >
            {node.data.name}
          </span>
        )}
      </div>

      {/* File type badge */}
      {nodeData?.type === 'Item' && nodeData.fileType && (
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {nodeData.fileType.replace('.', '')}
        </span>
      )}

      {/* Warning indicator */}
      {showBarispecularWarning && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex-shrink-0">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">
              <p>Missing barispecular texture file</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Selected indicator bar */}
      {node.isSelected && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full" />
      )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-40">
        <ContextMenuItem
          onSelect={() => {
            toast.message("Test");
          }}
        >
          Test
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
