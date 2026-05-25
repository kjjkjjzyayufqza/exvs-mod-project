import { useState } from "react";
import { ChevronDown, ChevronRight, Bone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SkelDataJson, BoneJson } from "@/page/TestEditor/components/ssbh-model-preview/types";

type SkeletonReadonlyTabProps = {
  skel: unknown | null;
};

type BoneTreeNode = {
  bone: BoneJson;
  index: number;
  children: BoneTreeNode[];
};

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

function BoneTreeItem({ node, depth }: { node: BoneTreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-0.5 px-1 rounded text-xs hover:bg-muted/50",
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="h-4 w-4 shrink-0 flex items-center justify-center"
            onClick={() => setExpanded(!expanded)}
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
        <Bone className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="font-mono truncate">{node.bone.name}</span>
        <span className="ml-auto text-muted-foreground text-[10px]">#{node.index}</span>
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <BoneTreeItem key={child.index} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SkeletonReadonlyTab({ skel }: SkeletonReadonlyTabProps) {
  if (!skel) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        No skeleton data (.nusktb) available
      </div>
    );
  }

  const skelData = skel as SkelDataJson;
  const bones = skelData.bones ?? [];
  const tree = buildBoneTree(bones);

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground border-b pb-2">
        <span>Bone Count: {bones.length}</span>
      </div>
      <div className="max-h-[500px] overflow-auto">
        {tree.map((root) => (
          <BoneTreeItem key={root.index} node={root} depth={0} />
        ))}
      </div>
    </div>
  );
}
