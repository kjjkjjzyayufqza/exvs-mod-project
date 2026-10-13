import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  Shield,
  GripVertical,
  Settings,
  AlertTriangle,
  Download,
  FolderSync,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useSceneValidationStore } from "../store/sceneValidationStore";
import {
  EditorContextMenuContent,
  EditorContextMenuItem,
  editorContextMenuIconClassName,
  stopEditorContextMenuBubble,
} from "@/components/editor/EditorContextMenu";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { useSceneEditorStore, type OutlinerGroup } from "../store/sceneEditorStore";
import type { StageTreeNode } from "./StageHierarchyTree";
import { canOpenDetailView } from "./detail-view/sceneDetailViewTypes";
import { getNodeTypeInfo } from "../utils/sceneNodeTypeInfo";
import { canExportNodeRoleToDae } from "../utils/daeExportDialogState";
import { canReplaceModelNode } from "../utils/sceneModelReplace";
import {
  findOutlinerAncestorIds,
  isOutlinerNodeSelected,
  resolveOutlinerRevealNodeId,
} from "../utils/sceneEditorSelection";
import { VirtualizedList } from "./VirtualizedList";
import {
  flattenSceneOutliner,
  OUTLINER_INDENT_PX,
  OUTLINER_ROW_HEIGHT,
  type OutlinerFlatRow,
} from "./sceneOutlinerFlatten";

/** Indented pulsing rows shown while a stage bundle is loading. */
function OutlinerSkeleton() {
  const { t } = useTranslation("scene-root-b");
  const rows = [
    { indent: 0, width: "70%" },
    { indent: 1, width: "55%" },
    { indent: 1, width: "62%" },
    { indent: 2, width: "48%" },
    { indent: 2, width: "44%" },
    { indent: 1, width: "58%" },
    { indent: 2, width: "50%" },
    { indent: 2, width: "46%" },
    { indent: 1, width: "60%" },
  ];
  return (
    <div className="flex h-full flex-col gap-1 p-2" aria-busy="true" aria-label={t("outliner.loadingTree")}>
      {rows.map((row, index) => (
        <div
          key={index}
          className="flex items-center gap-1.5"
          style={{ paddingLeft: row.indent * OUTLINER_INDENT_PX }}
        >
          <Skeleton className="h-3 w-3 shrink-0 rounded-sm" />
          <Skeleton className="h-3.5 w-3.5 shrink-0 rounded-sm" />
          <Skeleton className="h-3 rounded-sm" style={{ width: row.width }} />
        </div>
      ))}
    </div>
  );
}

interface SceneOutlinerProps {
  root: StageTreeNode | null;
  /** When true and no tree is ready yet, show a skeleton placeholder. */
  isLoading?: boolean;
  /** Page-level primary selection (viewport / placement); kept in sync with the outliner store. */
  primarySelectedNodeId?: string | null;
  onSelect: (id: string | null, opts?: { ctrl?: boolean; shift?: boolean }) => void;
  onDuplicate?: (ids: string[]) => void;
  onDelete?: (ids: string[]) => void;
  onPaste?: () => void;
  onFocusSelected?: () => void;
  onClearSelection?: () => void;
  onSelectAll?: (ids: string[]) => void;
  onGenerateHkt?: (ids: string[]) => void;
  onReplaceHkt?: (id: string) => void;
  onGenerateHktFromModel?: (id: string) => void;
  onReorderRootChild?: (activeId: string, overId: string) => void;
  onOpenProperties?: (nodeId: string) => void;
  onExportDae?: (nodeId: string) => void;
  onReplaceModel?: (nodeId: string) => void;
}

