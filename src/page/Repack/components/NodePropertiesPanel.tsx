import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Trash2, Edit3, Save, X, Folder, FileText, Calendar, HardDrive } from "lucide-react";

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

interface NodePropertiesPanelProps {
  selectedItem: TreeDataItem | undefined;
  onRename: (nodeId: string, newName: string) => void;
  onDelete: (nodeId: string) => void;
}

export function NodePropertiesPanel({ selectedItem, onRename, onDelete }: NodePropertiesPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const handleStartEdit = () => {
    if (selectedItem) {
      setEditName(selectedItem.name);
      setIsEditing(true);
    }
  };

  const handleSaveEdit = () => {
    if (selectedItem && editName.trim()) {
      onRename(selectedItem.id, editName.trim());
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditName("");
  };

  const handleDeleteConfirm = () => {
    if (selectedItem) {
      onDelete(selectedItem.id);
      setIsDeleteDialogOpen(false);
    }
  };

  const handleDeleteCancel = () => {
    setIsDeleteDialogOpen(false);
  };

  const formatFileSize = (bytes: number | undefined): string => {
    if (!bytes) return "0 B";
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  if (!selectedItem) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Properties</CardTitle>
          <CardDescription>Select an item to view its properties</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            <Folder className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No item selected</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {selectedItem.data?.type === 'folder' ? (
            <Folder className="h-5 w-5" />
          ) : (
            <FileText className="h-5 w-5" />
          )}
          Properties
        </CardTitle>
        <CardDescription>View and edit item properties</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Name Section */}
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          {isEditing ? (
            <div className="flex gap-2">
              <Input
                id="name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEdit();
                  if (e.key === 'Escape') handleCancelEdit();
                }}
                autoFocus
                className="flex-1"
              />
              <Button size="sm" onClick={handleSaveEdit}>
                <Save className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Input value={selectedItem.name} readOnly className="flex-1" />
              <Button size="sm" variant="outline" onClick={handleStartEdit}>
                <Edit3 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <Separator />

        {/* Details Section */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label className="text-sm font-medium">Type</Label>
            <span className="text-sm text-muted-foreground capitalize">
              {selectedItem.data?.type || 'Unknown'}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <Label className="text-sm font-medium">ID</Label>
            <span className="text-sm text-muted-foreground font-mono">
              {selectedItem.id}
            </span>
          </div>

          {selectedItem.data?.path && (
            <div className="flex justify-between items-center">
              <Label className="text-sm font-medium">Path</Label>
              <span className="text-sm text-muted-foreground font-mono truncate max-w-32">
                {selectedItem.data.path}
              </span>
            </div>
          )}

          {selectedItem.data?.size !== undefined && (
            <div className="flex justify-between items-center">
              <Label className="text-sm font-medium flex items-center gap-1">
                <HardDrive className="h-4 w-4" />
                Size
              </Label>
              <span className="text-sm text-muted-foreground">
                {formatFileSize(selectedItem.data.size)}
              </span>
            </div>
          )}

          {selectedItem.data?.lastModified && (
            <div className="flex justify-between items-center">
              <Label className="text-sm font-medium flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Modified
              </Label>
              <span className="text-sm text-muted-foreground">
                {selectedItem.data.lastModified.toLocaleDateString()}
              </span>
            </div>
          )}
        </div>

        <Separator />

        {/* Attributes Section */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Attributes</Label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className={`p-2 rounded text-center ${selectedItem.draggable ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
              Draggable
            </div>
            <div className={`p-2 rounded text-center ${selectedItem.droppable ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-500'}`}>
              Droppable
            </div>
          </div>
        </div>

        <Separator />

        {/* Actions Section */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Actions</Label>
          <div className="flex gap-2">
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                  disabled={selectedItem.id === 'root'}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirm Delete</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete "{selectedItem.name}"? This action cannot be undone.
                    {selectedItem.data?.type === 'folder' && selectedItem.children && selectedItem.children.length > 0 && (
                      <span className="block mt-2 text-red-600 font-medium">
                        This folder contains {selectedItem.children.length} item(s) which will also be deleted.
                      </span>
                    )}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={handleDeleteCancel}>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={handleDeleteConfirm}>
                    Delete
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          {selectedItem.id === 'root' && (
            <p className="text-xs text-muted-foreground">
              Root node cannot be deleted
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 