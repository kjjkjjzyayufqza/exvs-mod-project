import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Folder, 
  FileText, 
  RefreshCw, 
  FolderOpen, 
  FolderClosed, 
  Copy, 
  Scissors,
  Clipboard,
  Search,
  Filter,
  MoreHorizontal
} from "lucide-react";

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

interface AdvancedTreeActionsProps {
  selectedItem: TreeDataItem | undefined;
  onAddNode: (parentId: string, nodeType: 'folder' | 'file') => void;
  onRefresh: () => void;
  isLoading: boolean;
}

export function AdvancedTreeActions({ 
  selectedItem, 
  onAddNode, 
  onRefresh, 
  isLoading 
}: AdvancedTreeActionsProps) {
  const [copiedItem, setCopiedItem] = useState<TreeDataItem | null>(null);
  const [cutItem, setCutItem] = useState<TreeDataItem | null>(null);

  const handleCopy = () => {
    if (selectedItem) {
      setCopiedItem(selectedItem);
      setCutItem(null);
    }
  };

  const handleCut = () => {
    if (selectedItem) {
      setCutItem(selectedItem);
      setCopiedItem(null);
    }
  };

  const handlePaste = () => {
    if ((copiedItem || cutItem) && selectedItem) {
      const sourceItem = copiedItem || cutItem;
      console.log(`Pasting ${sourceItem?.name} into ${selectedItem.name}`);
      
      // Implement paste logic here
      if (cutItem) {
        setCutItem(null);
      }
    }
  };

  const handleExpandAll = () => {
    console.log("Expanding all nodes");
    // Implement expand all logic
  };

  const handleCollapseAll = () => {
    console.log("Collapsing all nodes");
    // Implement collapse all logic
  };

  const canPaste = (copiedItem || cutItem) && selectedItem?.droppable;
  const canAddToSelected = selectedItem?.droppable;

  return (
    <div className="space-y-4">
      {/* Quick Actions Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Quick Actions
          </CardTitle>
          <CardDescription>Common operations for tree management</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add Operations */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Add Items</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => selectedItem && onAddNode(selectedItem.id, 'folder')}
                disabled={!canAddToSelected}
                className="w-full"
              >
                <Folder className="h-4 w-4 mr-2" />
                Folder
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => selectedItem && onAddNode(selectedItem.id, 'file')}
                disabled={!canAddToSelected}
                className="w-full"
              >
                <FileText className="h-4 w-4 mr-2" />
                File
              </Button>
            </div>
            {!canAddToSelected && selectedItem && (
              <p className="text-xs text-muted-foreground">
                Cannot add items to files or non-droppable items
              </p>
            )}
            {!selectedItem && (
              <p className="text-xs text-muted-foreground">
                Select a folder to add items
              </p>
            )}
          </div>

          <Separator />

          {/* Clipboard Operations */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Clipboard</p>
            <div className="grid grid-cols-3 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopy}
                disabled={!selectedItem || selectedItem.id === 'root'}
                className="w-full"
              >
                <Copy className="h-4 w-4 mr-1" />
                Copy
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCut}
                disabled={!selectedItem || selectedItem.id === 'root'}
                className="w-full"
              >
                <Scissors className="h-4 w-4 mr-1" />
                Cut
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handlePaste}
                disabled={!canPaste}
                className="w-full"
              >
                <Clipboard className="h-4 w-4 mr-1" />
                Paste
              </Button>
            </div>
            
            {/* Clipboard Status */}
            {(copiedItem || cutItem) && (
              <div className="mt-2">
                <Badge variant="secondary" className="text-xs">
                  {cutItem ? 'Cut: ' : 'Copied: '}
                  {(copiedItem || cutItem)?.name}
                </Badge>
              </div>
            )}
          </div>

          <Separator />

          {/* Tree Operations */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Tree Operations</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleExpandAll}
                className="w-full"
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                Expand All
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCollapseAll}
                className="w-full"
              >
                <FolderClosed className="h-4 w-4 mr-2" />
                Collapse All
              </Button>
            </div>
          </div>

          <Separator />

          {/* Refresh */}
          <Button
            onClick={onRefresh}
            disabled={isLoading}
            variant="outline"
            className="w-full"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Refreshing...' : 'Refresh Tree'}
          </Button>
        </CardContent>
      </Card>

      {/* Selection Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Selection Info
          </CardTitle>
          <CardDescription>Information about the selected item</CardDescription>
        </CardHeader>
        <CardContent>
          {selectedItem ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {selectedItem.data?.type === 'folder' ? (
                  <Folder className="h-4 w-4" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                <span className="font-medium truncate">{selectedItem.name}</span>
              </div>
              
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className="text-xs">
                  {selectedItem.data?.type || 'unknown'}
                </Badge>
                {selectedItem.draggable && (
                  <Badge variant="secondary" className="text-xs">
                    Draggable
                  </Badge>
                )}
                {selectedItem.droppable && (
                  <Badge variant="secondary" className="text-xs">
                    Droppable
                  </Badge>
                )}
                {selectedItem.children && (
                  <Badge variant="outline" className="text-xs">
                    {selectedItem.children.length} items
                  </Badge>
                )}
              </div>

              {selectedItem.data?.path && (
                <div className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded">
                  {selectedItem.data.path}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-4">
              <Filter className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No item selected</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Advanced Operations Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MoreHorizontal className="h-5 w-5" />
            Advanced
          </CardTitle>
          <CardDescription>Additional tree operations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button variant="outline" size="sm" className="w-full" disabled>
            <Search className="h-4 w-4 mr-2" />
            Search Tree
          </Button>
          <Button variant="outline" size="sm" className="w-full" disabled>
            <Filter className="h-4 w-4 mr-2" />
            Filter Nodes
          </Button>
          <p className="text-xs text-muted-foreground">
            Coming soon: Advanced search and filtering capabilities
          </p>
        </CardContent>
      </Card>
    </div>
  );
} 