import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Bone } from "lucide-react";
import { cn } from "@/lib/utils";
import { VirtualizedList } from "@/page/SceneEdit/components/VirtualizedList";
import type { SkelDataJson, BoneJson } from "@/page/TestEditor/components/ssbh-model-preview/types";

type SkeletonReadonlyTabProps = {
  skel: unknown | null;
};

type BoneTreeNode = {
  bone: BoneJson;
  index: number;
  children: BoneTreeNode[];
};

type FlatBoneRow = {
  node: BoneTreeNode;
  depth: number;
};

const ROW_HEIGHT = 20;
const INDENT_PX = 16;

function buildBoneTree(bones: BoneJson[]): BoneTreeNode[] {
  const nodes: BoneTreeNode[] = bones.map((bone, index) => ({ bone, index, children: [] }));
  const roots: BoneTreeNode[] = [];
  for (const node of nodes) {
    if (node.bone.parent_index === null || node.bone.parent_index < 0) {
      roots.push(node);
    } else if (nodes[node.bone.parent_index]) {
      nodes[node.bone.parent_index].children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function rootExpandedIndices(tree: BoneTreeNode[]): Set<number> {
  return new Set(tree.map((root) => root.index));
}

function flattenVisibleBones(
  nodes: BoneTreeNode[],
  depth: number,
  expandedIndices: Set<number>,
  result: FlatBoneRow[],
): void {
  for (const node of nodes) {
    result.push({ node, depth });
    if (node.children.length > 0 && expandedIndices.has(node.index)) {
      flattenVisibleBones(node.children, depth + 1, expandedIndices, result);
    }
  }
}

export function SkeletonReadonlyTab({ skel }: SkeletonReadonlyTabProps) {
  const skelData = skel as SkelDataJson | null;
  const bones = skelData?.bones ?? [];
  const tree = useMemo(() => buildBoneTree(bones), [bones]);
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(() =>
    rootExpandedIndices(tree),
  );

  useEffect(() => {
    setExpandedIndices(rootExpandedIndices(tree));
  }, [tree]);

  const visibleRows = useMemo(() => {
    const rows: FlatBoneRow[] = [];
    flattenVisibleBones(tree, 0, expandedIndices, rows);
    return rows;
  }, [tree, expandedIndices]);

  const toggleExpanded = useCallback((index: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const renderRow = useCallback(
    (row: FlatBoneRow) => {
      const { node, depth } = row;
      const hasChildren = node.children.length > 0;
      const isExpanded = expandedIndices.has(node.index);

      return (
        <div
          className={cn(
            "flex h-full items-center gap-1 px-1 rounded text-xs hover:bg-muted/50",
          )}
          style={{ paddingLeft: `${depth * INDENT_PX + 4}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              className="h-4 w-4 shrink-0 flex items-center justify-center"
              onClick={() => toggleExpanded(node.index)}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          ) : (
            <span className="h-4 w-4 shrink-0" />
          )}
          <Bone className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="font-mono truncate">{node.bone.name}</span>
          <span className="ml-auto text-muted-foreground text-[10px]">#{node.index}</span>
        </div>
      );
    },
    [expandedIndices, toggleExpanded],
  );

  const getItemKey = useCallback((row: FlatBoneRow) => row.node.index, []);

  if (!skel) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        No skeleton data (.nusktb) available
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground border-b pb-2">
        <span>Bone Count: {bones.length}</span>
      </div>
      <VirtualizedList
        items={visibleRows}
        rowHeight={ROW_HEIGHT}
        getItemKey={getItemKey}
        renderRow={renderRow}
        className="max-h-[500px] overflow-auto"
      />
    </div>
  );
}
