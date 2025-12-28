import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import EmptyStage from "./components/EmptyStage";
import InfoPanel from "./components/InfoPanel";
import { FolderChangePayload, TestTreeNode } from "./types";
import { FileTreePane } from "./components/FileTreePane";

const WATCH_EVENT = "test-editor:folder-change";
const WATCH_COMMAND = "watch_folder";

function findNode(nodes: TestTreeNode[], id: string | null): TestTreeNode | null {
  if (!id) return null;
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const child = findNode(node.children, id);
      if (child) return child;
    }
  }
  return null;
}

function removeNode(nodes: TestTreeNode[], targetId: string): TestTreeNode[] {
  let changed = false;
  const filtered = nodes
    .map((node) => {
      if (node.id === targetId) {
        changed = true;
        return null;
      }
      if (node.children) {
        const nextChildren = removeNode(node.children, targetId);
        if (nextChildren !== node.children) {
          changed = true;
          return { ...node, children: nextChildren };
        }
      }
      return node;
    })
    .filter(Boolean) as TestTreeNode[];
  return changed ? filtered : nodes;
}

function upsertNode(nodes: TestTreeNode[], incoming: TestTreeNode, parentId?: string): TestTreeNode[] {
  if (!parentId) {
    const existingIndex = nodes.findIndex((n) => n.id === incoming.id);
    if (existingIndex >= 0) {
      const next = [...nodes];
      next[existingIndex] = incoming;
      return next;
    }
    return [...nodes, incoming];
  }

  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (node.id === parentId) {
      const children = node.children ? [...node.children] : [];
      const idx = children.findIndex((c) => c.id === incoming.id);
      if (idx >= 0) {
        children[idx] = incoming;
      } else {
        children.push(incoming);
      }
      changed = true;
      return { ...node, children };
    }
    if (node.children) {
      const nextChildren = upsertNode(node.children, incoming, parentId);
      if (nextChildren !== node.children) {
        changed = true;
        return { ...node, children: nextChildren };
      }
    }
    return node;
  });

  return changed ? nextNodes : nodes;
}

function applyPayload(current: TestTreeNode[], payload?: FolderChangePayload): TestTreeNode[] {
  if (!payload) return current;
  if (payload.fullTree) return payload.fullTree;
  if (!payload.ops) return current;

  return payload.ops.reduce((acc, op) => {
    if (op.type === "remove") {
      return removeNode(acc, op.node.id);
    }
    return upsertNode(acc, op.node, op.parentId);
  }, current);
}

function filterTree(nodes: TestTreeNode[], term: string): TestTreeNode[] {
  if (!term) return nodes;
  const lower = term.toLowerCase();

  const walk = (items: TestTreeNode[]): TestTreeNode[] => {
    const next: TestTreeNode[] = [];
    for (const item of items) {
      const nameHit = item.name.toLowerCase().includes(lower);
      const childHits = item.children ? walk(item.children) : [];
      if (nameHit || childHits.length > 0) {
        // Preserve leaf-ness: files should not get empty children arrays that make them expandable.
        const children =
          item.isDir && childHits.length === 0 ? [] : childHits.length > 0 ? childHits : undefined;
        next.push({ ...item, children });
      }
    }
    return next;
  };

  return walk(nodes);
}

const TestEditorPage = () => {
  const [treeData, setTreeData] = useState<TestTreeNode[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentDir, setCurrentDir] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const setup = async () => {
      unlisten = await listen<FolderChangePayload>(WATCH_EVENT, (event) => {
        setTreeData((prev) => applyPayload(prev, event.payload));
      });
    };

    setup();

    return () => {
      unlisten?.();
    };
  }, []);

  const handlePickFolder = useCallback(async () => {
    setIsLoading(true);
    try {
      const selected = await open({ directory: true, multiple: false });
      if (!selected) return;

      const directoryPath = Array.isArray(selected) ? selected[0] : selected;
      setCurrentDir(directoryPath);
      const initial = await invoke<TestTreeNode[]>(WATCH_COMMAND, { path: directoryPath });
      setTreeData(initial ?? []);
      setSelectedId(null);
    } catch (error) {
      console.error(error);
      toast.error("Failed to start folder watch");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const filteredData = useMemo(() => filterTree(treeData, searchTerm), [treeData, searchTerm]);
  const selectedNode = useMemo(() => findNode(treeData, selectedId), [treeData, selectedId]);

  return (
    <div>
      <ResizablePanelGroup
        orientation="horizontal"
        className="h-full rounded-lg border bg-background"
      >
        <ResizablePanel defaultSize={"25%"} minSize={"20%"}>
          <div className="h-full p-2">
            <FileTreePane
              data={filteredData}
              onSelect={(node) => setSelectedId(node?.id ?? null)}
              selectedId={selectedId}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              onPickFolder={handlePickFolder}
              isLoading={isLoading}
              currentDir={currentDir}
            />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={"50%"} minSize={"35%"}>
          <div className="h-full p-2">
            <EmptyStage />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={"25%"} minSize={"20%"}>
          <div className="h-full p-2">
            <InfoPanel selected={selectedNode} />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default TestEditorPage;

