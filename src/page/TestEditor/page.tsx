import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import MainView from "./components/MainView";
import InfoPanel from "./components/InfoPanel";
import { FolderChangePayload, TestTreeNode } from "./types";
import { FileTreePane } from "./components/FileTreePane";
import { useConfigStore } from "@/store/configStore";

const WATCH_EVENT = "test-editor:folder-change";
const WATCH_COMMAND = "watch_folder";
const TEST_EDITOR_FOLDER_STORE_KEY = "testEditorFolder";

type RawTreeNode = Partial<TestTreeNode> & {
  id: string;
  name: string;
  path: string;
  isDir?: boolean;
  is_dir?: boolean;
  children?: RawTreeNode[];
};

function normalizeNode(node: RawTreeNode): TestTreeNode {
  const isDir = node.isDir ?? node.is_dir ?? false;
  const children = node.children?.map(normalizeNode);
  return {
    id: node.id,
    name: node.name,
    path: node.path,
    isDir,
    children: isDir ? children ?? [] : undefined,
  };
}

function normalizeTree(nodes: RawTreeNode[] = []): TestTreeNode[] {
  return nodes.map(normalizeNode);
}

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
  if (payload.fullTree) return normalizeTree(payload.fullTree);
  if (!payload.ops) return current;

  return payload.ops.reduce((acc, op) => {
    if (op.type === "remove") {
      return removeNode(acc, op.node.id);
    }
    return upsertNode(acc, normalizeNode(op.node), op.parentId);
  }, current);
}

function filterTree(nodes: TestTreeNode[], term: string): TestTreeNode[] {
  if (!term) return nodes;
  const lower = term.toLowerCase();

  const walk = (items: TestTreeNode[], includeAll: boolean): TestTreeNode[] => {
    const next: TestTreeNode[] = [];
    for (const item of items) {
      const nameHit = item.name.toLowerCase().includes(lower);
      const childHits = item.children ? walk(item.children, includeAll || nameHit) : [];
      const hasChildHits = childHits.length > 0;
      if (nameHit || hasChildHits) {
        // If this node matches, keep all its children (unfiltered) for navigation; otherwise keep only matching descendants.
        const children = nameHit ? item.children ?? [] : childHits;
        next.push({ ...item, children, isLeaf: !item.isDir });
      }
    }
    return next;
  };

  return walk(nodes, false);
}

const TestEditorPage = () => {
  const getSetting = useConfigStore((s) => s.getSetting);
  const [treeData, setTreeData] = useState<TestTreeNode[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentDir, setCurrentDir] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedJsonPath, setSelectedJsonPath] = useState<string | null>(null);
  const [pendingJsonPath, setPendingJsonPath] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

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

  const loadFolder = useCallback(async (directoryPath: string) => {
    setIsLoading(true);
    try {
      setCurrentDir(directoryPath);
      const initial = await invoke<RawTreeNode[]>(WATCH_COMMAND, { path: directoryPath });
      setTreeData(normalizeTree(initial ?? []));
      setSelectedId(null);
    } catch (error) {
      console.error(error);
      toast.error("Failed to start folder watch");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const hydrate = async () => {
      const saved = await getSetting<string>(TEST_EDITOR_FOLDER_STORE_KEY);
      if (!saved) return;
      await loadFolder(saved);
    };

    hydrate();
  }, [getSetting, loadFolder]);

  const filteredData = useMemo(() => filterTree(treeData, searchTerm), [treeData, searchTerm]);
  const selectedNode = useMemo(() => findNode(treeData, selectedId), [treeData, selectedId]);

  const handleFileSelect = useCallback((node: TestTreeNode | null) => {
    if (!node || node.isDir) {
      setSelectedId(node?.id ?? null);
      return;
    }

    // Check if it's a JSON file
    if (!node.name.toLowerCase().endsWith('.json')) {
      setSelectedId(node.id);
      return;
    }

    // If there are unsaved changes, show dialog but don't change selection
    if (hasUnsavedChanges && selectedJsonPath !== node.path) {
      setPendingJsonPath(node.path);
      setShowUnsavedDialog(true);
      // Don't change selectedId - keep the current JSON file selected
      return;
    }

    // Load the JSON file
    setSelectedJsonPath(node.path);
    setSelectedId(node.id);
  }, [hasUnsavedChanges, selectedJsonPath]);

  const handleDiscardChanges = useCallback(() => {
    if (pendingJsonPath) {
      setSelectedJsonPath(pendingJsonPath);
      setHasUnsavedChanges(false);
      
      // Find and select the new JSON file node
      const findNodeByPath = (nodes: TestTreeNode[], path: string): TestTreeNode | null => {
        for (const node of nodes) {
          if (node.path === path) return node;
          if (node.children) {
            const found = findNodeByPath(node.children, path);
            if (found) return found;
          }
        }
        return null;
      };
      
      const newNode = findNodeByPath(treeData, pendingJsonPath);
      if (newNode) {
        setSelectedId(newNode.id);
      }
      
      setPendingJsonPath(null);
    }
    setShowUnsavedDialog(false);
  }, [pendingJsonPath, treeData]);

  const handleCancelSelection = useCallback(() => {
    setPendingJsonPath(null);
    setShowUnsavedDialog(false);
  }, []);

  return (
    <>
      <div className="h-full text-xs **:text-xs">
        <ResizablePanelGroup
          orientation="horizontal"
          className="h-full rounded-lg border bg-background"
        >
          <ResizablePanel defaultSize={"15%"} minSize={"10%"}>
          <div className="h-full p-2">
            <FileTreePane
              data={filteredData}
              onSelect={handleFileSelect}
              selectedId={selectedId}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              onPickFolder={loadFolder}
              folderStoreKey={TEST_EDITOR_FOLDER_STORE_KEY}
              isLoading={isLoading}
              currentDir={currentDir}
              currentJsonPath={selectedJsonPath}
              hasUnsavedChanges={hasUnsavedChanges}
            />
          </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={"45%"} minSize={"35%"}>
            <div className="h-full p-2 bg-gray-200">
              <MainView 
                jsonFilePath={selectedJsonPath}
                onUnsavedChanges={setHasUnsavedChanges}
              />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={"15%"} minSize={"10%"}>
            <div className="h-full p-2">
              <InfoPanel selected={selectedNode} />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes in the current file. Do you want to discard them and load the new file?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelSelection}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscardChanges}>Discard Changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default TestEditorPage;