export function SceneOutliner({
  root,
  isLoading = false,
  primarySelectedNodeId = null,
  onSelect,
  onDuplicate,
  onDelete,
  onPaste,
  onFocusSelected,
  onClearSelection,
  onSelectAll,
  onGenerateHkt,
  onReplaceHkt,
  onGenerateHktFromModel,
  onReorderRootChild,
  onOpenProperties,
  onExportDae,
  onReplaceModel,
}: SceneOutlinerProps) {
  const { t } = useTranslation("scene-root-b");
  const {
    selectedIds,
    selectAll,
    deselectAll,
    groups,
    createGroup,
    removeGroup,
    toggleGroupCollapse,
    toggleVisibility,
    isVisible,
    toggleLock,
    isLocked,
    copyToClipboard,
    clipboard,
  } = useSceneEditorStore();

  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setExpandedById({});
  }, [root]);

  const getNodeExpanded = useCallback(
    (nodeId: string, depth: number) =>
      nodeId in expandedById ? expandedById[nodeId] : depth < 2,
    [expandedById],
  );

  const toggleNodeExpanded = useCallback((nodeId: string, depth: number) => {
    setExpandedById((prev) => {
      const current = nodeId in prev ? prev[nodeId] : depth < 2;
      return { ...prev, [nodeId]: !current };
    });
  }, []);

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

  const flatRows = useMemo(() => {
    if (!root) return [];
    return flattenSceneOutliner({ root, groups, expandedById });
  }, [root, groups, expandedById]);

  useEffect(() => {
    if (!root || !primarySelectedNodeId) return;
    const revealId = resolveOutlinerRevealNodeId(root, primarySelectedNodeId);
    if (!revealId) return;
    const ancestors = findOutlinerAncestorIds(root, revealId);
    if (ancestors.length === 0) return;
    setExpandedById((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const id of ancestors) {
        if (next[id] !== true) {
          next[id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [primarySelectedNodeId, root]);

  const outlinerScrollToKey = useMemo(() => {
    if (!root || !primarySelectedNodeId) return null;
    const revealId = resolveOutlinerRevealNodeId(root, primarySelectedNodeId);
    for (const row of flatRows) {
      if (row.kind === "group-child" || row.kind === "node" || row.kind === "root") {
        if (row.node.id === revealId) return row.key;
      }
    }
    return null;
  }, [flatRows, primarySelectedNodeId, root]);

  const handleNodeClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      onSelect(id, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
    },
    [onSelect],
  );

  const handleSelectAll = useCallback(() => {
    selectAll(allNodeIds);
    onSelectAll?.(allNodeIds);
  }, [selectAll, allNodeIds, onSelectAll]);

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

  const renderFlatRow = useCallback(
    (row: OutlinerFlatRow) => {
      if (!root) return null;

      const content = (() => {
        switch (row.kind) {
          case "group-header":
            return (
              <GroupHeaderRow
                group={row.group}
                toggleGroupCollapse={toggleGroupCollapse}
                removeGroup={removeGroup}
                onDelete={onDelete}
              />
            );
          case "group-child":
            return (
              <div className="ml-3 h-full border-l border-amber-500/20 pl-1">
                <OutlinerNodeRow
                  node={row.node}
                  depth={row.depth}
                  selectedIds={selectedIds}
                  primarySelectedNodeId={primarySelectedNodeId}
                  onNodeClick={handleNodeClick}
                  isVisible={isVisible}
                  toggleVisibility={toggleVisibility}
                  isLocked={isLocked}
                  toggleLock={toggleLock}
                  onDuplicate={onDuplicate}
                  onDelete={onDelete}
                  onGenerateHkt={onGenerateHkt}
                  onReplaceHkt={onReplaceHkt}
                  onGenerateHktFromModel={onGenerateHktFromModel}
                  onOpenProperties={onOpenProperties}
                  onExportDae={onExportDae}
                  onReplaceModel={onReplaceModel}
                />
              </div>
            );
          case "root":
            return (
              <RootOutlinerRow
                node={row.node}
                depth={row.depth}
                hasChildren={row.hasChildren}
                expanded={getNodeExpanded(row.node.id, row.depth)}
                onToggle={() => toggleNodeExpanded(row.node.id, row.depth)}
              />
            );
          case "node":
            return (
              <OutlinerNodeRow
                node={row.node}
                depth={row.depth}
                selectedIds={selectedIds}
                primarySelectedNodeId={primarySelectedNodeId}
                onNodeClick={handleNodeClick}
                isVisible={isVisible}
                toggleVisibility={toggleVisibility}
                isLocked={isLocked}
                toggleLock={toggleLock}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
                onGenerateHkt={onGenerateHkt}
                onReplaceHkt={onReplaceHkt}
                onGenerateHktFromModel={onGenerateHktFromModel}
                onReorderRootChild={onReorderRootChild}
                onOpenProperties={onOpenProperties}
                onExportDae={onExportDae}
                onReplaceModel={onReplaceModel}
                hasChildren={row.hasChildren}
                expanded={getNodeExpanded(row.node.id, row.depth)}
                onToggle={() => toggleNodeExpanded(row.node.id, row.depth)}
              />
            );
          default:
            return null;
        }
      })();

      return <div className="h-full min-h-0 overflow-hidden">{content}</div>;
    },
    [
      root,
      selectedIds,
      primarySelectedNodeId,
      handleNodeClick,
      isVisible,
      toggleVisibility,
      isLocked,
      toggleLock,
      onDuplicate,
      onDelete,
      onGenerateHkt,
      onReplaceHkt,
      onGenerateHktFromModel,
      onReorderRootChild,
      onOpenProperties,
      onExportDae,
      onReplaceModel,
      toggleGroupCollapse,
      removeGroup,
      getNodeExpanded,
      toggleNodeExpanded,
    ],
  );

  if (!root) {
    if (isLoading) {
      return <OutlinerSkeleton />;
    }
    return (
      <div className="flex min-w-0 w-full max-w-full flex-col items-center justify-center h-full text-muted-foreground p-4 gap-3">
        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center shrink-0">
          <FolderOpen className="h-5 w-5 opacity-40" />
        </div>
        <div className="text-center space-y-1 min-w-0 w-full px-1">
        <p className="text-xs font-medium break-words">{t("outliner.noStage")}</p>
          <p className="text-[10px] opacity-60 leading-relaxed break-words">
            {t("outliner.emptyHint")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="h-full min-h-0">
          <VirtualizedList
            items={flatRows}
            rowHeight={OUTLINER_ROW_HEIGHT}
            getItemKey={(row) => row.key}
            className="h-full min-h-0 overflow-auto p-1"
            scrollToKey={outlinerScrollToKey}
            renderRow={renderFlatRow}
          />
        </div>
      </ContextMenuTrigger>
      <EditorContextMenuContent>
        <EditorContextMenuItem onSelect={handleSelectAll}>
          <span className="flex-1">{t("outliner.selectAll")}</span>
          <ContextMenuShortcut data-i18n-ignore="">Ctrl+A</ContextMenuShortcut>
        </EditorContextMenuItem>
        <EditorContextMenuItem
          onSelect={() => {
            deselectAll();
            onClearSelection?.();
          }}
        >
          <span className="flex-1">{t("outliner.deselectAll")}</span>
          <ContextMenuShortcut data-i18n-ignore="">Esc</ContextMenuShortcut>
        </EditorContextMenuItem>
        <ContextMenuSeparator />
        <EditorContextMenuItem onSelect={handleCopy} disabled={selectedIds.size === 0}>
          <Copy className={editorContextMenuIconClassName} />
          <span className="flex-1">{t("outliner.copy")}</span>
          <ContextMenuShortcut data-i18n-ignore="">Ctrl+C</ContextMenuShortcut>
        </EditorContextMenuItem>
        <EditorContextMenuItem onSelect={handleDuplicate} disabled={selectedIds.size === 0}>
          <Clipboard className={editorContextMenuIconClassName} />
          <span className="flex-1">{t("outliner.duplicate")}</span>
          <ContextMenuShortcut data-i18n-ignore="">Ctrl+D</ContextMenuShortcut>
        </EditorContextMenuItem>
        <EditorContextMenuItem onSelect={onPaste} disabled={clipboard.length === 0}>
          <Clipboard className={editorContextMenuIconClassName} />
          <span className="flex-1">{t("outliner.paste")}</span>
          <ContextMenuShortcut data-i18n-ignore="">Ctrl+V</ContextMenuShortcut>
        </EditorContextMenuItem>
        <EditorContextMenuItem
          onSelect={handleDeleteSelected}
          disabled={selectedIds.size === 0}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className={editorContextMenuIconClassName} />
          <span className="flex-1">{t("outliner.delete")}</span>
          <ContextMenuShortcut data-i18n-ignore="">Del</ContextMenuShortcut>
        </EditorContextMenuItem>
        <ContextMenuSeparator />
        <EditorContextMenuItem onSelect={handleGroup} disabled={selectedIds.size < 2}>
          <FolderPlus className={editorContextMenuIconClassName} />
          <span className="flex-1">{t("outliner.groupSelected")}</span>
          <ContextMenuShortcut data-i18n-ignore="">Ctrl+G</ContextMenuShortcut>
        </EditorContextMenuItem>
        <ContextMenuSeparator />
        <EditorContextMenuItem onSelect={onFocusSelected} disabled={selectedIds.size === 0}>
          <span className="flex-1">{t("outliner.focusSelected")}</span>
          <ContextMenuShortcut data-i18n-ignore="">F</ContextMenuShortcut>
        </EditorContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger className="flex items-center gap-2">
            <Eye className={editorContextMenuIconClassName} />
            <span>{t("outliner.visibility")}</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="min-w-[11rem]">
            <EditorContextMenuItem
              onSelect={() =>
                selectedIds.forEach((id) => useSceneEditorStore.getState().setVisibility(id, true))
              }
            >
              {t("outliner.showSelected")}
            </EditorContextMenuItem>
            <EditorContextMenuItem
              onSelect={() =>
                selectedIds.forEach((id) => useSceneEditorStore.getState().setVisibility(id, false))
              }
            >
              {t("outliner.hideSelected")}
            </EditorContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      </EditorContextMenuContent>
    </ContextMenu>
  );
}

function GroupHeaderRow({
  group,
  toggleGroupCollapse,
  removeGroup,
  onDelete,
}: {
  group: OutlinerGroup;
  toggleGroupCollapse: (id: string) => void;
  removeGroup: (id: string) => void;
  onDelete?: (ids: string[]) => void;
}) {
  const { t } = useTranslation("scene-root-b");
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "flex h-full items-center gap-1.5 px-1.5 rounded-sm cursor-pointer text-xs select-none transition-colors",
            "hover:bg-accent/60 bg-accent/20",
          )}
          onContextMenu={stopEditorContextMenuBubble}
        >
          <button
            type="button"
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
      </ContextMenuTrigger>
    <EditorContextMenuContent>
      <EditorContextMenuItem onSelect={() => removeGroup(group.id)}>
        <Ungroup className={editorContextMenuIconClassName} />
        <span>{t("outliner.ungroup")}</span>
      </EditorContextMenuItem>
      <ContextMenuSeparator />
      <EditorContextMenuItem
        onSelect={() => onDelete?.(group.children)}
        className="text-destructive focus:text-destructive"
      >
        <Trash2 className={editorContextMenuIconClassName} />
        <span>{t("outliner.deleteAllInGroup")}</span>
      </EditorContextMenuItem>
    </EditorContextMenuContent>
    </ContextMenu>
  );
}

function RootOutlinerRow({
  node,
  depth,
  hasChildren,
  expanded,
  onToggle,
}: {
  node: StageTreeNode;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation("scene-root-b");
  const row = (
    <div
      className="flex h-full items-center gap-1.5 px-1.5 text-xs select-none text-muted-foreground hover:bg-accent/40 rounded-sm"
      style={{ paddingLeft: `${depth * OUTLINER_INDENT_PX + 4}px` }}
      onContextMenu={stopEditorContextMenuBubble}
    >
      {hasChildren && (
        <button
          type="button"
          className="h-4 w-4 flex items-center justify-center shrink-0 hover:bg-accent rounded-sm"
          onClick={onToggle}
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
      )}
      <Layers className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate font-semibold">{node.label}</span>
    </div>
  );

  if (!hasChildren) {
    return row;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <EditorContextMenuContent>
        <EditorContextMenuItem onSelect={onToggle}>
          {expanded ? (
            <ChevronDown className={editorContextMenuIconClassName} />
          ) : (
            <ChevronRight className={editorContextMenuIconClassName} />
          )}
          <span>{expanded ? t("outliner.collapse") : t("outliner.expand")}</span>
        </EditorContextMenuItem>
      </EditorContextMenuContent>
    </ContextMenu>
  );
}

function OutlinerNodeRow({
  node,
  depth,
  selectedIds,
  primarySelectedNodeId,
  onNodeClick,
  isVisible,
  toggleVisibility,
  isLocked,
  toggleLock,
  onDuplicate,
  onDelete,
  onGenerateHkt,
  onReplaceHkt,
  onGenerateHktFromModel,
  onReorderRootChild,
  onOpenProperties,
  onExportDae,
  onReplaceModel,
  hasChildren,
  expanded,
  onToggle,
}: {
  node: StageTreeNode;
  depth: number;
  selectedIds: Set<string>;
  primarySelectedNodeId: string | null;
  onNodeClick: (id: string, e: React.MouseEvent) => void;
  isVisible: (id: string) => boolean;
  toggleVisibility: (id: string) => void;
  isLocked: (id: string) => boolean;
  toggleLock: (id: string) => void;
  onDuplicate?: (ids: string[]) => void;
  onDelete?: (ids: string[]) => void;
  onGenerateHkt?: (ids: string[]) => void;
  onReplaceHkt?: (id: string) => void;
  onGenerateHktFromModel?: (id: string) => void;
  onReorderRootChild?: (activeId: string, overId: string) => void;
  onOpenProperties?: (nodeId: string) => void;
  onExportDae?: (nodeId: string) => void;
  onReplaceModel?: (nodeId: string) => void;
  hasChildren?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const isSelected = isOutlinerNodeSelected(node.id, selectedIds, primarySelectedNodeId);
  const visible = isVisible(node.id);
  const locked = isLocked(node.id);
  const RoleIcon = getRoleIcon(node.role);
  const canReorder = depth === 1 && Boolean(onReorderRootChild);
  const validationErrorCount = useSceneValidationStore(
    (s) => s.errorFolders[node.id] ?? 0,
  );
  const hasValidationError = validationErrorCount > 0;
  const { t } = useTranslation("scene-root-b");

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "flex h-full items-center gap-1 px-1.5 rounded-sm cursor-pointer text-xs select-none transition-colors group/row",
            "hover:bg-accent/60",
            isSelected && "bg-primary/15 text-primary ring-1 ring-primary/20",
            !visible && "opacity-40",
          )}
          style={{ paddingLeft: `${depth * OUTLINER_INDENT_PX + 4}px` }}
          onContextMenu={stopEditorContextMenuBubble}
          onClick={(e) => onNodeClick(node.id, e)}
          draggable={canReorder}
          onDragStart={(event) => {
            if (!canReorder) return;
            event.dataTransfer.setData("text/plain", node.id);
            event.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(event) => {
            if (!canReorder) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            if (!canReorder || !onReorderRootChild) return;
            event.preventDefault();
            event.stopPropagation();
            const activeId = event.dataTransfer.getData("text/plain");
            if (activeId && activeId !== node.id) {
              onReorderRootChild(activeId, node.id);
            }
          }}
        >
          {canReorder ? (
            <span
              className="flex h-4 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground/70 active:cursor-grabbing"
              title={t("outliner.dragToReorder")}
              aria-hidden
            >
              <GripVertical className="h-3 w-3" />
            </span>
          ) : hasChildren ? (
            <button
              type="button"
              className="h-4 w-4 flex items-center justify-center shrink-0 hover:bg-accent rounded-sm"
              onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          ) : (
            <span className="h-4 w-4 shrink-0" />
          )}
          <RoleIcon className={cn("h-3.5 w-3.5 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
          <span
            className={cn(
              "truncate font-medium flex-1",
              locked && "italic",
              hasValidationError && "text-destructive",
            )}
          >
            {node.label}
          </span>
          {hasValidationError && (
            <AlertTriangle
              className="h-3 w-3 shrink-0 text-destructive"
              aria-label={t("outliner.validationErrors", { count: validationErrorCount })}
            />
          )}
          <div
            className={cn(
              "flex items-center gap-0.5 transition-opacity",
              isSelected || !visible || locked ? "opacity-100" : "opacity-0 group-hover/row:opacity-100",
            )}
          >
            <button
              type="button"
              className="h-4 w-4 flex items-center justify-center rounded-sm hover:bg-accent"
              onClick={(e) => { e.stopPropagation(); toggleVisibility(node.id); }}
              title={visible ? t("outliner.hide") : t("outliner.show")}
              aria-label={visible ? t("outliner.hideNamed", { name: node.label }) : t("outliner.showNamed", { name: node.label })}
            >
              {visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3 text-muted-foreground" />}
            </button>
            <button
              type="button"
              className="h-4 w-4 flex items-center justify-center rounded-sm hover:bg-accent"
              onClick={(e) => { e.stopPropagation(); toggleLock(node.id); }}
              title={locked ? t("outliner.unlock") : t("outliner.lock")}
              aria-label={locked ? t("outliner.unlockNamed", { name: node.label }) : t("outliner.lockNamed", { name: node.label })}
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
      <NodeContextMenuContent
        node={node}
        visible={visible}
        locked={locked}
        toggleVisibility={toggleVisibility}
        toggleLock={toggleLock}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onGenerateHkt={onGenerateHkt}
        onReplaceHkt={onReplaceHkt}
        onGenerateHktFromModel={onGenerateHktFromModel}
        onOpenProperties={onOpenProperties}
        onExportDae={onExportDae}
        onReplaceModel={onReplaceModel}
      />
    </ContextMenu>
  );
}

function NodeContextMenuContent({
  node,
  visible,
  locked,
  toggleVisibility,
  toggleLock,
  onDuplicate,
  onDelete,
  onGenerateHkt,
  onReplaceHkt,
  onGenerateHktFromModel,
  onOpenProperties,
  onExportDae,
  onReplaceModel,
}: {
  node: StageTreeNode;
  visible: boolean;
  locked: boolean;
  toggleVisibility: (id: string) => void;
  toggleLock: (id: string) => void;
  onDuplicate?: (ids: string[]) => void;
  onDelete?: (ids: string[]) => void;
  onGenerateHkt?: (ids: string[]) => void;
  onReplaceHkt?: (id: string) => void;
  onGenerateHktFromModel?: (id: string) => void;
  onOpenProperties?: (nodeId: string) => void;
  onExportDae?: (nodeId: string) => void;
  onReplaceModel?: (nodeId: string) => void;
}) {
  const supportsHkt = (node.role === "imported_dae" || node.role === "collision" || node.role === "sub_model" || node.role === "base") && Boolean(onGenerateHkt);
  const supportsReplaceHkt = (node.role === "imported_dae" || node.role === "collision" || node.role === "sub_model" || node.role === "base") && Boolean(onReplaceHkt);
  const supportsGenerateHktFromModel = (node.role === "imported_dae" || node.role === "collision" || node.role === "sub_model" || node.role === "base") && Boolean(onGenerateHktFromModel);
  const isCollisionNode = node.role === "collision" && node.id.startsWith("__col__");
  const hktTargetId = isCollisionNode ? node.id.slice("__col__".length) : node.id;
  const supportsProperties = canOpenDetailView(node.role);
  const supportsExportDae = canExportNodeRoleToDae(node.role) && Boolean(onExportDae);
  const supportsReplaceModel = canReplaceModelNode(node) && Boolean(onReplaceModel);
  const { label: typeLabel, Icon: TypeIcon } = getNodeTypeInfo(node.role);
  const { t } = useTranslation("scene-root-b");

  return (
    <EditorContextMenuContent>
      {supportsProperties && (
        <>
          <EditorContextMenuItem onSelect={() => onOpenProperties?.(node.id)}>
            <Settings className={editorContextMenuIconClassName} />
            <span>{t("outliner.properties")}</span>
          </EditorContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}
      {supportsExportDae && (
        <>
          <EditorContextMenuItem onSelect={() => onExportDae!(node.id)}>
            <Download className={editorContextMenuIconClassName} />
            <span>{t("outliner.exportModel")}</span>
          </EditorContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}
      {supportsReplaceModel && (
        <>
          <EditorContextMenuItem onSelect={() => onReplaceModel!(node.id)}>
            <FolderSync className={editorContextMenuIconClassName} />
            <span>{t("outliner.replaceModel")}</span>
          </EditorContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}
      <EditorContextMenuItem
        onSelect={() => {
          const entries = [
            {
              nodeId: node.id,
              placementIdx: null,
              transform: {
                posX: 0,
                posY: 0,
                posZ: 0,
                rotX: 0,
                rotY: 0,
                rotZ: 0,
                scaleX: 1,
                scaleY: 1,
                scaleZ: 1,
              },
            },
          ];
          useSceneEditorStore.getState().copyToClipboard(entries);
        }}
      >
        <Copy className={editorContextMenuIconClassName} />
        <span className="flex-1">{t("outliner.copy")}</span>
        <ContextMenuShortcut data-i18n-ignore="">Ctrl+C</ContextMenuShortcut>
      </EditorContextMenuItem>
      <EditorContextMenuItem onSelect={() => onDuplicate?.([node.id])}>
        <Clipboard className={editorContextMenuIconClassName} />
        <span className="flex-1">{t("outliner.duplicateAsNew")}</span>
        <ContextMenuShortcut data-i18n-ignore="">Ctrl+D</ContextMenuShortcut>
      </EditorContextMenuItem>
      <ContextMenuSeparator />
      <EditorContextMenuItem onSelect={() => toggleVisibility(node.id)}>
        {visible ? (
          <EyeOff className={editorContextMenuIconClassName} />
        ) : (
          <Eye className={editorContextMenuIconClassName} />
        )}
        <span className="flex-1">{visible ? t("outliner.hide") : t("outliner.show")}</span>
        <ContextMenuShortcut data-i18n-ignore="">H</ContextMenuShortcut>
      </EditorContextMenuItem>
      <EditorContextMenuItem onSelect={() => toggleLock(node.id)}>
        {locked ? (
          <Unlock className={editorContextMenuIconClassName} />
        ) : (
          <Lock className={editorContextMenuIconClassName} />
        )}
        <span>{locked ? t("outliner.unlock") : t("outliner.lock")}</span>
      </EditorContextMenuItem>
      {supportsHkt && (
        <>
          <ContextMenuSeparator />
          <EditorContextMenuItem onSelect={() => onGenerateHkt!([hktTargetId])}>
            <Shield className={editorContextMenuIconClassName} />
            <span>{isCollisionNode ? t("outliner.regenerateHkt") : t("outliner.generateHkt")}</span>
          </EditorContextMenuItem>
        </>
      )}
      {supportsReplaceHkt && (
        <>
          {!supportsHkt && <ContextMenuSeparator />}
          <EditorContextMenuItem onSelect={() => onReplaceHkt!(hktTargetId)}>
            <Shield className={editorContextMenuIconClassName} />
            <span>{t("outliner.replaceHkt")}</span>
          </EditorContextMenuItem>
        </>
      )}
      {supportsGenerateHktFromModel && (
        <>
          {!supportsHkt && !supportsReplaceHkt && <ContextMenuSeparator />}
          <EditorContextMenuItem onSelect={() => onGenerateHktFromModel!(hktTargetId)}>
            <Sparkles className={editorContextMenuIconClassName} />
            <span>{t("outliner.generateHktFromModel")}</span>
          </EditorContextMenuItem>
        </>
      )}
      <ContextMenuSeparator />
      <EditorContextMenuItem
        onSelect={() => onDelete?.([node.id])}
        className="text-destructive focus:text-destructive"
      >
        <Trash2 className={editorContextMenuIconClassName} />
        <span className="flex-1">{t("outliner.delete")}</span>
        <ContextMenuShortcut data-i18n-ignore="">Del</ContextMenuShortcut>
      </EditorContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuLabel className="flex items-center gap-2 text-[11px] font-normal text-muted-foreground">
        <TypeIcon className={editorContextMenuIconClassName} />
        <span data-i18n-ignore="">{typeLabel}</span>
      </ContextMenuLabel>
    </EditorContextMenuContent>
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
    case "collision":
      return Shield;
    case "root":
      return Layers;
    default:
      return Box;
  }
}
