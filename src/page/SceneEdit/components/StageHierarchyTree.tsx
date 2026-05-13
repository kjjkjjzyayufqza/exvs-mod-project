import { ChevronRight, ChevronDown, Box, Map, Info, Layers } from "lucide-react";
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
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-4 gap-2">
        <Layers className="h-8 w-8 opacity-30" />
        <span>No stage loaded</span>
        <span className="text-xs text-center opacity-60">
          Use "Import FHM2D" or "Open Stage" to begin
        </span>
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

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 px-1 py-0.5 rounded-sm cursor-pointer text-sm select-none",
          "hover:bg-accent/50",
          selectedId === node.id && "bg-accent text-accent-foreground"
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={handleClick}
      >
        {hasChildren ? (
          <button
            className="h-4 w-4 flex items-center justify-center shrink-0"
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
        <RoleIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{node.label}</span>
        {node.objectIndex !== undefined && (
          <span className="ml-auto text-xs text-muted-foreground font-mono">
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
