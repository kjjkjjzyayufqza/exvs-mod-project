import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, RefreshCw, Download, Upload, Folder, FileText } from "lucide-react";
import { TreeView } from "@/components/tree-view";
import { AdvancedTreeActions } from "./components/AdvancedTreeActions";
import { NodePropertiesPanel } from "./components/NodePropertiesPanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface TreeDataItem {
  id: string;
  name: string;
  icon?: any;
  selectedIcon?: any;
  openIcon?: any;
  children?: TreeDataItem[];
  actions?: React.ReactNode;
  onClick?: () => void;
  draggable?: boolean;
  droppable?: boolean;
  disabled?: boolean;
  data?: {
    type: 'folder' | 'file';
    size?: number;
    path?: string;
    lastModified?: Date;
  };
}

export default function RepackPage() {
  const [treeData, setTreeData] = useState<TreeDataItem[]>([
    {
      id: "root",
      name: "Project Root",
      icon: Folder,
      draggable: true,
      droppable: true,
      data: { type: 'folder', path: '/' },
      children: [
        {
          id: "assets",
          name: "Assets",
          icon: Folder,
          draggable: true,
          droppable: true,
          data: { type: 'folder', path: '/assets' },
          children: [
            {
              id: "images",
              name: "Images",
              icon: Folder,
              draggable: true,
              droppable: true,
              data: { type: 'folder', path: '/assets/images' },
              children: [
                {
                  id: "logo",
                  name: "logo.png",
                  icon: FileText,
                  draggable: true,
                  droppable: true,
                  data: { type: 'file', size: 2048, path: '/assets/images/logo.png' }
                }
              ]
            }
          ]
        },
        {
          id: "config",
          name: "config.json",
          icon: FileText,
          draggable: true,
          droppable: true,
          data: { type: 'file', size: 1024, path: '/config.json' }
        }
      ]
    }
  ]);

  const [selectedItem, setSelectedItem] = useState<TreeDataItem | undefined>();
  const [isLoading, setIsLoading] = useState(false);

  const handleSelectChange = (item: TreeDataItem | undefined) => {
    setSelectedItem(item);
  };

  const handleDragDrop = (sourceItem: TreeDataItem, targetItem: TreeDataItem) => {
    console.log("Moving", sourceItem.name, "to", targetItem.name);
    // Handle drag and drop logic here
    // You can implement the logic to move nodes in the tree
  };

  const addNewNode = (parentId: string, nodeType: 'folder' | 'file') => {
    const newNodeName = nodeType === 'folder' ? 'New Folder' : 'New File.txt';
    const newNode: TreeDataItem = {
      id: `${Date.now()}`,
      name: newNodeName,
      icon: nodeType === 'folder' ? Folder : FileText,
      draggable: true,
      droppable: nodeType === 'folder',
      data: {
        type: nodeType,
        path: `/${newNodeName}`,
        size: nodeType === 'file' ? 0 : undefined,
        lastModified: new Date()
      },
      children: nodeType === 'folder' ? [] : undefined
    };

    const addNodeRecursively = (nodes: TreeDataItem[]): TreeDataItem[] => {
      return nodes.map(node => {
        if (node.id === parentId) {
          return {
            ...node,
            children: [...(node.children || []), newNode]
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

    setTreeData(prevData => addNodeRecursively(prevData));
  };

  const renameNode = (nodeId: string, newName: string) => {
    const renameNodeRecursively = (nodes: TreeDataItem[]): TreeDataItem[] => {
      return nodes.map(node => {
        if (node.id === nodeId) {
          return {
            ...node,
            name: newName,
            data: {
              ...node.data,
              path: node.data?.path ? node.data.path.replace(/[^/]*$/, newName) : `/${newName}`,
              lastModified: new Date()
            } as any
          };
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

    setTreeData(prevData => renameNodeRecursively(prevData));
  };

  const deleteNode = (nodeId: string) => {
    const deleteNodeRecursively = (nodes: TreeDataItem[]): TreeDataItem[] => {
      return nodes.filter(node => {
        if (node.id === nodeId) {
          return false;
        }
        if (node.children) {
          node.children = deleteNodeRecursively(node.children);
        }
        return true;
      });
    };

    setTreeData(prevData => deleteNodeRecursively(prevData));
  };

  const handleRefresh = () => {
    setIsLoading(true);
    // Simulate refresh
    setTimeout(() => {
      setIsLoading(false);
    }, 1000);
  };

  const handleExport = () => {
    console.log("Exporting tree structure...");
    // Implement export functionality
  };

  const handleImport = () => {
    console.log("Importing tree structure...");
    // Implement import functionality
  };

  return (
    <div className="h-full flex flex-col p-6 bg-gray-50/30">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight mb-4">Repack Manager</h2>
        <p className="text-gray-600 mb-4">
          Manage your project structure with drag & drop, rename, add and delete operations.
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
          <Button onClick={handleImport} variant="outline" size="sm">
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button 
            onClick={() => selectedItem && addNewNode(selectedItem.id, 'folder')} 
            disabled={!selectedItem}
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Folder
          </Button>
          <Button 
            onClick={() => selectedItem && addNewNode(selectedItem.id, 'file')} 
            disabled={!selectedItem}
            variant="outline" 
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add File
          </Button>
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
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg p-4 max-h-[600px] overflow-auto">
              <TreeView
                data={treeData}
                className="w-full"
                onSelectChange={handleSelectChange}
                onDocumentDrag={handleDragDrop}
                defaultNodeIcon={Folder}
                defaultLeafIcon={FileText}
              />
            </div>
          </CardContent>
        </Card>

        {/* Properties and Actions Panel */}
        <div className="space-y-6">
          <NodePropertiesPanel 
            selectedItem={selectedItem}
            onRename={renameNode}
            onDelete={deleteNode}
          />
          
          <AdvancedTreeActions 
            selectedItem={selectedItem}
            onAddNode={addNewNode}
            onRefresh={handleRefresh}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
} 