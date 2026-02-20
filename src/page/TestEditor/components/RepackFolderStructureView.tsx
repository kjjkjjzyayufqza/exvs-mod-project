import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { Tree, type NodeApi } from "react-arborist";
import { Plus, Save } from "lucide-react";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { CustomTreeNode } from "@/components/CustomTreeNode";
import { NodePropertiesPanel } from "@/page/Repack/components/NodePropertiesPanel";
import type { TreeDataItem } from "@/lib/utils";
import { useRepackStore } from "@/store/repackStore";
import { convertSubFileStructureToTreeData } from "@/lib/utils";

type CreateArgs = { parentId: string | null; index: number; type: string };
type MoveArgs = { dragIds: string[]; parentId: string | null; index: number };
type RenameArgs = { id: string; name: string };
type DeleteArgs = { ids: string[] };

function updateFolderCount(node: TreeDataItem): TreeDataItem {
  if (node.data?.type !== "Folder") return node;
  const nextCount = node.children?.length ?? 0;
  return {
    ...node,
    data: {
      ...node.data,
      folderCount: nextCount,
    },
  };
}

function insertAt<T>(arr: T[], index: number, ...items: T[]): T[] {
  const next = [...arr];
  const safeIndex = Math.max(0, Math.min(index, next.length));
  next.splice(safeIndex, 0, ...items);
  return next;
}

function removeNodesById(nodes: TreeDataItem[], ids: Set<string>): { remaining: TreeDataItem[]; removed: TreeDataItem[] } {
  const removed: TreeDataItem[] = [];

  const walk = (items: TreeDataItem[]): TreeDataItem[] => {
    const next: TreeDataItem[] = [];
    for (const item of items) {
      if (ids.has(item.id)) {
        removed.push(item);
        continue;
      }

      if (item.children && item.children.length > 0) {
        const nextChildren = walk(item.children);
        const childrenChanged = nextChildren !== item.children;
        if (childrenChanged) {
          next.push(updateFolderCount({ ...item, children: nextChildren }));
        } else {
          next.push(item);
        }
      } else {
        next.push(item);
      }
    }
    return next;
  };

  const remaining = walk(nodes);
  return { remaining, removed };
}

function insertNodes(nodes: TreeDataItem[], targetParentId: string | null, index: number, toInsert: TreeDataItem[]): TreeDataItem[] {
  if (targetParentId === null) {
    return insertAt(nodes, index, ...toInsert);
  }

  let changed = false;
  const walk = (items: TreeDataItem[]): TreeDataItem[] => {
    return items.map((item) => {
      if (item.id === targetParentId) {
        const children = item.children ?? [];
        const nextChildren = insertAt(children, index, ...toInsert);
        changed = true;
        return updateFolderCount({ ...item, children: nextChildren });
      }
      if (item.children && item.children.length > 0) {
        const nextChildren = walk(item.children);
        if (nextChildren !== item.children) {
          changed = true;
          return updateFolderCount({ ...item, children: nextChildren });
        }
      }
      return item;
    });
  };

  const nextNodes = walk(nodes);
  return changed ? nextNodes : nodes;
}

function updateNode(nodes: TreeDataItem[], nodeId: string, updater: (node: TreeDataItem) => TreeDataItem): TreeDataItem[] {
  let changed = false;
  const walk = (items: TreeDataItem[]): TreeDataItem[] => {
    return items.map((item) => {
      if (item.id === nodeId) {
        changed = true;
        return updater(item);
      }
      if (item.children && item.children.length > 0) {
        const nextChildren = walk(item.children);
        if (nextChildren !== item.children) {
          changed = true;
          return updateFolderCount({ ...item, children: nextChildren });
        }
      }
      return item;
    });
  };
  const next = walk(nodes);
  return changed ? next : nodes;
}

