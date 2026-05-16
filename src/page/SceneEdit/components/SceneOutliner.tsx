import { useCallback, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Box,
  Map,
  Layers,
  FolderOpen,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Copy,
  Clipboard,
  Trash2,
  FolderPlus,
  Group,
  Ungroup,
  Sparkles,
  Component,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
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
} from "@/components/ui/context-menu";
import { useSceneEditorStore, type OutlinerGroup } from "../store/sceneEditorStore";
import type { StageTreeNode } from "./StageHierarchyTree";

interface SceneOutlinerProps {
  root: StageTreeNode | null;
  onSelect: (id: string | null) => void;
  onDuplicate?: (ids: string[]) => void;
  onDelete?: (ids: string[]) => void;
  onPaste?: () => void;
  onFocusSelected?: () => void;
}

export function SceneOutliner({
  root,
  onSelect,
  onDuplicate,
  onDelete,
  onPaste,
  onFocusSelected,
}: SceneOutlinerProps) {
  const {
    selectedIds,
    lastSelectedId,
    select,
    selectAll,
    deselectAll,
    groups,
    createGroup,
    removeGroup,
    renameGroup,
    toggleGroupCollapse,
    nodeVisibility,
    toggleVisibility,
    isVisible,
    toggleLock,
    isLocked,
    copyToClipboard,
    clipboard,
  } = useSceneEditorStore();

  const allNodeIds = useMemo(() => {
    if (!root) return [];
    const ids: string[] = [];
    const collect = (node: StageTreeNode) => {
      if (node.id !== "root") ids.push(node.id);
      node.children?.forEach(collect);
    };
    collect(root);
    return ids;
  }, [root]);

  const handleNodeClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      select(id, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, allIds: allNodeIds });
      onSelect(id);
    },
    [select, onSelect, allNodeIds],
  );

  const handleSelectAll = useCallback(() => {
    selectAll(allNodeIds);
  }, [selectAll, allNodeIds]);

  const handleGroup = useCallback(() => {
    const ids = [...selectedIds];
    if (ids.length < 2) return;
    createGroup(`Group ${groups.length + 1}`, ids);
  }, [selectedIds, groups.length, createGroup]);

  const handleCopy = useCallback(() => {
    const entries = [...selectedIds].map((id) => ({
      nodeId: id,
      placementIdx: null,
      transform: { posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
    }));
    copyToClipboard(entries);
  }, [selectedIds, copyToClipboard]);

  const handleDuplicate = useCallback(() => {
    onDuplicate?.([...selectedIds]);
  }, [selectedIds, onDuplicate]);

  const handleDeleteSelected = useCallback(() => {
    onDelete?.([...selectedIds]);
  }, [selectedIds, onDelete]);

  if (!root) {
    return (
      <div className="flex min-w-0 w-full max-w-full flex-col items-center justify-center h-full text-muted-foreground p-4 gap-3">
        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center shrink-0">
          <FolderOpen className="h-5 w-5 opacity-40" />
        </div>
        <div className="text-center space-y-1 min-w-0 w-full px-1">
          <p className="text-xs font-medium break-words">No stage loaded</p>
          <p className="text-[10px] opacity-60 leading-relaxed break-words">
            Import FHM2D or Open Stage to begin editing
          </p>
        </div>
      </div>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <ScrollArea className="h-full">
          <div className="p-1">
            {groups.map((group) => (
              <GroupNode
                key={group.id}
                group={group}
                root={root}
                selectedIds={selectedIds}
                onNodeClick={handleNodeClick}
                toggleGroupCollapse={toggleGroupCollapse}
                removeGroup={removeGroup}
                isVisible={isVisible}
                toggleVisibility={toggleVisibility}
                isLocked={isLocked}
                toggleLock={toggleLock}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
              />
            ))}
            <OutlinerNode
              node={root}
              depth={0}
              selectedIds={selectedIds}
              onNodeClick={handleNodeClick}
              groups={groups}
              isVisible={isVisible}
              toggleVisibility={toggleVisibility}
              isLocked={isLocked}
              toggleLock={toggleLock}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
            />
          </div>
        </ScrollArea>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onClick={handleSelectAll}>
          Select All
          <ContextMenuShortcut>Ctrl+A</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => deselectAll()}>
          Deselect All
          <ContextMenuShortcut>Esc</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleCopy} disabled={selectedIds.size === 0}>
          <Copy className="mr-2 h-3.5 w-3.5" />
          Copy
          <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={handleDuplicate} disabled={selectedIds.size === 0}>
          <Clipboard className="mr-2 h-3.5 w-3.5" />
          Duplicate
          <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={onPaste} disabled={clipboard.length === 0}>
          <Clipboard className="mr-2 h-3.5 w-3.5" />
          Paste as New
          <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={handleDeleteSelected} disabled={selectedIds.size === 0} className="text-destructive">
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          Delete
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleGroup} disabled={selectedIds.size < 2}>
          <FolderPlus className="mr-2 h-3.5 w-3.5" />
          Group Selected
          <ContextMenuShortcut>Ctrl+G</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onFocusSelected} disabled={selectedIds.size === 0}>
          Focus Selected
          <ContextMenuShortcut>F</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Eye className="mr-2 h-3.5 w-3.5" />
            Visibility
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onClick={() => selectedIds.forEach((id) => useSceneEditorStore.getState().setVisibility(id, true))}>
              Show Selected
            </ContextMenuItem>
            <ContextMenuItem onClick={() => selectedIds.forEach((id) => useSceneEditorStore.getState().setVisibility(id, false))}>
              Hide Selected
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function GroupNode({
  group,
  root,
  selectedIds,
  onNodeClick,
  toggleGroupCollapse,
  removeGroup,
  isVisible,
  toggleVisibility,
  isLocked,
  toggleLock,
  onDuplicate,
  onDelete,
}: {
  group: OutlinerGroup;
  root: StageTreeNode;
  selectedIds: Set<string>;
  onNodeClick: (id: string, e: React.MouseEvent) => void;
  toggleGroupCollapse: (id: string) => void;
  removeGroup: (id: string) => void;
  isVisible: (id: string) => boolean;
  toggleVisibility: (id: string) => void;
  isLocked: (id: string) => boolean;
  toggleLock: (id: string) => void;
  onDuplicate?: (ids: string[]) => void;
  onDelete?: (ids: string[]) => void;
}) {
  const childNodes = useMemo(() => {
    const findNode = (node: StageTreeNode, id: string): StageTreeNode | null => {
      if (node.id === id) return node;
      for (const child of node.children ?? []) {
        const found = findNode(child, id);
        if (found) return found;
      }
      return null;
    };
    return group.children
      .map((id) => findNode(root, id))
      .filter((n): n is StageTreeNode => n !== null);
  }, [group, root]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="mb-0.5">
          <div
            className={cn(
              "flex items-center gap-1.5 px-1.5 py-[3px] rounded-sm cursor-pointer text-xs select-none transition-colors",
              "hover:bg-accent/60 bg-accent/20",
            )}
          >
            <button
              className="h-4 w-4 flex items-center justify-center shrink-0 hover:bg-accent rounded-sm"
              onClick={() => toggleGroupCollapse(group.id)}
            >
              {group.collapsed ? (
                <ChevronRight className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
            <Group className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span className="truncate font-medium text-amber-600 dark:text-amber-400">{group.label}</span>
            <span className="ml-auto text-[9px] text-muted-foreground/70 font-mono">
              {group.children.length}
            </span>
          </div>
          {!group.collapsed && (
            <div className="ml-3 border-l border-amber-500/20 pl-1">
              {childNodes.map((child) => (
                <OutlinerNodeRow
                  key={child.id}
                  node={child}
                  depth={1}
                  selectedIds={selectedIds}
                  onNodeClick={onNodeClick}
                  isVisible={isVisible}
                  toggleVisibility={toggleVisibility}
                  isLocked={isLocked}
                  toggleLock={toggleLock}
                  onDuplicate={onDuplicate}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={() => removeGroup(group.id)}>
          <Ungroup className="mr-2 h-3.5 w-3.5" />
          Ungroup
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function OutlinerNode({
  node,
  depth,
  selectedIds,
  onNodeClick,
  groups,
  isVisible,
  toggleVisibility,
  isLocked,
  toggleLock,
  onDuplicate,
  onDelete,
}: {
  node: StageTreeNode;
  depth: number;
  selectedIds: Set<string>;
  onNodeClick: (id: string, e: React.MouseEvent) => void;
  groups: OutlinerGroup[];
  isVisible: (id: string) => boolean;
  toggleVisibility: (id: string) => void;
  isLocked: (id: string) => boolean;
  toggleLock: (id: string) => void;
  onDuplicate?: (ids: string[]) => void;
  onDelete?: (ids: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;

  const groupedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of groups) {
      for (const cid of g.children) ids.add(cid);
    }
    return ids;
  }, [groups]);

  const visibleChildren = useMemo(() => {
    if (!node.children) return [];
    return node.children.filter((c) => !groupedIds.has(c.id));
  }, [node.children, groupedIds]);

  if (node.id !== "root" && groupedIds.has(node.id)) return null;

  return (
    <div>
      {node.id !== "root" ? (
        <OutlinerNodeRow
          node={node}
          depth={depth}
          selectedIds={selectedIds}
          onNodeClick={onNodeClick}
          isVisible={isVisible}
          toggleVisibility={toggleVisibility}
          isLocked={isLocked}
          toggleLock={toggleLock}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          hasChildren={hasChildren}
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
        />
      ) : (
        <div
          className="flex items-center gap-1.5 px-1.5 py-[3px] text-xs select-none text-muted-foreground"
          style={{ paddingLeft: `${depth * 14 + 4}px` }}
        >
          {hasChildren && (
            <button
              className="h-4 w-4 flex items-center justify-center shrink-0 hover:bg-accent rounded-sm"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          )}
          <Layers className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate font-semibold">{node.label}</span>
        </div>
      )}
      {expanded && visibleChildren.map((child) => (
        <OutlinerNode
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedIds={selectedIds}
          onNodeClick={onNodeClick}
          groups={groups}
          isVisible={isVisible}
          toggleVisibility={toggleVisibility}
          isLocked={isLocked}
          toggleLock={toggleLock}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function OutlinerNodeRow({
  node,
  depth,
  selectedIds,
  onNodeClick,
  isVisible,
  toggleVisibility,
  isLocked,
  toggleLock,
  onDuplicate,
  onDelete,
  hasChildren,
  expanded,
  onToggle,
}: {
  node: StageTreeNode;
  depth: number;
  selectedIds: Set<string>;
  onNodeClick: (id: string, e: React.MouseEvent) => void;
  isVisible: (id: string) => boolean;
  toggleVisibility: (id: string) => void;
  isLocked: (id: string) => boolean;
  toggleLock: (id: string) => void;
  onDuplicate?: (ids: string[]) => void;
  onDelete?: (ids: string[]) => void;
  hasChildren?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const isSelected = selectedIds.has(node.id);
  const visible = isVisible(node.id);
  const locked = isLocked(node.id);
  const RoleIcon = getRoleIcon(node.role);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "flex items-center gap-1 px-1.5 py-[3px] rounded-sm cursor-pointer text-xs select-none transition-colors group/row",
            "hover:bg-accent/60",
            isSelected && "bg-primary/15 text-primary ring-1 ring-primary/20",
            !visible && "opacity-40",
          )}
          style={{ paddingLeft: `${depth * 14 + 4}px` }}
          onClick={(e) => onNodeClick(node.id, e)}
        >
          {hasChildren ? (
            <button
              className="h-4 w-4 flex items-center justify-center shrink-0 hover:bg-accent rounded-sm"
              onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          ) : (
            <span className="h-4 w-4 shrink-0" />
          )}
          <RoleIcon className={cn("h-3.5 w-3.5 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
          <span className={cn("truncate font-medium flex-1", locked && "italic")}>{node.label}</span>
          <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
            <button
              className="h-4 w-4 flex items-center justify-center rounded-sm hover:bg-accent"
              onClick={(e) => { e.stopPropagation(); toggleVisibility(node.id); }}
              title={visible ? "Hide" : "Show"}
            >
              {visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3 text-muted-foreground" />}
            </button>
            <button
              className="h-4 w-4 flex items-center justify-center rounded-sm hover:bg-accent"
              onClick={(e) => { e.stopPropagation(); toggleLock(node.id); }}
              title={locked ? "Unlock" : "Lock"}
            >
              {locked ? <Lock className="h-3 w-3 text-amber-500" /> : <Unlock className="h-3 w-3" />}
            </button>
          </div>
          {node.objectIndex !== undefined && (
            <span className="text-[9px] text-muted-foreground/70 font-mono tabular-nums">
              #{node.objectIndex}
            </span>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={(e: any) => { onNodeClick(node.id, e); }}>
          Select
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => {
          const entries = [{ nodeId: node.id, placementIdx: null, transform: { posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 } }];
          useSceneEditorStore.getState().copyToClipboard(entries);
        }}>
          <Copy className="mr-2 h-3.5 w-3.5" />
          Copy
          <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onDuplicate?.([node.id])}>
          <Clipboard className="mr-2 h-3.5 w-3.5" />
          Duplicate as New
          <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => toggleVisibility(node.id)}>
          {visible ? <EyeOff className="mr-2 h-3.5 w-3.5" /> : <Eye className="mr-2 h-3.5 w-3.5" />}
          {visible ? "Hide" : "Show"}
          <ContextMenuShortcut>H</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => toggleLock(node.id)}>
          {locked ? <Unlock className="mr-2 h-3.5 w-3.5" /> : <Lock className="mr-2 h-3.5 w-3.5" />}
          {locked ? "Unlock" : "Lock"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onDelete?.([node.id])} className="text-destructive">
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          Delete
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function getRoleIcon(role: StageTreeNode["role"]) {
  switch (role) {
    case "base":
      return Map;
    case "sub_model":
      return Box;
    case "placement":
      return Component;
    case "effect":
      return Sparkles;
    case "imported_dae":
      return Box;
    case "root":
      return Layers;
    default:
      return Box;
  }
}
