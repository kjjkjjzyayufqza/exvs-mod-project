import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { FilePathInput } from "@/components/ui/filePathInput";
import { Label } from "@/components/ui/label";
import { Plus, RefreshCw, Download, Upload, Folder, FileText, ChevronRight, ChevronDown, FileCode } from "lucide-react";
import { Tree } from "react-arborist";
import { NodePropertiesPanel } from "./components/NodePropertiesPanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import type { NodeApi } from "react-arborist";
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import {
  type TreeDataItem,
  convertSubFileStructureToTreeData,
} from "@/lib/utils";
import { useRepackStore } from "@/store/repackStore";
import { repackTemplates, updateRepackTemplates, type RepackTemplate } from "@/models/repackTemplateJson";

// Custom Node component for React Arborist
function CustomNode({ node, style, dragHandle }: {
  node: NodeApi<TreeDataItem>;
  style: React.CSSProperties;
  dragHandle?: (el: HTMLDivElement | null) => void
}) {
  const Icon = node.isLeaf ? FileText : Folder;
  const nodeData = node.data.data;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering selection when clicking toggle
    node.toggle();
  };

  const handleNodeClick = () => {
    node.select();
  };

  return (
    <div
      ref={dragHandle}
      style={style}
      className={`flex items-center gap-1 px-2 py-1 hover:bg-gray-100 cursor-pointer rounded ${node.isSelected ? 'bg-blue-100 text-blue-900' : ''
        } ${node.isFocused ? 'ring-2 ring-blue-500' : ''}`}
      onClick={handleNodeClick}
    >
      {/* Toggle arrow for folders */}
      {!node.isLeaf && (
        <button
          onClick={handleToggle}
          className="p-0.5 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
          aria-label={node.isOpen ? "Collapse folder" : "Expand folder"}
        >
          {node.isOpen ? (
            <ChevronDown className="h-3 w-3 text-gray-500" />
          ) : (
            <ChevronRight className="h-3 w-3 text-gray-500" />
          )}
        </button>
      )}

      {/* Spacer for leaf nodes to align with folder content */}
      {node.isLeaf && <div className="w-4 flex-shrink-0" />}

      <Icon
        className={`h-4 w-4 ${node.isLeaf ? 'text-gray-600' : 'text-blue-600'} flex-shrink-0`}
      />
      <span className="text-sm select-none flex-1 min-w-0">
        {node.isEditing ? (
          <input
            type="text"
            defaultValue={node.data.name}
            onBlur={(e) => node.submit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                node.submit(e.currentTarget.value);
              } else if (e.key === 'Escape') {
                node.reset();
              }
            }}
            className="px-1 py-0 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
            autoFocus
          />
        ) : (
          <span className="truncate">{node.data.name}</span>
        )}
      </span>
      {nodeData?.type === 'Item' && nodeData.fileType && (
        <span className="text-xs text-gray-500 ml-auto flex-shrink-0">
          {nodeData.fileType}
        </span>
      )}
    </div>
  );
}