function findNode(nodes: TreeDataItem[], id: string | null): TreeDataItem | null {
  if (!id) return null;
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const hit = findNode(node.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

const DEFAULT_TREE_DATA: TreeDataItem[] = [

];

interface RepackFolderStructureViewProps {
  jsonFilePath?: string | null;
  onUnsavedChanges?: (hasChanges: boolean) => void;
}

export default function RepackFolderStructureView({ 
  jsonFilePath = null,
  onUnsavedChanges
}: RepackFolderStructureViewProps) {
  const {
    treeData,
    setTreeData,
    selectedItem,
    setSelectedItem,
    copiedItem,
    pasteNode,
    getMaxAvailableIndex,
    getMaxAvailableFileIndex,
    recalculateIndices,
    completeProjectData,
    setCompleteProjectData,
    exportProjectData,
  } = useRepackStore();

  const treeRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [treeHeight, setTreeHeight] = useState(480);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [loadedFilePath, setLoadedFilePath] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const updateHeight = () => setTreeHeight(el.clientHeight || 480);
    updateHeight();

    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (treeData.length > 0) return;
    setTreeData(DEFAULT_TREE_DATA);
    setSelectedItem(DEFAULT_TREE_DATA[0] ?? null);
  }, [setSelectedItem, setTreeData, treeData.length]);

  // Load JSON file when jsonFilePath changes
  useEffect(() => {
    if (!jsonFilePath) return;
    if (loadedFilePath === jsonFilePath) return;

    const loadJsonFile = async () => {
      try {
        const jsonContent = await readTextFile(jsonFilePath);
        const parsedData = JSON.parse(jsonContent);

        let convertedData: TreeDataItem[] = [];

        // Check if it's a valid repack JSON structure
        if (parsedData.SubFileStructure && Array.isArray(parsedData.SubFileStructure)) {
          // Validate required fields
          if (parsedData.Magic === undefined || parsedData.Magic === null) {
            throw new Error('Missing required field: Magic');
          }
          if (parsedData.Fhm2dTotalCount === undefined || parsedData.Fhm2dTotalCount === null) {
            throw new Error('Missing required field: Fhm2dTotalCount');
          }
          if (parsedData.UnkCount === undefined || parsedData.UnkCount === null) {
            throw new Error('Missing required field: UnkCount');
          }
          if (!parsedData.SubFileData || !Array.isArray(parsedData.SubFileData)) {
            throw new Error('Missing or invalid SubFileData array');
          }

          // Store complete project data
          setCompleteProjectData({
            Magic: parsedData.Magic,
            Fhm2dTotalCount: parsedData.Fhm2dTotalCount,
            UnkCount: parsedData.UnkCount,
            SubFileData: parsedData.SubFileData,
            SubFileStructure: parsedData.SubFileStructure,
            SubFileParseStructure: parsedData.SubFileParseStructure
          });

          // Convert SubFileStructure to tree format
          convertedData = convertSubFileStructureToTreeData(
            parsedData.SubFileStructure,
            parsedData.SubFileData || []
          );

          if (convertedData.length > 0) {
            setTreeData(convertedData);
            setSelectedItem(null);
            setLoadedFilePath(jsonFilePath);
            setHasUnsavedChanges(false);
            toast.success(`Loaded JSON file: ${jsonFilePath.split(/[\\/]/).pop()}`);
          } else {
            toast.error("No valid tree data found in the selected file");
          }
        } else {
          toast.error("No valid SubFileStructure found in the selected file");
        }
      } catch (error) {
        console.error("Error loading JSON file:", error);
        toast.error("Failed to load JSON file: " + (error as Error).message);
      }
    };

    loadJsonFile();
  }, [jsonFilePath, loadedFilePath, setCompleteProjectData, setTreeData, setSelectedItem]);

  // Notify parent about unsaved changes
  useEffect(() => {
    if (onUnsavedChanges) {
      onUnsavedChanges(hasUnsavedChanges);
    }
  }, [hasUnsavedChanges, onUnsavedChanges]);

  const handleSave = useCallback(async () => {
    if (!loadedFilePath) {
      toast.error("No file loaded to save");
      return;
    }

    if (!completeProjectData) {
      toast.error("No data to save");
      return;
    }

    setIsSaving(true);
    try {
      const exportData = exportProjectData();
      
      if (!exportData) {
        toast.error("Failed to export project data");
        return;
      }

      // Create JSON string with proper formatting
      const jsonString = JSON.stringify(exportData, null, 2);

      // Write to the loaded file path
      await writeTextFile(loadedFilePath, jsonString);

      // Reset unsaved changes state
      setHasUnsavedChanges(false);
      
      const fileName = loadedFilePath.split(/[\\/]/).pop();
      toast.success(`Successfully saved: ${fileName}`);
    } catch (error) {
      console.error("Error saving file:", error);
      toast.error("Failed to save file: " + (error as Error).message);
    } finally {
      setIsSaving(false);
    }
  }, [loadedFilePath, completeProjectData, exportProjectData]);

  // Handle Ctrl+S / Cmd+S keyboard shortcut for saving
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasUnsavedChanges && loadedFilePath) {
          handleSave();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasUnsavedChanges, loadedFilePath, handleSave]);

  const selection = useMemo(() => selectedItem?.id ?? undefined, [selectedItem?.id]);

  const handleSelectChange = (nodes: NodeApi<TreeDataItem>[]) => {
    setSelectedItem(nodes[0]?.data ?? null);
  };

  const handleCreate = ({ parentId, index, type }: CreateArgs) => {
    const nodeType = type === "folder" ? "Folder" : "Item";
    const newId = uuidv4();
    const newIndex = nodeType === "Item" ? getMaxAvailableIndex() : index;
    const newFileIndex = nodeType === "Item" ? getMaxAvailableFileIndex() : undefined;
    const newName = nodeType === "Folder" ? "New Folder" : "New File.bin";

    const newNode: TreeDataItem = {
      id: newId,
      name: newName,
      children: nodeType === "Folder" ? [] : undefined,
      data: {
        type: nodeType,
        index: newIndex,
        fileType: nodeType === "Item" ? ".bin" : undefined,
        fileIndex: newFileIndex,
        fileUrl: nodeType === "Item" ? `./${newName}` : undefined,
        originalFileIndex: nodeType === "Item" ? newIndex : undefined,
        folderCount: nodeType === "Folder" ? 0 : undefined,
        unk1: "00000000",
        unk2: "00000000",
        unk3: 0,
        unk4: nodeType === "Folder" ? 0 : undefined,
      },
    };

    const nextTree = insertNodes(treeData, parentId, index, [newNode]);
    setTreeData(nextTree);
    setSelectedItem(newNode);
    setHasUnsavedChanges(true);

    if (nodeType === "Item" && completeProjectData && newFileIndex !== undefined) {
      const baseDirMatch = completeProjectData.SubFileData?.[0]?.fileUrl?.match(/\\([^\\]+)\\/)?.[1];
      const baseDir = baseDirMatch ?? "unknown";
      const nextSubFileDataItem = {
        index: newIndex,
        fileType: ".bin",
        fileIndex: newFileIndex,
        fileUrl: `.\\${baseDir}\\${newFileIndex}.bin`,
      };

      setCompleteProjectData({
        ...completeProjectData,
        Fhm2dTotalCount: completeProjectData.Fhm2dTotalCount + 1,
        SubFileData: [...completeProjectData.SubFileData, nextSubFileDataItem],
      });
    }

    return { id: newId };
  };

  const handleMove = ({ dragIds, parentId, index }: MoveArgs) => {
    const dragSet = new Set(dragIds);
    const { remaining, removed } = removeNodesById(treeData, dragSet);
    const nextTree = insertNodes(remaining, parentId, index, removed);
    setTreeData(nextTree);
    setHasUnsavedChanges(true);
  };

  const handleRename = ({ id, name }: RenameArgs) => {
    const nextTree = updateNode(treeData, id, (node) => ({ ...node, name }));
    setTreeData(nextTree);
    if (selectedItem?.id === id) {
      setSelectedItem(findNode(nextTree, id));
    }
    setHasUnsavedChanges(true);
  };

  const handleDelete = ({ ids }: DeleteArgs) => {
    const idSet = new Set(ids);
    const { remaining, removed } = removeNodesById(treeData, idSet);
    setTreeData(remaining);

    const removedIds = new Set(removed.map((n) => n.id));
    if (selectedItem?.id && removedIds.has(selectedItem.id)) {
      setSelectedItem(null);
    }

    recalculateIndices();
    setHasUnsavedChanges(true);
  };

  const handlePropertyChange = (nodeId: string, property: string, value: string | number) => {
    const nextTree = updateNode(treeData, nodeId, (node) => ({
      ...node,
      data: {
        ...(node.data ?? { type: "Item" as const }),
        [property]: value,
      },
    }));
    setTreeData(nextTree);
    if (selectedItem?.id === nodeId) {
      setSelectedItem(findNode(nextTree, nodeId));
    }
    setHasUnsavedChanges(true);
  };

  const handleFileTypeChange = (nodeId: string, newFileType: string) => {
    const nextTree = updateNode(treeData, nodeId, (node) => ({
      ...node,
      data: {
        ...(node.data ?? { type: "Item" as const }),
        fileType: newFileType,
      },
    }));
    setTreeData(nextTree);
    if (selectedItem?.id === nodeId) {
      setSelectedItem(findNode(nextTree, nodeId));
    }
    setHasUnsavedChanges(true);
  };

  const addNewNode = (parentId: string, nodeType: "folder" | "file") => {
    const tree = treeRef.current;
    if (!tree) return;
    tree.create({ parentId, type: nodeType });
  };

  const handlePaste = () => {
    if (!selectedItem || selectedItem.data?.type !== "Folder" || !copiedItem) return;
    pasteNode(selectedItem.id);
    const itemType = copiedItem.data?.type || "item";
    const itemTypeText = itemType === "Folder" ? "folder" : "file";
    toast.success(`Successfully pasted ${itemTypeText} "${copiedItem.name}" into "${selectedItem.name}"`);
    setHasUnsavedChanges(true);
  };

  const canAddChild = !!selectedItem && selectedItem.data?.type === "Folder";

  return (
    <div className="h-full w-full">
      <ResizablePanelGroup orientation="horizontal" className="h-full w-full border-none bg-background">
        <ResizablePanel defaultSize={65} minSize={40}>
          <Card className="h-full rounded-none border-0 shadow-none">
            <CardHeader className="space-y-2 p-0 pb-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle>Project Structure</CardTitle>
                  <CardDescription>
                    Drag and drop items to reorganize the structure
                    {loadedFilePath && (
                      <span className="ml-2 text-xs">
                        • {loadedFilePath.split(/[\\/]/).pop()}
                        {hasUnsavedChanges && <span className="text-yellow-600 dark:text-yellow-500"> (unsaved)</span>}
                      </span>
                    )}
                  </CardDescription>
                </div>
                <div className="flex gap-1">
                  <Button
                    onClick={handleSave}
                    disabled={!hasUnsavedChanges || !loadedFilePath || isSaving}
                    variant={hasUnsavedChanges ? "default" : "outline"}
                    size="sm"
                    title="Save changes (Ctrl+S)"
                  >
                    <Save className="h-4 w-4" />
                    {isSaving ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    onClick={() => selectedItem && addNewNode(selectedItem.id, "folder")}
                    disabled={!canAddChild}
                    variant="outline"
                    size="sm"
                  >
                    <Plus className="h-4 w-4" />
                    Add Folder
                  </Button>
                  <Button
                    onClick={() => selectedItem && addNewNode(selectedItem.id, "file")}
                    disabled={!canAddChild}
                    variant="outline"
                    size="sm"
                  >
                    <Plus className="h-4 w-4" />
                    Add File
                  </Button>
                </div>
              </div>

              {completeProjectData && (
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span>
                    Magic: <span className="font-semibold text-foreground">{completeProjectData.Magic}</span>
                  </span>
                  <span>
                    Files: <span className="font-semibold text-foreground">{completeProjectData.Fhm2dTotalCount}</span>
                  </span>
                  <span>
                    UnkCount: <span className="font-semibold text-foreground">{completeProjectData.UnkCount}</span>
                  </span>
                </div>
              )}
            </CardHeader>
            <CardContent className="h-[calc(100%-theme(spacing.20))] p-0">
              <div ref={containerRef} className="h-full rounded-lg border bg-card overflow-hidden">
                <Tree
                  ref={treeRef}
                  data={treeData}
                  width="100%"
                  height={treeHeight}
                  indent={20}
                  rowHeight={24}
                  openByDefault={false}
                  onSelect={handleSelectChange}
                  onCreate={handleCreate}
                  onMove={handleMove}
                  onRename={handleRename}
                  onDelete={handleDelete}
                  selection={selection}
                  searchMatch={(node, term) => node.data.name.toLowerCase().includes(term.toLowerCase())}
                >
                  {CustomTreeNode}
                </Tree>
              </div>
            </CardContent>
          </Card>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={35} minSize={25}>
          <div className="h-full p-3">
            <NodePropertiesPanel
              selectedItem={selectedItem || undefined}
              onRename={(nodeId, newName) => handleRename({ id: nodeId, name: newName })}
              onDelete={(nodeId) => handleDelete({ ids: [nodeId] })}
              onFileTypeChange={handleFileTypeChange}
              onPropertyChange={handlePropertyChange}
              copiedItem={copiedItem}
              onPaste={handlePaste}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}


