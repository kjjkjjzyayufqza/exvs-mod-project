import { useState, useCallback, memo } from "react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, RotateCcw, Trash2, Plus, Edit3, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { FileInfo, useNumatbStore, getParamType, ParamDataType, COMMON_ATTRIBUTES } from "../../../store/numatbStore";

interface FileDialogProps {
  file: FileInfo;
}

// Component for adding new attributes
interface AddAttributeProps {
  materialIndex: number;
  existingAttributes: string[];
  onAdd: (paramId: string) => void;
}

const AddAttributeComponent = memo(function AddAttributeComponent({ materialIndex, existingAttributes, onAdd }: AddAttributeProps) {
  const [selectedAttribute, setSelectedAttribute] = useState<string>("");
  
  // Filter out already existing attributes
  const availableAttributes = COMMON_ATTRIBUTES.filter(
    attr => !existingAttributes.includes(attr)
  );

  const handleAdd = useCallback(() => {
    if (selectedAttribute) {
      onAdd(selectedAttribute);
      setSelectedAttribute("");
    }
  }, [selectedAttribute, onAdd]);

  if (availableAttributes.length === 0) {
    return (
      <div className="text-xs text-gray-400 p-2">
        All common attributes are already added
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      <Select value={selectedAttribute} onValueChange={setSelectedAttribute}>
        <SelectTrigger className="flex-1 h-8 text-xs">
          <SelectValue placeholder="Select attribute to add..." />
        </SelectTrigger>
        <SelectContent>
          {availableAttributes.map((attr) => (
            <SelectItem key={attr} value={attr} className="text-xs">
              {attr}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        onClick={handleAdd}
        disabled={!selectedAttribute}
        size="sm"
        className="h-8 px-2"
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
});

// Component for editing different data types
interface AttributeEditorProps {
  attribute: any;
  materialIndex: number;
  attributeIndex: number;
  onUpdate: (value: any, dataType: ParamDataType) => void;
  onDelete: () => void;
}

const AttributeEditor = memo(function AttributeEditor({ attribute, materialIndex, attributeIndex, onUpdate, onDelete }: AttributeEditorProps) {
  const dataType = getParamType(attribute.param_id, attribute.param.data);
  const data = attribute.param.data;

  const handleUpdate = useCallback((newValue: any) => {
    onUpdate(newValue, dataType);
  }, [onUpdate, dataType]);

  const renderEditor = () => {
    switch (dataType) {
      case 'Boolean':
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={`${materialIndex}-${attributeIndex}-bool`}
              checked={data.Boolean === 1}
              onCheckedChange={(checked) => handleUpdate(checked ? 1 : 0)}
            />
            <Label htmlFor={`${materialIndex}-${attributeIndex}-bool`} className="text-sm">
              {data.Boolean === 1 ? 'True' : 'False'}
            </Label>
          </div>
        );

      case 'Float':
      case 'Float1':
        return (
          <Input
            type="number"
            step="0.01"
            value={data.Float !== undefined ? data.Float : data.Float1 || 0}
            onChange={(e) => handleUpdate(parseFloat(e.target.value) || 0)}
            className="text-sm"
          />
        );

      case 'String':
        return (
          <Input
            value={data.String || ""}
            onChange={(e) => handleUpdate(e.target.value)}
            placeholder="Enter text..."
            className="text-sm font-mono"
          />
        );

      case 'String1':
        return (
          <Input
            value={data.String1 || ""}
            onChange={(e) => handleUpdate(e.target.value)}
            placeholder="Enter text..."
            className="text-sm font-mono"
          />
        );

      case 'Vector4':
        const vector = data.Vector4 || { x: 0, y: 0, z: 0, w: 0 };
        return (
          <div className="grid grid-cols-4 gap-1">
            <Input
              type="number"
              step="0.01"
              placeholder="X"
              value={vector.x}
              onChange={(e) => handleUpdate({ ...vector, x: parseFloat(e.target.value) || 0 })}
              className="text-xs"
            />
            <Input
              type="number"
              step="0.01"
              placeholder="Y"
              value={vector.y}
              onChange={(e) => handleUpdate({ ...vector, y: parseFloat(e.target.value) || 0 })}
              className="text-xs"
            />
            <Input
              type="number"
              step="0.01"
              placeholder="Z"
              value={vector.z}
              onChange={(e) => handleUpdate({ ...vector, z: parseFloat(e.target.value) || 0 })}
              className="text-xs"
            />
            <Input
              type="number"
              step="0.01"
              placeholder="W"
              value={vector.w}
              onChange={(e) => handleUpdate({ ...vector, w: parseFloat(e.target.value) || 0 })}
              className="text-xs"
            />
          </div>
        );

      case 'Unk7':
        const color = data.Unk7 || { r: 0, g: 0, b: 0, a: 0 };
        return (
          <div className="grid grid-cols-4 gap-1">
            <Input
              type="number"
              step="0.01"
              placeholder="R"
              value={color.r}
              onChange={(e) => handleUpdate({ ...color, r: parseFloat(e.target.value) || 0 })}
              className="text-xs"
            />
            <Input
              type="number"
              step="0.01"
              placeholder="G"
              value={color.g}
              onChange={(e) => handleUpdate({ ...color, g: parseFloat(e.target.value) || 0 })}
              className="text-xs"
            />
            <Input
              type="number"
              step="0.01"
              placeholder="B"
              value={color.b}
              onChange={(e) => handleUpdate({ ...color, b: parseFloat(e.target.value) || 0 })}
              className="text-xs"
            />
            <Input
              type="number"
              step="0.01"
              placeholder="A"
              value={color.a}
              onChange={(e) => handleUpdate({ ...color, a: parseFloat(e.target.value) || 0 })}
              className="text-xs"
            />
          </div>
        );

      case 'Sampler':
        return (
          <div className="text-xs text-gray-500 p-2 bg-gray-50 rounded">
            Sampler (Complex - Read Only)
          </div>
        );

      default:
        return (
          <div className="text-xs text-gray-400">
            Unknown type
          </div>
        );
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <div className="flex-1">
        {renderEditor()}
      </div>
      <Button
        onClick={onDelete}
        variant="outline"
        size="sm"
        className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
});

// Optimized Material component to prevent unnecessary re-renders
interface MaterialCardProps {
  material: any;
  materialIndex: number;
  editingLabel: number | null;
  editingLabelValue: string;
  onStartEditLabel: (materialIndex: number, currentLabel: string) => void;
  onSaveLabelEdit: (materialIndex: number) => void;
  onCancelLabelEdit: () => void;
  onAddAttribute: (materialIndex: number, paramId: string) => void;
  onAttributeUpdate: (materialIndex: number, attributeIndex: number, newValue: any, dataType: ParamDataType) => void;
  onRemoveAttribute: (materialIndex: number, attributeIndex: number) => void;
  setEditingLabelValue: (value: string) => void;
}

const MaterialCard = memo(function MaterialCard({
  material,
  materialIndex,
  editingLabel,
  editingLabelValue,
  onStartEditLabel,
  onSaveLabelEdit,
  onCancelLabelEdit,
  onAddAttribute,
  onAttributeUpdate,
  onRemoveAttribute,
  setEditingLabelValue
}: MaterialCardProps) {
  // Helper function to check if an attribute is a string type
  const isStringAttribute = useCallback((attr: any) => {
    return attr.param.data.String !== undefined || attr.param.data.String1 !== undefined;
  }, []);

  const handleAttributeUpdate = useCallback((newValue: any, dataType: ParamDataType, attributeIndex: number) => {
    onAttributeUpdate(materialIndex, attributeIndex, newValue, dataType);
  }, [materialIndex, onAttributeUpdate]);

  const handleRemoveAttribute = useCallback((attributeIndex: number) => {
    onRemoveAttribute(materialIndex, attributeIndex);
  }, [materialIndex, onRemoveAttribute]);

  const handleAddAttribute = useCallback((paramId: string) => {
    onAddAttribute(materialIndex, paramId);
  }, [materialIndex, onAddAttribute]);

  const handleStartEditLabel = useCallback(() => {
    onStartEditLabel(materialIndex, material.material_label);
  }, [materialIndex, material.material_label, onStartEditLabel]);

  const handleSaveLabelEdit = useCallback(() => {
    onSaveLabelEdit(materialIndex);
  }, [materialIndex, onSaveLabelEdit]);

  return (
    <Card className="p-3">
      <div className="space-y-3">
        {/* Material label with edit functionality */}
        <div className="flex items-center justify-between">
          {editingLabel === materialIndex ? (
            <div className="flex items-center space-x-2 flex-1">
              <Input
                value={editingLabelValue}
                onChange={(e) => setEditingLabelValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveLabelEdit();
                  }
                  if (e.key === 'Escape') {
                    onCancelLabelEdit();
                  }
                }}
                autoFocus
                className="text-lg font-semibold"
                placeholder="Enter material label..."
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSaveLabelEdit}
                className="h-6 w-6 p-0"
                title="Save (Enter)"
              >
                <Save className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancelLabelEdit}
                className="h-6 w-6 p-0"
                title="Cancel (Escape)"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <h4 className="font-semibold text-lg">{material.material_label}</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleStartEditLabel}
                className="h-6 w-6 p-0"
                title="Edit label"
              >
                <Edit3 className="h-3 w-3" />
              </Button>
            </div>
          )}
          <span className="text-sm text-gray-500">{material.shader_label}</span>
        </div>
        
        {/* Texture paths section */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Texture Paths</Label>
          {material.attributes
            .map((attribute: any, attributeIndex: number) => ({ attribute, attributeIndex }))
            .filter(({ attribute }: any) => isStringAttribute(attribute))
            .map(({ attribute, attributeIndex }: any) => (
              <div key={`${materialIndex}-${attributeIndex}-${attribute.param_id}`} className="space-y-1">
                <Label className="text-xs text-gray-600">{attribute.param_id}</Label>
                <AttributeEditor
                  attribute={attribute}
                  materialIndex={materialIndex}
                  attributeIndex={attributeIndex}
                  onUpdate={(value, dataType) => handleAttributeUpdate(value, dataType, attributeIndex)}
                  onDelete={() => handleRemoveAttribute(attributeIndex)}
                />
              </div>
            ))}
        </div>
        
        <Separator className="my-2" />
        
        {/* Other attributes section */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Other Attributes</Label>
          <div className="grid grid-cols-1 gap-2">
            {material.attributes
              .map((attribute: any, attributeIndex: number) => ({ attribute, attributeIndex }))
              .filter(({ attribute }: any) => !isStringAttribute(attribute))
              .map(({ attribute, attributeIndex }: any) => {
                const dataType = getParamType(attribute.param_id, attribute.param.data);
                
                return (
                  <div key={`${materialIndex}-${attributeIndex}-${attribute.param_id}`} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-gray-600 font-medium">
                        {attribute.param_id}
                      </Label>
                      <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">
                        {dataType}
                      </span>
                    </div>
                    <AttributeEditor
                      attribute={attribute}
                      materialIndex={materialIndex}
                      attributeIndex={attributeIndex}
                      onUpdate={(value, dataType) => handleAttributeUpdate(value, dataType, attributeIndex)}
                      onDelete={() => handleRemoveAttribute(attributeIndex)}
                    />
                  </div>
                );
              })}
          </div>
        </div>

        <Separator className="my-2" />

        {/* Add new attribute section */}
        <div className="space-y-1">
          <Label className="text-sm font-medium">Add New Attribute</Label>
          <AddAttributeComponent
            materialIndex={materialIndex}
            existingAttributes={material.attributes.map((attr: any) => attr.param_id)}
            onAdd={handleAddAttribute}
          />
        </div>
      </div>
    </Card>
  );
});

export function FileDialog({ file }: FileDialogProps) {
  const store = useNumatbStore();
  const { numatbData, isConverting, isSaving, error, updateAttribute, updateMaterialLabel, addAttribute, removeAttribute, addMaterialEntry, saveFile, convertFile } = store;
  const [hasChanges, setHasChanges] = useState(false);
  const [editingLabel, setEditingLabel] = useState<number | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState<string>("");


  const handleAttributeUpdate = useCallback((materialIndex: number, attributeIndex: number, newValue: any, dataType: ParamDataType) => {
    updateAttribute(materialIndex, attributeIndex, newValue, dataType);
    setHasChanges(true);
  }, [updateAttribute]);

  const handleAddAttribute = useCallback((materialIndex: number, paramId: string) => {
    addAttribute(materialIndex, paramId);
    setHasChanges(true);
  }, [addAttribute]);

  const handleRemoveAttribute = useCallback((materialIndex: number, attributeIndex: number) => {
    removeAttribute(materialIndex, attributeIndex);
    setHasChanges(true);
  }, [removeAttribute]);

  const handleStartEditLabel = useCallback((materialIndex: number, currentLabel: string) => {
    setEditingLabel(materialIndex);
    setEditingLabelValue(currentLabel);
  }, []);

  const handleSaveLabelEdit = useCallback((materialIndex: number) => {
    if (editingLabelValue.trim() !== "") {
      updateMaterialLabel(materialIndex, editingLabelValue.trim());
      setHasChanges(true);
    }
    setEditingLabel(null);
    setEditingLabelValue("");
  }, [editingLabelValue, updateMaterialLabel]);

  const handleCancelLabelEdit = useCallback(() => {
    setEditingLabel(null);
    setEditingLabelValue("");
  }, []);

  const handleAddMaterialEntry = useCallback(() => {
    addMaterialEntry();
    setHasChanges(true);
  }, [addMaterialEntry]);

  const handleSave = useCallback(async () => {
    await saveFile();
    setHasChanges(false);
  }, [saveFile]);

  const handleReset = useCallback(() => {
    convertFile(file);
    setHasChanges(false);
  }, [convertFile, file]);

  if (isConverting) {
    return (
      <div className="flex items-center justify-center p-8">
        <DialogHeader>
          <DialogTitle>Edit {file.name}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center space-x-3">
          <Loader2 className="animate-spin h-5 w-5" />
          <span>Converting file...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-4">
        <DialogHeader>
          <DialogTitle>Edit {file.name}</DialogTitle>
        </DialogHeader>
        <span className="text-red-600">{error}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => convertFile(file)}
        >
          Try Again
        </Button>
      </div>
    );
  }

  if (numatbData) {
    const materials = numatbData.Matl?.V16?.entries || [];

    return (
      <>
        <DialogHeader>
          <DialogTitle>Edit {file.name}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-3">
          {/* Action buttons */}
          <div className="flex justify-between items-center">
            <div className="flex space-x-2">
              <Button
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                size="sm"
                className="flex items-center space-x-2"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span>{isSaving ? "Saving..." : "Save"}</span>
              </Button>
              
              <Button
                onClick={handleReset}
                disabled={isConverting || isSaving}
                variant="outline"
                size="sm"
                className="flex items-center space-x-2"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Reset</span>
              </Button>

              <Button
                onClick={handleAddMaterialEntry}
                disabled={isConverting || isSaving}
                variant="outline"
                size="sm"
                className="flex items-center space-x-2"
              >
                <Plus className="h-4 w-4" />
                <span>Add Entry</span>
              </Button>
            </div>
            
            {hasChanges && (
              <span className="text-sm text-orange-600">Unsaved changes</span>
            )}
          </div>

          <Separator />

          {/* Materials list */}
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {materials.map((material, materialIndex) => (
              <MaterialCard
                key={`material-${materialIndex}-${material.material_label}`}
                material={material}
                materialIndex={materialIndex}
                editingLabel={editingLabel}
                editingLabelValue={editingLabelValue}
                onStartEditLabel={handleStartEditLabel}
                onSaveLabelEdit={handleSaveLabelEdit}
                onCancelLabelEdit={handleCancelLabelEdit}
                onAddAttribute={handleAddAttribute}
                onAttributeUpdate={handleAttributeUpdate}
                onRemoveAttribute={handleRemoveAttribute}
                setEditingLabelValue={setEditingLabelValue}
              />
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <div>
      <DialogHeader>
        <DialogTitle>Edit {file.name}</DialogTitle>
      </DialogHeader>
      <div className="flex items-center justify-center h-32 text-gray-500">
        No data to display
      </div>
    </div>
  );
}
