import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { open } from "@tauri-apps/plugin-dialog";
import { useNumatbStore, COMMON_ATTRIBUTES, getParamType, type ParamDataType } from "@/store/numatbStore";
import { toast } from "sonner";
import { Loader2, FileEdit, Save, RotateCcw, X, Plus, Copy, Trash2, Edit3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface NumatbEditorProps {
    onClose?: () => void;
}

// Component for editing different data types
interface AttributeEditorProps {
    attribute: any;
    materialIndex: number;
    attributeIndex: number;
    onUpdate: (value: any, dataType: ParamDataType) => void;
    onDelete: () => void;
}

function AttributeEditor({ attribute, materialIndex, attributeIndex, onUpdate, onDelete }: AttributeEditorProps) {
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
                    <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded">
                        Sampler (Complex - Read Only)
                    </div>
                );

            default:
                return (
                    <div className="text-xs text-muted-foreground">
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
}

export function NumatbEditor({ onClose }: NumatbEditorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [editingLabel, setEditingLabel] = useState<number | null>(null);
    const [editingLabelValue, setEditingLabelValue] = useState<string>("");
    const [selectedMaterialIndex, setSelectedMaterialIndex] = useState<number>(0);
    const [materialToDelete, setMaterialToDelete] = useState<number | null>(null);

    const {
        selectedFile,
        numatbData,
        isConverting,
        isSaving,
        error,
        convertFile,
        resetConversion,
        updateAttribute,
        updateMaterialLabel,
        addAttribute,
        removeAttribute,
        addMaterialEntry,
        copyMaterialAsNew,
        removeMaterialEntry,
        saveFile,
    } = useNumatbStore();

    const handleSelectFile = async () => {
        try {
            const selected = await open({
                multiple: false,
                directory: false,
                filters: [
                    {
                        name: "Numatb Files",
                        extensions: ["numatb"]
                    }
                ]
            });

            if (selected && typeof selected === "string") {
                const fileName = selected.split(/[/\\]/).pop() || "unknown.numatb";
                await convertFile({
                    name: fileName,
                    path: selected
                });
                toast.success(`Loaded ${fileName}`);
            }
        } catch (error) {
            console.error("Error selecting file:", error);
            toast.error(`Failed to load file: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    };

    const handleClose = () => {
        setIsOpen(false);
        resetConversion();
        setHasChanges(false);
        setSelectedMaterialIndex(0);
        onClose?.();
    };

    const handleSave = useCallback(async () => {
        await saveFile();
        setHasChanges(false);
        toast.success("File saved successfully!");
    }, [saveFile]);

    const handleReset = useCallback(() => {
        if (selectedFile) {
            convertFile(selectedFile);
            setHasChanges(false);
        }
    }, [convertFile, selectedFile]);

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
        const currentLength = numatbData?.Matl?.V16?.entries?.length || 0;
        addMaterialEntry();
        setHasChanges(true);
        setSelectedMaterialIndex(currentLength);
    }, [addMaterialEntry, numatbData]);

    const handleCopyMaterialAsNew = useCallback(() => {
        const currentLength = numatbData?.Matl?.V16?.entries?.length || 0;
        copyMaterialAsNew(selectedMaterialIndex);
        setHasChanges(true);
        setSelectedMaterialIndex(currentLength);
    }, [copyMaterialAsNew, selectedMaterialIndex, numatbData]);

    const handleRemoveMaterialEntry = useCallback((materialIndex: number) => {
        const materials = numatbData?.Matl?.V16?.entries || [];
        removeMaterialEntry(materialIndex);
        setHasChanges(true);

        if (materialIndex < selectedMaterialIndex) {
            setSelectedMaterialIndex(selectedMaterialIndex - 1);
        } else if (materialIndex === selectedMaterialIndex) {
            if (materials.length > 1) {
                setSelectedMaterialIndex(Math.max(0, materialIndex - 1));
            } else {
                setSelectedMaterialIndex(0);
            }
        }
    }, [removeMaterialEntry, selectedMaterialIndex, numatbData]);

    // Helper function to check if an attribute is a string type
    const isStringAttribute = useCallback((attr: any) => {
        return attr.param.data.String !== undefined || attr.param.data.String1 !== undefined;
    }, []);

    const renderMaterialDetail = (material: any, materialIndex: number) => {
        const existingAttributes = material.attributes.map((attr: any) => attr.param_id);
        const availableAttributes = COMMON_ATTRIBUTES.filter(
            attr => !existingAttributes.includes(attr)
        );

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
                                            handleSaveLabelEdit(materialIndex);
                                        }
                                        if (e.key === 'Escape') {
                                            handleCancelLabelEdit();
                                        }
                                    }}
                                    autoFocus
                                    className="text-lg font-semibold"
                                    placeholder="Enter material label..."
                                />
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleSaveLabelEdit(materialIndex)}
                                    className="h-6 w-6 p-0"
                                    title="Save (Enter)"
                                >
                                    <Save className="h-3 w-3" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleCancelLabelEdit}
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
                                    onClick={() => handleStartEditLabel(materialIndex, material.material_label)}
                                    className="h-6 w-6 p-0"
                                    title="Edit label"
                                >
                                    <Edit3 className="h-3 w-3" />
                                </Button>
                            </div>
                        )}
                        <span className="text-sm text-muted-foreground">{material.shader_label}</span>
                    </div>

                    {/* Texture paths section */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Texture Paths</Label>
                        {material.attributes
                            .map((attribute: any, attributeIndex: number) => ({ attribute, attributeIndex }))
                            .filter(({ attribute }: any) => isStringAttribute(attribute))
                            .map(({ attribute, attributeIndex }: any) => (
                                <div key={`${materialIndex}-${attributeIndex}-${attribute.param_id}`} className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">{attribute.param_id}</Label>
                                    <AttributeEditor
                                        attribute={attribute}
                                        materialIndex={materialIndex}
                                        attributeIndex={attributeIndex}
                                        onUpdate={(value, dataType) => handleAttributeUpdate(materialIndex, attributeIndex, value, dataType)}
                                        onDelete={() => handleRemoveAttribute(materialIndex, attributeIndex)}
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
                                                <Label className="text-xs text-muted-foreground font-medium">
                                                    {attribute.param_id}
                                                </Label>
                                                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded text-[10px]">
                                                    {dataType}
                                                </span>
                                            </div>
                                            <AttributeEditor
                                                attribute={attribute}
                                                materialIndex={materialIndex}
                                                attributeIndex={attributeIndex}
                                                onUpdate={(value, dataType) => handleAttributeUpdate(materialIndex, attributeIndex, value, dataType)}
                                                onDelete={() => handleRemoveAttribute(materialIndex, attributeIndex)}
                                            />
                                        </div>
                                    );
                                })}
                        </div>
                    </div>

                    <Separator className="my-2" />

                    {/* Add new attribute */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Add Attribute</Label>
                        {availableAttributes.length === 0 ? (
                            <div className="text-xs text-muted-foreground p-2">
                                All common attributes are already added
                            </div>
                        ) : (
                            <div className="flex items-center space-x-2">
                                <Select onValueChange={(value) => handleAddAttribute(materialIndex, value)}>
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
                            </div>
                        )}
                    </div>
                </div>
            </Card>
        );
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline" className="w-full">
                        Open Numatb Editor
                    </Button>
                </DialogTrigger>
                <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileEdit className="h-5 w-5" />
                            Edit {selectedFile?.name || 'Numatb File'}
                        </DialogTitle>
                        <DialogDescription>
                            Select and edit .numatb material files
                        </DialogDescription>
                    </DialogHeader>

                    {!selectedFile ? (
                        <div className="flex items-center justify-center p-8">
                            <Button onClick={handleSelectFile} disabled={isConverting}>
                                {isConverting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Loading...
                                    </>
                                ) : (
                                    <>
                                        <FileEdit className="mr-2 h-4 w-4" />
                                        Select Numatb File
                                    </>
                                )}
                            </Button>
                        </div>
                    ) : isConverting ? (
                        <div className="flex items-center justify-center p-8">
                            <div className="flex items-center space-x-3">
                                <Loader2 className="animate-spin h-5 w-5" />
                                <span>Converting file...</span>
                            </div>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center p-8 space-y-4">
                            <span className="text-red-600">{error}</span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => selectedFile && convertFile(selectedFile)}
                            >
                                Try Again
                            </Button>
                        </div>
                    ) : numatbData ? (
                        <>
                            <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
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

                                        <Button
                                            onClick={handleCopyMaterialAsNew}
                                            disabled={isConverting || isSaving || !numatbData?.Matl?.V16?.entries[selectedMaterialIndex]}
                                            variant="outline"
                                            size="sm"
                                            className="flex items-center space-x-2"
                                        >
                                            <Copy className="h-4 w-4" />
                                            <span>Copy as New</span>
                                        </Button>

                                        <Button
                                            onClick={handleSelectFile}
                                            disabled={isConverting || isSaving}
                                            variant="outline"
                                            size="sm"
                                            className="flex items-center space-x-2"
                                        >
                                            <FileEdit className="h-4 w-4" />
                                            <span>Load Different File</span>
                                        </Button>
                                    </div>

                                    {hasChanges && (
                                        <span className="text-sm text-orange-600">Unsaved changes</span>
                                    )}
                                </div>

                                <Separator />

                                {/* Materials list and detail view */}
                                <div className="flex gap-4 flex-1 overflow-hidden">
                                    {/* Left side: Material list */}
                                    <div className="w-64 flex-shrink-0">
                                        <div className="border rounded-lg p-2 h-full overflow-y-auto">
                                            <Label className="text-sm font-medium mb-2 block">
                                                Materials ({numatbData.Matl.V16.entries.length})
                                            </Label>
                                            <div className="space-y-1">
                                                {numatbData.Matl.V16.entries.map((material, materialIndex) => (
                                                    <div
                                                        key={`material-list-${materialIndex}`}
                                                        className={`group flex items-center justify-between p-2 rounded cursor-pointer text-sm transition-colors ${selectedMaterialIndex === materialIndex
                                                                ? 'bg-blue-100 border border-blue-300'
                                                                : 'hover:bg-muted'
                                                            }`}
                                                        onClick={() => setSelectedMaterialIndex(materialIndex)}
                                                        title={`${material.material_label} (${material.attributes?.length || 0} attributes)`}
                                                    >
                                                        <div className="flex-1 min-w-0">
                                                            <div className="truncate font-medium">
                                                                {material.material_label || `Material ${materialIndex + 1}`}
                                                            </div>
                                                            <div className="text-xs text-muted-foreground truncate">
                                                                {material.shader_label}
                                                            </div>
                                                            <div className="text-xs text-muted-foreground mt-1">
                                                                {material.attributes?.length || 0} attributes
                                                            </div>
                                                        </div>
                                                        <div className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <AlertDialog>
                                                                <AlertDialogTrigger asChild>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setMaterialToDelete(materialIndex);
                                                                        }}
                                                                    >
                                                                        <Trash2 className="h-3 w-3" />
                                                                    </Button>
                                                                </AlertDialogTrigger>
                                                                <AlertDialogContent>
                                                                    <AlertDialogHeader>
                                                                        <AlertDialogTitle>Delete Material</AlertDialogTitle>
                                                                        <AlertDialogDescription>
                                                                            Are you sure you want to delete "{material.material_label || `Material ${materialIndex + 1}`}"?
                                                                            This action cannot be undone.
                                                                        </AlertDialogDescription>
                                                                    </AlertDialogHeader>
                                                                    <AlertDialogFooter>
                                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                        <AlertDialogAction
                                                                            onClick={() => {
                                                                                if (materialToDelete !== null) {
                                                                                    handleRemoveMaterialEntry(materialToDelete);
                                                                                    setMaterialToDelete(null);
                                                                                }
                                                                            }}
                                                                            className="bg-red-600 hover:bg-red-700"
                                                                        >
                                                                            Delete
                                                                        </AlertDialogAction>
                                                                    </AlertDialogFooter>
                                                                </AlertDialogContent>
                                                            </AlertDialog>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right side: Material detail */}
                                    <div className="flex-1 overflow-y-auto">
                                        {numatbData.Matl.V16.entries[selectedMaterialIndex] && renderMaterialDetail(
                                            numatbData.Matl.V16.entries[selectedMaterialIndex],
                                            selectedMaterialIndex
                                        )}
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center justify-center h-32 text-muted-foreground">
                            No data to display
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
