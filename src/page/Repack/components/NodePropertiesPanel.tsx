import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { DualValueProperty } from "@/components/ui/dual-value-property";
import { Trash2, Edit3, Save, X, Folder, FileText, Calendar, HardDrive, Copy, Clipboard, Info } from "lucide-react";
import { TreeDataItem } from "@/lib/utils";
import { useRepackStore } from "@/store/repackStore";
import { toast } from 'sonner';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogOverlay, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { hexDisplayToInt32 } from "@/module/commonFunc";

interface ExtendedTreeDataItem extends TreeDataItem {
  icon?: any;
  selectedIcon?: any;
  openIcon?: any;
  actions?: React.ReactNode;
  onClick?: () => void;
  draggable?: boolean;
  droppable?: boolean;
  disabled?: boolean;
}

interface NodePropertiesPanelProps {
  selectedItem: ExtendedTreeDataItem | undefined;
  onRename: (nodeId: string, newName: string) => void;
  onDelete: (nodeId: string) => void;
  onFileTypeChange: (nodeId: string, fileType: string) => void;
  onPropertyChange: (nodeId: string, property: string, value: string | number) => void;
  copiedItem: TreeDataItem | null;
  onPaste: () => void;
}

// File type options based on getFileType function
const fileTypeOptions = [
  { value: ".nushdb", label: ".nushdb", type: 0xa },
  { value: ".nutexb", label: ".nutexb", type: 0xb },
  { value: ".nusktb", label: ".nusktb", type: 0xc },
  { value: ".numatb", label: ".numatb", type: 0xd },
  { value: ".numshb", label: ".numshb", type: 0xe },
  { value: ".numdlb", label: ".numdlb", type: 0xf },
  { value: ".nuhlpb", label: ".nuhlpb", type: 0x13 },
  { value: ".nus3bank", label: ".nus3bank", type: 0x14 },
  { value: ".nudnbb", label: ".nudnbb", type: 0x17 },
  { value: ".nufxlb", label: ".nufxlb", type: 0x18 },
  { value: ".nurpdb", label: ".nurpdb", type: 0x19 },
  { value: ".bin", label: ".bin", type: 0 },
];


// EditableProperty component moved outside to prevent re-creation on each render
const EditableProperty = ({
  label,
  value,
  property,
  editable = false,
  type = 'input',
  editingProperty,
  editValue,
  validationError,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onValueChange
}: {
  label: string;
  value: string | number | undefined;
  property: string;
  editable?: boolean;
  type?: 'input' | 'textarea';
  editingProperty: string | null;
  editValue: string;
  validationError: string;
  onStartEdit: (property: string, value: string | number) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onValueChange: (value: string) => void;
}) => {
  const isEditing = editingProperty === property;
  const displayValue = value !== undefined ? String(value) : '';

  if (type === 'textarea') {
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium">{label}</Label>
        {editable && !isEditing ? (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground font-mono p-2 bg-muted rounded-md min-h-[60px] whitespace-pre-wrap break-all">
              {displayValue || 'No value'}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => onStartEdit(property, value || '')}
            >
              <Edit3 className="h-3 w-3 mr-2" />
              Edit
            </Button>
          </div>
        ) : editable && isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={editValue}
              onChange={(e) => onValueChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) onSaveEdit();
                if (e.key === 'Escape') onCancelEdit();
              }}
              className="min-h-[60px]"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={onSaveEdit} className="flex-1">
                <Save className="h-3 w-3 mr-2" />
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={onCancelEdit} className="flex-1">
                <X className="h-3 w-3 mr-2" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground font-mono p-2 bg-muted rounded-md min-h-[60px] whitespace-pre-wrap break-all">
            {displayValue || 'No value'}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex justify-between items-center">
      <Label className="text-sm font-medium">{label}</Label>
      {editable && !isEditing ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground font-mono">
            {displayValue}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => onStartEdit(property, value || '')}
          >
            <Edit3 className="h-3 w-3" />
          </Button>
        </div>
      ) : editable && isEditing ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Input
              value={editValue}
              onChange={(e) => onValueChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveEdit();
                if (e.key === 'Escape') onCancelEdit();
              }}
              onFocus={(e) => {
                // Move cursor to end of text when focused
                const target = e.target;
                setTimeout(() => {
                  target.selectionStart = target.value.length;
                  target.selectionEnd = target.value.length;
                }, 0);
              }}
              className={`h-6 w-20 text-sm ${validationError ? 'border-red-500' : ''}`}
              autoFocus
            />
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onSaveEdit}>
              <Save className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onCancelEdit}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          {validationError && (
            <div className="text-xs text-red-500 mt-1">
              {validationError}
            </div>
          )}
        </div>
      ) : (
        <span className="text-sm text-muted-foreground font-mono">
          {displayValue}
        </span>
      )}
    </div>
  );
};

