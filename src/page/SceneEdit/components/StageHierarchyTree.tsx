import { ChevronRight, ChevronDown, Box, Map, Info, Layers, FolderOpen } from "lucide-react";
import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface StageTreeNode {
  id: string;
  label: string;
  role: "base" | "info" | "sub_model" | "textures" | "root";
  children?: StageTreeNode[];
  objectIndex?: number;
  visible?: boolean;
}

interface StageHierarchyTreeProps {
  root: StageTreeNode | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleVisibility?: (id: string) => void;
}

export function StageHierarchyTree({
  root,
  selectedId,
  onSelect,
}: StageHierarchyTreeProps) {
  if (!root) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6 gap-3">
        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
          <FolderOpen className="h-5 w-5 opacity-40" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-xs font-medium">No stage loaded</p>
          <p className="text-[10px] opacity-60 leading-relaxed">
            Import FHM2D or Open Stage to begin editing
          </p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-1">
        <TreeNodeItem
          node={root}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </div>
    </ScrollArea>
  );
}

function TreeNodeItem({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: StageTreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;

  const handleClick = useCallback(() => {
    onSelect(node.id);
  }, [node.id, onSelect]);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setExpanded((v) => !v);
    },
    []
  );

  const RoleIcon = getRoleIcon(node.role);
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1.5 px-1.5 py-[3px] rounded-sm cursor-pointer text-xs select-none transition-colors",
          "hover:bg-accent/60",
          isSelected && "bg-primary/15 text-primary ring-1 ring-primary/20"
        )}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        onClick={handleClick}
      >
        {hasChildren ? (
          <button
            className="h-4 w-4 flex items-center justify-center shrink-0 hover:bg-accent rounded-sm"
            onClick={handleToggle}
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}
        <RoleIcon className={cn(
          "h-3.5 w-3.5 shrink-0",
          isSelected ? "text-primary" : "text-muted-foreground"
        )} />
        <span className="truncate font-medium">{node.label}</span>
        {node.objectIndex !== undefined && (
          <span className="ml-auto text-[9px] text-muted-foreground/70 font-mono tabular-nums">
            #{node.objectIndex}
          </span>
        )}
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function getRoleIcon(role: StageTreeNode["role"]) {
  switch (role) {
    case "base":
      return Map;
    case "info":
      return Info;
    case "sub_model":
      return Box;
    case "root":
      return Layers;
    default:
      return Box;
  }
}
