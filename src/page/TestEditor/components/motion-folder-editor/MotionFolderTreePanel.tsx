import { useCallback, useEffect, useRef, useState } from "react";
import { Tree, type NodeApi } from "react-arborist";
import { CustomTreeNode } from "@/components/CustomTreeNode";
import type { TreeDataItem } from "@/lib/utils";
import { motionTreeSearchMatch } from "./motionFolderEditorUtils";

type MotionFolderTreePanelProps = {
  treeData: TreeDataItem[];
  searchTerm: string;
  selectedKeys: Set<string>;
  focusedKey: string | null;
  onSelectionChange: (selectedKeys: Set<string>, focusedKey: string | null) => void;
};

export function MotionFolderTreePanel({
  treeData,
  searchTerm,
  selectedKeys,
  focusedKey,
  onSelectionChange,
}: MotionFolderTreePanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const treeRef = useRef<any>(null);
  const [treeHeight, setTreeHeight] = useState(480);
  const isUserClickRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const updateHeight = () => setTreeHeight(el.clientHeight || 480);
    updateHeight();

    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  const handleSelectChange = useCallback(
    (nodes: NodeApi<TreeDataItem>[]) => {
      isUserClickRef.current = true;
      const keys = new Set(nodes.map((node) => node.id));
      const focused = nodes.length > 0 ? (nodes[nodes.length - 1]?.id ?? null) : null;
      onSelectionChange(keys, focused);
    },
    [onSelectionChange],
  );

  useEffect(() => {
    if (isUserClickRef.current) {
      isUserClickRef.current = false;
      return;
    }
    const tree = treeRef.current;
    if (!tree) return;

    tree.deselectAll?.();
    const ids = [...selectedKeys];
    if (ids.length > 0) {
      tree.select?.(ids[0]);
      for (let index = 1; index < ids.length; index += 1) {
        tree.selectMulti?.(ids[index]);
      }
    }

    if (focusedKey) {
      tree.openParents?.(focusedKey);
      void tree.scrollTo?.(focusedKey, "center");
    }
  }, [focusedKey, selectedKeys, treeData]);

  return (
    <div ref={containerRef} className="h-full min-h-0 overflow-hidden border-r bg-background">
      {treeData.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">No motion structure entries.</p>
      ) : (
        <Tree
          ref={treeRef}
          data={treeData}
          width="100%"
          height={treeHeight}
          indent={0}
          rowHeight={36}
          openByDefault={false}
          disableDrag
          disableDrop
          disableEdit
          searchTerm={searchTerm}
          searchMatch={(node, term) => motionTreeSearchMatch(node.data, term)}
          onSelect={handleSelectChange}
        >
          {(props) => <CustomTreeNode {...props} mode="Motion" />}
        </Tree>
      )}
    </div>
  );
}