export function NodePropertiesPanel({ selectedItem, onRename, onDelete, onFileTypeChange, onPropertyChange, copiedItem, onPaste }: NodePropertiesPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [validationError, setValidationError] = useState<string>("");

  const { isIndexExists, isFileIndexExists, copyNode } = useRepackStore();

  useEffect(() => {
    setIsEditing(false);
    setEditName("");
    setEditingProperty(null);
    setEditValue("");
    setValidationError("");
  }, [selectedItem?.id]);

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

  const handleCopy = () => {
    if (selectedItem) {
      copyNode(selectedItem.id);

      // Show success message
      const itemType = selectedItem.data?.type || 'item';
      const itemTypeText = itemType === 'Folder' ? 'folder' : 'file';
      const childrenCount = selectedItem.children ? selectedItem.children.length : 0;
      const childrenText = childrenCount > 0 ? ` (including ${childrenCount} items)` : '';
      toast.success(`Successfully copied ${itemTypeText}: "${selectedItem.name}"${childrenText}`);
    }
  };

  const handleFileTypeChange = (newFileType: string) => {
    if (selectedItem) {
      onFileTypeChange(selectedItem.id, newFileType);
    }
  };

  const handleStartPropertyEdit = (property: string, currentValue: string | number) => {
    setEditingProperty(property);
    setEditValue(String(currentValue));
    setValidationError("");
  };

  const handleSavePropertyEdit = () => {
    if (selectedItem && editingProperty) {
      // Clear previous validation error
      setValidationError("");

      let value: string | number;

      // Special handling for unk3 property
      if (editingProperty === 'unk3') {
        try {
          // Try to parse as hex first (if it contains spaces or is 8 chars)
          if (editValue.includes(' ') || (editValue.replace(/\s+/g, '').length === 8 && /^[0-9A-F\s]+$/i.test(editValue))) {
            value = hexDisplayToInt32(editValue);
          } else {
            // Parse as integer
            value = parseInt(editValue) || 0;
          }
        } catch (error) {
          setValidationError('Invalid hex or integer format');
          return;
        }
      } else if (editingProperty.includes('Index') || editingProperty.includes('unk')) {
        value = editingProperty.startsWith('unk') ? editValue : parseInt(editValue) || 0;
      } else {
        value = editValue;
      }

      // Validate index for duplicates (only for index, not fileIndex)
      if (editingProperty === 'index' && selectedItem.data?.type === 'Item') {
        const newIndex = parseInt(editValue) || 0;
        if (newIndex !== selectedItem.data.index && isIndexExists(newIndex)) {
          setValidationError(`Index ${newIndex} already exists in SubFileData`);
          return;
        }
      }

      onPropertyChange(selectedItem.id, editingProperty, value);
      setEditingProperty(null);
      setEditValue("");
    }
  };

  const handleCancelPropertyEdit = () => {
    setEditingProperty(null);
    setEditValue("");
    setValidationError("");
  };

  const formatFileSize = (bytes: number | undefined): string => {
    if (!bytes) return "0 B";
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  if (!selectedItem) {
    return (
      <Card className="flex h-full min-h-0 flex-col overflow-hidden rounded-none">
        <CardHeader className="shrink-0">
          <CardTitle>Properties</CardTitle>
          <CardDescription>Select an item to view its properties</CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div className="text-center text-muted-foreground py-8">
            <Folder className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No item selected</p>
          </div>
          
          {/* Clipboard Status - Show even when no item is selected */}
          {copiedItem && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="text-sm font-medium">Clipboard</Label>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-900">
                      {copiedItem.name}
                    </span>
                    <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                      {copiedItem.data?.type || 'Unknown'}
                    </span>
                    {copiedItem.data?.type === 'Item' && copiedItem.data?.fileType && (
                      <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full">
                        {copiedItem.data.fileType}
                      </span>
                    )}
                    {copiedItem.data?.type === 'Folder' && copiedItem.children && (
                      <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
                        {copiedItem.children.length} items
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-blue-600 mt-1">
                    Select a folder to paste this item
                  </p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden rounded-none">
      <CardHeader className="shrink-0">
        <CardTitle className="flex items-center gap-2">
          {selectedItem.data?.type === 'Folder' ? (
            <Folder className="h-5 w-5" />
          ) : (
            <FileText className="h-5 w-5" />
          )}
          Properties
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto">
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
                onFocus={(e) => {
                  // Move cursor to end of text when focused
                  const target = e.target;
                  setTimeout(() => {
                    target.selectionStart = target.value.length;
                    target.selectionEnd = target.value.length;
                  }, 0);
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

          {selectedItem.data?.fileUrl !== undefined && (
            <EditableProperty
              label="File URL"
              value={selectedItem.data.fileUrl}
              property="fileUrl"
              editable={true}
              type="textarea"
              editingProperty={editingProperty}
              editValue={editValue}
              validationError={validationError}
              onStartEdit={handleStartPropertyEdit}
              onSaveEdit={handleSavePropertyEdit}
              onCancelEdit={handleCancelPropertyEdit}
              onValueChange={setEditValue}
            />
          )}

          {selectedItem.data?.fileType && (
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">File Type</Label>
              <Select
                value={selectedItem.data.fileType}
                onValueChange={handleFileTypeChange}
              >
                <SelectTrigger className="w-32 h-8 text-sm">
                  <SelectValue placeholder="Select file type" />
                </SelectTrigger>
                <SelectContent>
                  {fileTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedItem.data?.fileIndex !== undefined && (
            <EditableProperty
              label="File Index"
              value={selectedItem.data.fileIndex}
              property="fileIndex"
              editable={selectedItem.data?.type === 'Item'}
              editingProperty={editingProperty}
              editValue={editValue}
              validationError={validationError}
              onStartEdit={handleStartPropertyEdit}
              onSaveEdit={handleSavePropertyEdit}
              onCancelEdit={handleCancelPropertyEdit}
              onValueChange={setEditValue}
            />
          )}

          {selectedItem.data?.originalFileIndex !== undefined && (
            <EditableProperty
              label="Original File Index"
              value={selectedItem.data.originalFileIndex}
              property="originalFileIndex"
              editable={selectedItem.data?.type === 'Item'}
              editingProperty={editingProperty}
              editValue={editValue}
              validationError={validationError}
              onStartEdit={handleStartPropertyEdit}
              onSaveEdit={handleSavePropertyEdit}
              onCancelEdit={handleCancelPropertyEdit}
              onValueChange={setEditValue}
            />
          )}

          {selectedItem.data?.type === 'Item' && selectedItem.data?.isError !== undefined && (
            <div className="flex justify-between items-center">
              <Label className="text-sm font-medium">Is Error</Label>
              <span className="text-sm text-muted-foreground">
                {selectedItem.data.isError ? 'Yes' : 'No'}
              </span>
            </div>
          )}

          {selectedItem.data?.type === 'Item' && selectedItem.data?.originChunkCount !== undefined && (
            <div className="flex justify-between items-center">
              <Label className="text-sm font-medium">Origin Chunk Count</Label>
              <span className="text-sm text-muted-foreground">
                {selectedItem.data.originChunkCount}
              </span>
            </div>
          )}

          {selectedItem.data?.type === 'Item' && selectedItem.data?.errorOriginSize !== undefined && (
            <div className="flex justify-between items-center">
              <Label className="text-sm font-medium">Error Origin Size</Label>
              <span className="text-sm text-muted-foreground">
                {formatFileSize(selectedItem.data.errorOriginSize)}
              </span>
            </div>
          )}

          {selectedItem.data?.type === 'Item' && selectedItem.data?.errorCompBufferData && (
            <div className="flex justify-between items-center">
              <Label className="text-sm font-medium">Error Comp Buffer Data</Label>
              <span className="text-sm text-muted-foreground">
                [Object]
              </span>
            </div>
          )}

          {selectedItem.data?.type === 'Item' && selectedItem.data?.originBinChunkBuffer && (
            <div className="flex justify-between items-center">
              <Label className="text-sm font-medium">Origin Bin Chunk Buffer</Label>
              <span className="text-sm text-muted-foreground">
                [Object]
              </span>
            </div>
          )}

          {selectedItem.data?.type === 'Folder' && selectedItem.data?.folderCount !== undefined && (
            <div className="flex justify-between items-center">
              <Label className="text-sm font-medium">Folder Count</Label>
              <span className="text-sm text-muted-foreground">
                {selectedItem.data.folderCount}
              </span>
            </div>
          )}

          {selectedItem.data?.unk1 !== undefined && (
            <EditableProperty
              label="Unk1"
              value={selectedItem.data.unk1}
              property="unk1"
              editable={true}
              editingProperty={editingProperty}
              editValue={editValue}
              validationError={validationError}
              onStartEdit={handleStartPropertyEdit}
              onSaveEdit={handleSavePropertyEdit}
              onCancelEdit={handleCancelPropertyEdit}
              onValueChange={setEditValue}
            />
          )}

          {selectedItem.data?.unk2 !== undefined && (
            <EditableProperty
              label="Unk2"
              value={selectedItem.data.unk2}
              property="unk2"
              editable={true}
              editingProperty={editingProperty}
              editValue={editValue}
              validationError={validationError}
              onStartEdit={handleStartPropertyEdit}
              onSaveEdit={handleSavePropertyEdit}
              onCancelEdit={handleCancelPropertyEdit}
              onValueChange={setEditValue}
            />
          )}

          {selectedItem.data?.unk3 !== undefined && (
            <DualValueProperty
              label="Unk3"
              value={selectedItem.data.unk3}
              property="unk3"
              editable={selectedItem.data?.type === 'Item' || selectedItem.data?.type === 'Folder'}
              editingProperty={editingProperty}
              editValue={editValue}
              validationError={validationError}
              onStartEdit={handleStartPropertyEdit}
              onSaveEdit={handleSavePropertyEdit}
              onCancelEdit={handleCancelPropertyEdit}
              onValueChange={setEditValue}
              showHex={true}
            />
          )}

          {selectedItem.data?.unk4 !== undefined && (
            <DualValueProperty
              label="Unk4"
              value={selectedItem.data.unk4}
              property="unk4"
              editable={selectedItem.data?.type === 'Folder'}
              editingProperty={editingProperty}
              editValue={editValue}
              validationError={validationError}
              onStartEdit={handleStartPropertyEdit}
              onSaveEdit={handleSavePropertyEdit}
              onCancelEdit={handleCancelPropertyEdit}
              onValueChange={setEditValue}
              showHex={true}
            />
          )}

          {selectedItem.data?.link && (
            <div className="flex justify-between items-center">
              <Label className="text-sm font-medium">Link</Label>
              <span className="text-sm text-muted-foreground">
                {selectedItem.data.link ? 'Yes' : 'No'}
              </span>
            </div>
          )}
        </div>
        <Separator />

        {/* Clipboard Status */}
        {copiedItem && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Clipboard</Label>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">
                  {copiedItem.name}
                </span>
                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                  {copiedItem.data?.type || 'Unknown'}
                </span>
                {copiedItem.data?.type === 'Item' && copiedItem.data?.fileType && (
                  <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full">
                    {copiedItem.data.fileType}
                  </span>
                )}
                {copiedItem.data?.type === 'Folder' && copiedItem.children && (
                  <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
                    {copiedItem.children.length} items
                  </span>
                )}
              </div>
              <p className="text-xs text-blue-600 mt-1">
                Select a folder to paste this item
              </p>
            </div>
          </div>
        )}

        <Separator />
        
        {/* Actions Section */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Actions</Label>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleCopy}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy
            </Button>
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              {/* <AlertDialogOverlay className="none" /> */}
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                  disabled={selectedItem.id === 'root'}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{selectedItem.name}"? This action cannot be undone.
                    {selectedItem.data?.type === 'Folder' && selectedItem.children && selectedItem.children.length > 0 && (
                      <span className="block mt-2 text-red-600 font-medium">
                        This folder contains {selectedItem.children.length} item(s) which will also be deleted.
                      </span>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <Button variant="outline" onClick={handleDeleteCancel}>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={handleDeleteConfirm}>
                    Delete
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          {copiedItem && (
            <Button
              onClick={onPaste}
              disabled={!selectedItem || selectedItem.data?.type !== 'Folder'}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <Clipboard className="h-4 w-4 mr-2" />
              Paste
            </Button>
          )}
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