export default function RepackPage() {
  const {
    treeData,
    setTreeData,
    selectedItem,
    setSelectedItem,
    setCompleteProjectData,
    exportProjectData,
    completeProjectData,
    getMaxAvailableIndex,
    getMaxAvailableFileIndex,
    recalculateIndices,
    copiedItem,
    pasteNode,
    mergeExistingTemplate
  } = useRepackStore();

  const [isLoading, setIsLoading] = useState(false);
  const [selectedFilePath, setSelectedFilePath] = useState("");
  const [exportFilePath, setExportFilePath] = useState("");
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [isCustomPathPopoverOpen, setIsCustomPathPopoverOpen] = useState(false);
  const [customPath, setCustomPath] = useState("");
  const treeRef = useRef<any>(null);

  // Handle export file path selection
  const openSelectExportFileDialog = async () => {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: 'JSON Files',
          extensions: ['json']
        }
      ]
    });
    if (selected) {
      setExportFilePath(selected as string);
    }
  };

  // Handle selected file path selection and import
  const openSelectFileDialog = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: 'JSON Files',
            extensions: ['json']
          }
        ]
      });

      if (!selected) {
        return;
      }

      // Update selected file path
      setSelectedFilePath(selected as string);

      // Read and import the JSON file content directly
      const jsonContent = await readTextFile(selected as string);
      const parsedData = JSON.parse(jsonContent);

      let convertedData: TreeDataItem[] = [];
      let successMessage = "";

      // Only use SubFileStructure for importing tree structure
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
        successMessage = "Successfully imported tree structure from SubFileStructure";
      }
      // Fallback: Check if it's a direct tree structure array
      else if (Array.isArray(parsedData)) {
        convertedData = parsedData;
        successMessage = "Successfully imported tree structure from direct array";
      }
      else {
        toast.error("No valid SubFileStructure found in the selected file");
        return;
      }

      // Update tree data if conversion was successful
      if (convertedData.length > 0) {
        setTreeData(convertedData);
        setSelectedItem(null);
        toast.success(successMessage);
      } else {
        toast.error("No valid tree data found in the selected file");
      }
    } catch (error) {
      console.error("Error importing tree structure:", error);
      toast.error("Failed to import tree structure: " + (error as Error).message);
    }
  };

  // Initialize with default data if empty
  const defaultTreeData: TreeDataItem[] = [
    {
      id: '1',
      name: 'Item 1',
      children: [
        {
          id: '2',
          name: 'Item 1.1',
          children: [
            {
              id: '3',
              name: 'Item 1.1.1',
              data: {
                type: 'Item',
                index: 0,
                fileType: '.bin',
                fileIndex: 0,
                fileUrl: './Item 1/Item 1.1/Item 1.1.1.bin',
                originalFileIndex: 0,
                unk1: "00000000",
                unk2: "00000000",
                unk3: 0
              }
            },
            {
              id: '4',
              name: 'Item 1.1.2',
              data: {
                type: 'Item',
                index: 1,
                fileType: '.bin',
                fileIndex: 1,
                fileUrl: './Item 1/Item 1.1/Item 1.1.2.bin',
                originalFileIndex: 1,
                unk1: "00000000",
                unk2: "00000000",
                unk3: 0
              }
            },
          ],
          data: {
            type: 'Folder',
            index: 0,
            folderCount: 2,
            unk1: "00000000",
            unk2: "00000000",
            unk3: 0,
            unk4: 0
          }
        },
        {
          id: '5',
          name: 'Item 1.2',
          data: {
            type: 'Item',
            index: 2,
            fileType: '.bin',
            fileIndex: 2,
            fileUrl: './Item 1/Item 1.2.bin',
            originalFileIndex: 2,
            unk1: "00000000",
            unk2: "00000000",
            unk3: 0
          }
        },
      ],
      data: {
        type: 'Folder',
        index: 0,
        folderCount: 2,
        unk1: "00000000",
        unk2: "00000000",
        unk3: 0,
        unk4: 0
      }
    },
    {
      id: '6',
      name: 'Item 2',
      data: {
        type: 'Item',
        index: 3,
        fileType: '.bin',
        fileIndex: 3,
        fileUrl: './Item 2.bin',
        originalFileIndex: 3,
        unk1: "00000000",
        unk2: "00000000",
        unk3: 0
      }
    },
  ];

  // Set default data if empty
  if (treeData.length === 0) {
    setTreeData(defaultTreeData);
  }

  const handleSelectChange = (nodes: NodeApi<TreeDataItem>[]) => {
    if (nodes.length > 0) {
      setSelectedItem(nodes[0].data);
    } else {
      setSelectedItem(null);
    }
  };

  const handleCreate = ({ parentId, index, type }: { parentId: string | null; index: number; type: string }) => {
    const nodeType = type === 'folder' ? 'Folder' : 'Item';
    const newNodeName = nodeType === 'Folder' ? 'New Folder' : 'New File.bin';
    const newId = uuidv4();

    // Calculate new index and fileIndex for Items
    let newIndex = index;
    let newFileIndex = index;

    if (nodeType === 'Item') {
      // Calculate maximum available index and fileIndex from SubFileData
      newIndex = getMaxAvailableIndex();
      newFileIndex = getMaxAvailableFileIndex();
    }

    const newNode: TreeDataItem = {
      id: newId,
      name: newNodeName,
      data: {
        type: nodeType,
        index: newIndex,
        fileType: nodeType === 'Item' ? '.bin' : undefined,
        fileIndex: nodeType === 'Item' ? newFileIndex : undefined,
        fileUrl: nodeType === 'Item' ? `./${newNodeName}` : undefined,
        originalFileIndex: nodeType === 'Item' ? newIndex : undefined,
        folderCount: nodeType === 'Folder' ? 0 : undefined,
        // Add default unk parameters
        unk1: "00000000",
        unk2: "00000000",
        unk3: 0,
        unk4: nodeType === 'Folder' ? 0 : undefined
      },
      children: nodeType === 'Folder' ? [] : undefined
    };

    const addNodeRecursively = (nodes: TreeDataItem[]): TreeDataItem[] => {
      if (parentId === null) {
        const newNodes = [...nodes];
        newNodes.splice(index, 0, newNode);
        return newNodes;
      }

      return nodes.map(node => {
        if (node.id === parentId) {
          const children = node.children || [];
          const newChildren = [...children];
          newChildren.splice(index, 0, newNode);

          // Update folderCount for the parent folder
          const updatedData = node.data ? {
            ...node.data,
            folderCount: newChildren.length
          } : undefined;

          return {
            ...node,
            children: newChildren,
            data: updatedData
          };
        }
        if (node.children) {
          return {
            ...node,
            children: addNodeRecursively(node.children)
          };
        }
        return node;
      });
    };

    const newTreeData = addNodeRecursively(treeData);
    setTreeData(newTreeData);

    // If adding a new Item, update completeProjectData.SubFileData
    if (nodeType === 'Item' && completeProjectData) {
      const newSubFileDataItem = {
        index: newIndex,
        fileType: '.bin',
        fileIndex: newFileIndex,
        fileUrl: `.\\${completeProjectData.SubFileData[0]?.fileUrl.match(/\\([^\\]+)\\/)?.[1] || 'unknown'}\\${newFileIndex}.bin`
      };

      const updatedCompleteProjectData = {
        ...completeProjectData,
        Fhm2dTotalCount: completeProjectData.Fhm2dTotalCount + 1,
        SubFileData: [...completeProjectData.SubFileData, newSubFileDataItem]
      };

      setCompleteProjectData(updatedCompleteProjectData);
    }

    // Return the new node ID as required by React Arborist
    return { id: newId };
  };

  const handleRename = ({ id, name }: { id: string; name: string }) => {
    const renameNodeRecursively = (nodes: TreeDataItem[]): TreeDataItem[] => {
      return nodes.map(node => {
        if (node.id === id) {
          const updatedNode = {
            ...node,
            name: name,
            // Don't automatically update fileUrl when renaming - keep it independent
            data: node.data
          };

          // Update selectedItem if it's the same node
          if (selectedItem && selectedItem.id === id) {
            setSelectedItem(updatedNode);
          }

          return updatedNode;
        }
        if (node.children) {
          return {
            ...node,
            children: renameNodeRecursively(node.children)
          };
        }
        return node;
      });
    };

    const newTreeData = renameNodeRecursively(treeData);
    setTreeData(newTreeData);
  };

  const handleMove = ({ dragIds, parentId, index }: { dragIds: string[]; parentId: string | null; index: number }) => {
    console.log("Moving nodes", dragIds, "to parent", parentId, "at index", index);

    // Find and collect the nodes to move
    const findAndExtractNodes = (nodes: TreeDataItem[], nodeIds: string[]): { extracted: TreeDataItem[], remaining: TreeDataItem[] } => {
      const extracted: TreeDataItem[] = [];
      const remaining: TreeDataItem[] = [];

      nodes.forEach(node => {
        if (nodeIds.includes(node.id)) {
          extracted.push(node);
        } else {
          let updatedNode = { ...node };
          if (node.children) {
            const childResult = findAndExtractNodes(node.children, nodeIds);
            extracted.push(...childResult.extracted);
            updatedNode.children = childResult.remaining;

            // Update folderCount if any children were extracted
            if (childResult.extracted.length > 0 && node.data?.type === 'Folder') {
              updatedNode.data = {
                ...node.data,
                folderCount: childResult.remaining.length
              };
            }
          }
          remaining.push(updatedNode);
        }
      });

      return { extracted, remaining };
    };

    // Insert nodes at the specified location
    const insertNodesAtLocation = (nodes: TreeDataItem[], targetParentId: string | null, insertIndex: number, nodesToInsert: TreeDataItem[]): TreeDataItem[] => {
      if (targetParentId === null) {
        // Insert at root level
        const newNodes = [...nodes];
        newNodes.splice(insertIndex, 0, ...nodesToInsert);
        return newNodes;
      }

      return nodes.map(node => {
        if (node.id === targetParentId) {
          const children = node.children || [];
          const newChildren = [...children];
          newChildren.splice(insertIndex, 0, ...nodesToInsert);

          // Update folderCount for the target parent folder
          const updatedData = node.data ? {
            ...node.data,
            folderCount: newChildren.length
          } : undefined;

          return {
            ...node,
            children: newChildren,
            data: updatedData
          };
        }
        if (node.children) {
          return {
            ...node,
            children: insertNodesAtLocation(node.children, targetParentId, insertIndex, nodesToInsert)
          };
        }
        return node;
      });
    };

    // Extract nodes to move
    const { extracted, remaining } = findAndExtractNodes(treeData, dragIds);

    // Insert extracted nodes at new location
    const updatedData = insertNodesAtLocation(remaining, parentId, index, extracted);

    setTreeData(updatedData);
  };

  const handleDelete = ({ ids }: { ids: string[] }) => {
    const deleteNodesRecursively = (nodes: TreeDataItem[]): TreeDataItem[] => {
      const filteredNodes = nodes.filter(node => {
        if (ids.includes(node.id)) {
          return false;
        }
        if (node.children) {
          const originalChildrenLength = node.children.length;
          node.children = deleteNodesRecursively(node.children);

          // Update folderCount if any children were deleted
          if (node.children.length !== originalChildrenLength && node.data?.type === 'Folder') {
            node.data = {
              ...node.data,
              folderCount: node.children.length
            };
          }
        }
        return true;
      });

      return filteredNodes;
    };

    const newTreeData = deleteNodesRecursively(treeData);
    setTreeData(newTreeData);

    // Recalculate all indices after deletion using export logic
    setTimeout(() => {
      recalculateIndices();
    }, 0);
  };

  const addNewNode = (parentId: string, nodeType: 'folder' | 'file') => {
    if (!treeRef.current) return;

    const tree = treeRef.current;
    const parentNode = tree.get(parentId);
    if (parentNode) {
      tree.create({ parentId, type: nodeType });
    }
  };

  const renameNode = (nodeId: string, newName: string) => {
    handleRename({ id: nodeId, name: newName });
  };

  const deleteNode = (nodeId: string) => {
    handleDelete({ ids: [nodeId] });
  };

  const handlePaste = () => {
    if (selectedItem && selectedItem.data?.type === 'Folder' && copiedItem) {
      pasteNode(selectedItem.id);

      // Show success message
      const itemType = copiedItem.data?.type || 'item';
      const itemTypeText = itemType === 'Folder' ? 'folder' : 'file';

      toast.success(`Successfully pasted ${itemTypeText} "${copiedItem.name}" into "${selectedItem.name}"`);
    }
  };

  const handleAddTemplate = (template: RepackTemplate) => {
    if (!selectedItem || selectedItem.data?.type !== 'Folder') {
      toast.error("Please select a folder to add the template");
      return;
    }

    // Convert template data to TreeDataItem format with proper index calculation
    const convertTemplateItemToTreeData = (templateItem: any, parentPath: string = ""): TreeDataItem[] => {
      const result: TreeDataItem[] = [];

      for (const item of templateItem) {
        const newId = uuidv4();
        const itemName = item.Name || `item_${item.type}`;

        if (item.type === 'Folder') {
          // Calculate new index for folders same as add file logic
          const newIndex = getMaxAvailableIndex();
          
          const folderNode: TreeDataItem = {
            id: newId,
            name: itemName,
            children: [], // Will be populated later
            data: {
              type: 'Folder',
              index: newIndex,
              folderCount: item.folderCount || 0,
              unk1: item.unk1 || "00000000",
              unk2: item.unk2 || "00000000",
              unk3: item.unk3 || 0,
              unk4: item.unk4 || 0
            }
          };
          result.push(folderNode);
        } else if (item.type === 'Item') {
          // Calculate new index and fileIndex same as add file logic
          const newIndex = getMaxAvailableIndex();
          const newFileIndex = getMaxAvailableFileIndex();
          
          const itemNode: TreeDataItem = {
            id: newId,
            name: `${itemName}.bin`,
            data: {
              type: 'Item',
              index: newIndex,
              fileType: '.bin',
              fileIndex: newFileIndex,
              fileUrl: `./${itemName}.bin`,
              originalFileIndex: newIndex, // Use newIndex like in add file logic, not hardcoded
              unk1: item.unk1 || "00000000",
              unk2: item.unk2 || "00000000",
              unk3: item.unk3 || 0
            }
          };
          result.push(itemNode);

          // Add to completeProjectData.SubFileData if available (same as add file logic)
          if (completeProjectData) {
            const newSubFileDataItem = {
              index: newIndex,
              fileType: '.bin',
              fileIndex: newFileIndex,
              fileUrl: `.\\${completeProjectData.SubFileData[0]?.fileUrl.match(/\\([^\\]+)\\/)?.[1] || 'unknown'}\\${newFileIndex}.bin`
            };

            const updatedCompleteProjectData = {
              ...completeProjectData,
              Fhm2dTotalCount: completeProjectData.Fhm2dTotalCount + 1,
              SubFileData: [...completeProjectData.SubFileData, newSubFileDataItem]
            };

            setCompleteProjectData(updatedCompleteProjectData);
          }
        }
        // Skip EndMark items as they are not needed in tree structure
      }

      return result;
    };

    // Add template items to the selected folder
    const templateTreeItems = convertTemplateItemToTreeData(template.data);

    const addItemsToFolder = (nodes: TreeDataItem[]): TreeDataItem[] => {
      return nodes.map(node => {
        if (node.id === selectedItem!.id && node.data?.type === 'Folder') {
          const children = node.children || [];
          const newChildren = [...children, ...templateTreeItems];

          // Update folderCount
          const updatedData = {
            ...node.data,
            folderCount: newChildren.length
          };

          return {
            ...node,
            children: newChildren,
            data: updatedData
          };
        }
        if (node.children) {
          return {
            ...node,
            children: addItemsToFolder(node.children)
          };
        }
        return node;
      });
    };

    const newTreeData = addItemsToFolder(treeData);
    setTreeData(newTreeData);

    // Close dialog and show success message
    setIsTemplateDialogOpen(false);
    toast.success(`Successfully added "${template.name}" template to "${selectedItem.name}"`);
  };



  const handlePropertyChange = (nodeId: string, property: string, value: string | number) => {
    const updateNodeRecursively = (nodes: TreeDataItem[]): TreeDataItem[] => {
      return nodes.map(node => {
        if (node.id === nodeId && node.data) {
          const updatedData = {
            ...node.data,
            [property]: value
          };

          const updatedNode: TreeDataItem = {
            ...node,
            data: updatedData
          };

          // Update selectedItem if it's the same node
          if (selectedItem && selectedItem.id === nodeId) {
            setSelectedItem(updatedNode);
          }

          return updatedNode;
        }
        if (node.children) {
          return {
            ...node,
            children: updateNodeRecursively(node.children)
          };
        }
        return node;
      });
    };

    const newTreeData = updateNodeRecursively(treeData);
    setTreeData(newTreeData);
  };

  const handleFileTypeChange = (nodeId: string, newFileType: string) => {
    const updateFileTypeRecursively = (nodes: TreeDataItem[]): TreeDataItem[] => {
      return nodes.map(node => {
        if (node.id === nodeId) {
          const updatedNode = {
            ...node,
            data: node.data ? {
              ...node.data,
              fileType: newFileType
            } : {
              type: 'Item' as const,
              fileType: newFileType
            }
          };

          // Update selectedItem if it's the same node
          if (selectedItem && selectedItem.id === nodeId) {
            setSelectedItem(updatedNode);
          }

          return updatedNode;
        }
        if (node.children) {
          return {
            ...node,
            children: updateFileTypeRecursively(node.children)
          };
        }
        return node;
      });
    };

    const newTreeData = updateFileTypeRecursively(treeData);
    setTreeData(newTreeData);
  };

  const handleRefresh = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
    }, 1000);
  };

  const handleExport = async () => {
    try {
      // Check if export file path is set
      if (!exportFilePath.trim()) {
        toast.error("Please set the export file path before exporting.");
        return;
      }

      const exportData = exportProjectData();

      if (!exportData) {
        toast.error("No data to export. Please import a project first.");
        return;
      }

      // Create JSON string
      const jsonString = JSON.stringify(exportData, null, 2);

      // Write to specified file path
      await writeTextFile(exportFilePath, jsonString);

      toast.success("Project exported successfully to: " + exportFilePath);
    } catch (error) {
      console.error("Error exporting project:", error);
      toast.error("Failed to export project: " + (error as Error).message);
    }
  };



  const handleImport = async () => {
    try {
      // Open file dialog to select JSON file
      const selectedFile = await open({
        filters: [
          {
            name: 'JSON Files',
            extensions: ['json']
          }
        ],
        multiple: false
      });

      if (!selectedFile) {
        return;
      }

      // Update selected file path
      setSelectedFilePath(selectedFile as string);

      // Read the JSON file content
      const jsonContent = await readTextFile(selectedFile as string);
      const parsedData = JSON.parse(jsonContent);

      let convertedData: TreeDataItem[] = [];
      let successMessage = "";

      // Only use SubFileStructure for importing tree structure
      // SubFileStructure contains flat structure data that needs to be converted to tree format
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

        // Convert SubFileStructure to tree format using SubFileData for additional file information
        convertedData = convertSubFileStructureToTreeData(
          parsedData.SubFileStructure,
          parsedData.SubFileData || []
        );
        successMessage = "Successfully imported tree structure from SubFileStructure";
      }
      // Fallback: Check if it's a direct tree structure array
      else if (Array.isArray(parsedData)) {
        convertedData = parsedData;
        successMessage = "Successfully imported tree structure from direct array";
      }
      else {
        // Show error if no valid SubFileStructure found
        toast.error("No valid SubFileStructure found in the selected file");
        return;
      }

      // Update tree data if conversion was successful
      if (convertedData.length > 0) {
        setTreeData(convertedData);
        setSelectedItem(null);
        toast.success(successMessage);
      } else {
        toast.error("No valid tree data found in the selected file");
      }
    } catch (error) {
      console.error("Error importing tree structure:", error);
      toast.error("Failed to import tree structure: " + (error as Error).message);
    }
  };

  const handleImportExistingTemplate = () => {
    if (!selectedItem || selectedItem.data?.type !== 'Folder') {
      toast.error("Please select a folder to add the existing template");
      return;
    }

    // Show the custom path popover
    setIsCustomPathPopoverOpen(true);
  };

  const handleCustomPathSubmit = async () => {
    try {
      // Open file dialog to select JSON file
      const selectedFile = await open({
        filters: [
          {
            name: 'JSON Files',
            extensions: ['json']
          }
        ],
        multiple: false
      });

      if (!selectedFile) {
        return;
      }

      // Read the JSON file content
      const jsonContent = await readTextFile(selectedFile as string);
      const parsedData = JSON.parse(jsonContent);

      // Validate that the file contains only SubFileData and SubFileStructure
      if (!parsedData.SubFileData || !Array.isArray(parsedData.SubFileData)) {
        toast.error("Invalid template file: Missing or invalid SubFileData array");
        return;
      }

      if (!parsedData.SubFileStructure || !Array.isArray(parsedData.SubFileStructure)) {
        toast.error("Invalid template file: Missing or invalid SubFileStructure array");
        return;
      }

      // Check for extra fields that shouldn't be present
      const allowedKeys = ['SubFileData', 'SubFileStructure'];
      const extraKeys = Object.keys(parsedData).filter(key => !allowedKeys.includes(key));

      if (extraKeys.length > 0) {
        toast.warning(`Template file contains extra fields (${extraKeys.join(', ')}) that will be ignored`);
      }

      // Call the store method to merge the template data with custom path
      const finalCustomPath = customPath.trim() || undefined;
      mergeExistingTemplate(parsedData.SubFileData, parsedData.SubFileStructure, finalCustomPath);

      // Close popover and reset custom path
      setIsCustomPathPopoverOpen(false);
      setCustomPath("");

      toast.success(`Successfully imported existing template into "${selectedItem!.name}"`);

    } catch (error) {
      console.error("Error importing existing template:", error);
      toast.error("Failed to import existing template: " + (error as Error).message);
    }
  };

  return (
    <div className="h-full flex flex-col p-6 bg-gray-50/30">
      <div>
        <h2 className="text-2xl font-bold tracking-tight mb-4">Repack Manager</h2>
        <p className="text-gray-600 mb-4">
          Manage your project structure with drag & drop, rename, add and delete operations.<br />
          <span className="text-2xl">对于GVS的文件，记得用解包工具解包一次，再打包一次，再解包一次的json来导入，否则会出错</span>
        </p>

        <div className="flex gap-2 mb-4">
          <Button
            onClick={handleRefresh}
            disabled={isLoading}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={handleExport} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button
            onClick={() => selectedItem && addNewNode(selectedItem.id, 'folder')}
            disabled={!selectedItem || selectedItem.data?.type !== 'Folder'}
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Folder
          </Button>
          <Button
            onClick={() => selectedItem && addNewNode(selectedItem.id, 'file')}
            disabled={!selectedItem || selectedItem.data?.type !== 'Folder'}
            variant="outline"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add File
          </Button>
          <Popover open={isCustomPathPopoverOpen} onOpenChange={setIsCustomPathPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                onClick={handleImportExistingTemplate}
                disabled={!selectedItem || selectedItem.data?.type !== 'Folder'}
                variant="outline"
                size="sm"
              >
                <Upload className="h-4 w-4 mr-2" />
                Add Existing Template
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-medium leading-none">Custom Path (Optional)</h4>
                  <p className="text-sm text-muted-foreground">
                    Enter a custom path to prepend to all file URLs. Leave empty to use default behavior.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="custom-path">Custom Path</Label>
                  <Input
                    id="custom-path"
                    placeholder="e.g., .\\custom\\path"
                    value={customPath}
                    onChange={(e) => setCustomPath(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleCustomPathSubmit();
                      }
                    }}
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsCustomPathPopoverOpen(false);
                      setCustomPath("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleCustomPathSubmit}>
                    Select Template File
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Dialog open={isTemplateDialogOpen} onOpenChange={(open) => {
            if (open) {
              // Update templates with current dynamic indices before showing dialog
              updateRepackTemplates(getMaxAvailableIndex, getMaxAvailableFileIndex);
            }
            setIsTemplateDialogOpen(open);
          }}>
            <DialogTrigger asChild>
              <Button
                disabled={!selectedItem || selectedItem.data?.type !== 'Folder'}
                variant="outline"
                size="sm"
              >
                <FileCode className="h-4 w-4 mr-2" />
                Add Template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Select Template</DialogTitle>
                <DialogDescription>
                  Choose a template to add to the selected folder. Make sure you have selected a folder in the project structure first.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 py-4">
                {repackTemplates.map((template, index) => (
                  <Card
                    key={index}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => handleAddTemplate(template)}
                  >
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-sm">
                        {template.description}
                      </CardDescription>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>


        {/* File Path Input Fields */}
        <div className="space-y-4 mb-6">
          <div className="flex items-center gap-4">
            <Label htmlFor="selectedFilePath" className="min-w-[140px]">Selected File Path:</Label>
            <FilePathInput
              id="selectedFilePath"
              type="text"
              placeholder="Click to select and import JSON file..."
              value={selectedFilePath}
              readOnly
              onClick={openSelectFileDialog}
              className="flex-1 cursor-pointer"
            />
          </div>
          <div className="flex items-center gap-4">
            <Label htmlFor="exportFilePath" className="min-w-[140px]">Export File Path:</Label>
            <FilePathInput
              id="exportFilePath"
              type="text"
              placeholder="Click to select export path..."
              value={exportFilePath}
              readOnly
              onClick={openSelectExportFileDialog}
              className="flex-1 cursor-pointer"
            />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Tree View Panel */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Project Structure</CardTitle>
            <CardDescription>
              Drag and drop items to reorganize your project structure
            </CardDescription>
            {completeProjectData && (
              <div className="flex gap-6 text-sm text-gray-600 mt-2">
                <span>Magic: <span className="font-bold">{completeProjectData.Magic}</span></span>
                <span>Files: <span className="font-bold">{completeProjectData.Fhm2dTotalCount}</span></span>
                <span>UnkCount: <span className="font-bold">{completeProjectData.UnkCount}</span></span>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg p-4 overflow-hidden">
              <Tree
                ref={treeRef}
                data={treeData}
                width="100%"
                height={600}
                indent={20}
                rowHeight={32}
                openByDefault={false}
                onSelect={handleSelectChange}
                onCreate={handleCreate}
                onMove={handleMove}
                onRename={handleRename}
                onDelete={handleDelete}
                searchMatch={(node, term) =>
                  node.data.name.toLowerCase().includes(term.toLowerCase())
                }
              >
                {CustomNode}
              </Tree>
            </div>
          </CardContent>
        </Card>

        {/* Properties Panel */}
        <div className="space-y-6">
          <NodePropertiesPanel
            selectedItem={selectedItem || undefined}
            onRename={renameNode}
            onDelete={deleteNode}
            onFileTypeChange={handleFileTypeChange}
            onPropertyChange={handlePropertyChange}
            copiedItem={copiedItem}
            onPaste={handlePaste}
          />
        </div>
      </div>
    </div>
  );
} 