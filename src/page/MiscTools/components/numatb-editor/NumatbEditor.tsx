import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
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
import { open } from "@tauri-apps/plugin-dialog";
import { useNumatbStore, COMMON_ATTRIBUTES, getParamType, type ParamDataType } from "@/store/numatbStore";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Loader2, FileEdit, Save, RotateCcw, X, Plus, Copy, Trash2, Edit3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MaterialLabelCombobox } from "@/components/ssbh-model-preview/components/MaterialLabelCombobox";
import { numatbShaderLabelOptions } from "@/components/ssbh-model-preview/numatbShaderLabelPresets";

interface NumatbEditorProps {
    onClose?: () => void;
}

const MATERIAL_ROW_HEIGHT = 76;
const ATTRIBUTE_ROW_HEIGHT = 76;
const NUMATB_MODAL_DIMENSIONS = {
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 480,
};

// Component for editing different data types
interface AttributeEditorProps {
    attribute: any;
    materialIndex: number;
    attributeIndex: number;
    onUpdate: (value: any, dataType: ParamDataType) => void;
    onDelete: () => void;
}

function AttributeEditor({ attribute, materialIndex, attributeIndex, onUpdate, onDelete }: AttributeEditorProps) {
    const { t } = useTranslation("misc-tools-a");
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
                        <Label htmlFor={`${materialIndex}-${attributeIndex}-bool`} className="text-sm" data-i18n-ignore="">
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
                        placeholder={t("numatb.enterText")}
                        className="text-sm font-mono"
                    />
                );

            case 'String1':
                return (
                    <Input
                        value={data.String1 || ""}
                        onChange={(e) => handleUpdate(e.target.value)}
                        placeholder={t("numatb.enterText")}
                        className="text-sm font-mono"
                    />
                );

            case 'Vector4':
                const vector = data.Vector4 || { x: 0, y: 0, z: 0, w: 0 };
                return (
                    <div className="grid grid-cols-4 gap-1" data-i18n-ignore="">
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
                    <div className="grid grid-cols-4 gap-1" data-i18n-ignore="">
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
                    <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded" data-i18n-ignore="">
                        Sampler (Complex - Read Only)
                    </div>
                );

            default:
                return (
                    <div className="text-xs text-muted-foreground">
                        {t("numatb.unknownType")}
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

interface MaterialDetailProps {
    material: any;
    materialIndex: number;
    editingLabel: number | null;
    editingLabelValue: string;
    onEditingLabelValueChange: (value: string) => void;
    onStartEditLabel: (materialIndex: number, currentLabel: string) => void;
    onSaveLabelEdit: (materialIndex: number) => void;
    onCancelLabelEdit: () => void;
    onAttributeUpdate: (
        materialIndex: number,
        attributeIndex: number,
        newValue: any,
        dataType: ParamDataType,
    ) => void;
    onAddAttribute: (materialIndex: number, paramId: string) => void;
    onRemoveAttribute: (materialIndex: number, attributeIndex: number) => void;
    onChangeShaderLabel: (materialIndex: number, nextShaderLabel: string) => void;
}

const MaterialDetail = memo(function MaterialDetail({
    material,
    materialIndex,
    editingLabel,
    editingLabelValue,
    onEditingLabelValueChange,
    onStartEditLabel,
    onSaveLabelEdit,
    onCancelLabelEdit,
    onAttributeUpdate,
    onAddAttribute,
    onRemoveAttribute,
    onChangeShaderLabel,
}: MaterialDetailProps) {
    const { t } = useTranslation("misc-tools-a");
    const attributeListRef = useRef<HTMLDivElement | null>(null);
    const attributes = useMemo(
        () => (material.attributes ?? []).map((attribute: any, attributeIndex: number) => ({
            attribute,
            attributeIndex,
        })),
        [material.attributes],
    );
    const availableAttributes = useMemo(() => {
        const existingAttributes = new Set(attributes.map(({ attribute }: any) => attribute.param_id));
        return COMMON_ATTRIBUTES.filter((attribute) => !existingAttributes.has(attribute));
    }, [attributes]);
    const getAttributeScrollElement = useCallback(() => attributeListRef.current, []);
    const attributeVirtualizer = useVirtualizer({
        count: attributes.length,
        getScrollElement: getAttributeScrollElement,
        estimateSize: () => ATTRIBUTE_ROW_HEIGHT,
        getItemKey: (index) => {
            const item = attributes[index];
            return item ? `${item.attribute.param_id}-${item.attributeIndex}` : index;
        },
        overscan: 8,
    });

    return (
        <Card className="flex h-full min-h-0 flex-col gap-3 p-3">
            <div className="flex items-center justify-between gap-3">
                {editingLabel === materialIndex ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                        <Input
                            value={editingLabelValue}
                            onChange={(event) => onEditingLabelValueChange(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") onSaveLabelEdit(materialIndex);
                                if (event.key === "Escape") onCancelLabelEdit();
                            }}
                            autoFocus
                            className="text-lg font-semibold"
                            placeholder={t("numatb.enterLabel")}
                        />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onSaveLabelEdit(materialIndex)}
                            className="h-8 w-8 p-0"
                            title={t("numatb.save")}
                        >
                            <Save className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onCancelLabelEdit}
                            className="h-8 w-8 p-0"
                            title={t("numatb.cancel")}
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                ) : (
                    <div className="flex min-w-0 items-center gap-2">
                        <h4 className="truncate text-lg font-semibold" data-i18n-ignore="">{material.material_label}</h4>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onStartEditLabel(materialIndex, material.material_label)}
                            className="h-8 w-8 shrink-0 p-0"
                            title={t("numatb.editLabel")}
                        >
                            <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                )}
                <div className="w-[min(40%,16rem)] shrink-0">
                    <MaterialLabelCombobox
                        value={material.shader_label ?? ""}
                        options={numatbShaderLabelOptions(material.shader_label)}
                        onChange={(nextShaderLabel) => onChangeShaderLabel(materialIndex, nextShaderLabel)}
                        i18nPrefix="shader"
                    />
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Label className="shrink-0 text-sm font-medium">{t("numatb.addAttribute")}</Label>
                {availableAttributes.length === 0 ? (
                    <span className="text-xs text-muted-foreground">{t("numatb.allAttributesAdded")}</span>
                ) : (
                    <Select onValueChange={(value) => onAddAttribute(materialIndex, value)}>
                        <SelectTrigger className="h-8 flex-1 text-xs">
                            <SelectValue placeholder={t("numatb.selectAttribute")} />
                        </SelectTrigger>
                        <SelectContent data-i18n-ignore="">
                            {availableAttributes.map((attribute) => (
                                <SelectItem key={attribute} value={attribute} className="text-xs">
                                    {attribute}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            <Separator />

            <div className="text-sm font-medium">{t("numatb.attributes", { count: attributes.length })}</div>
            {attributes.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">{t("numatb.noAttributes")}</div>
            ) : (
                <div
                    ref={attributeListRef}
                    className="min-h-0 flex-1 overflow-auto overscroll-contain"
                >
                    <div className="relative w-full" style={{ height: attributeVirtualizer.getTotalSize() }}>
                        {attributeVirtualizer.getVirtualItems().map((virtualRow) => {
                            const item = attributes[virtualRow.index];
                            if (!item) return null;
                            const { attribute, attributeIndex } = item;
                            const dataType = getParamType(attribute.param_id, attribute.param.data);

                            return (
                                <div
                                    key={virtualRow.key}
                                    ref={attributeVirtualizer.measureElement}
                                    data-index={virtualRow.index}
                                    className="absolute left-0 top-0 w-full pb-2"
                                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                                >
                                    <div className="space-y-1 rounded-md border p-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <Label className="truncate text-xs font-medium text-muted-foreground" data-i18n-ignore="">
                                                {attribute.param_id}
                                            </Label>
                                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground" data-i18n-ignore="">
                                                {dataType}
                                            </span>
                                        </div>
                                        <AttributeEditor
                                            attribute={attribute}
                                            materialIndex={materialIndex}
                                            attributeIndex={attributeIndex}
                                            onUpdate={(value, nextDataType) =>
                                                onAttributeUpdate(
                                                    materialIndex,
                                                    attributeIndex,
                                                    value,
                                                    nextDataType,
                                                )
                                            }
                                            onDelete={() => onRemoveAttribute(materialIndex, attributeIndex)}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </Card>
    );
});

export function NumatbEditor({ onClose }: NumatbEditorProps) {
    const { t } = useTranslation("misc-tools-a");
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
        updateShaderLabel,
        addAttribute,
        removeAttribute,
        addMaterialEntry,
        copyMaterialAsNew,
        removeMaterialEntry,
        saveFile,
    } = useNumatbStore();
    const materials = useMemo(
        () => numatbData?.Matl?.V16?.entries ?? [],
        [numatbData],
    );
    const materialListRef = useRef<HTMLDivElement | null>(null);
    const getMaterialScrollElement = useCallback(() => materialListRef.current, []);
    const materialVirtualizer = useVirtualizer({
        count: materials.length,
        getScrollElement: getMaterialScrollElement,
        estimateSize: () => MATERIAL_ROW_HEIGHT,
        getItemKey: (index) => {
            const material = materials[index];
            return material ? `${material.material_label}-${index}` : index;
        },
        overscan: 8,
    });

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
                toast.success(t("numatb.loaded", { name: fileName }));
            }
        } catch (error) {
            console.error("Error selecting file:", error);
            toast.error(t("numatb.loadFailed", {
                message: error instanceof Error ? error.message : t("common.unknownError"),
            }));
        }
    };

    const handleClose = useCallback(() => {
        setIsOpen(false);
        resetConversion();
        setHasChanges(false);
        setSelectedMaterialIndex(0);
        onClose?.();
    }, [onClose, resetConversion]);

    const handleSave = useCallback(async () => {
        await saveFile();
        setHasChanges(false);
        toast.success(t("numatb.saved"));
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

    const handleChangeShaderLabel = useCallback((materialIndex: number, nextShaderLabel: string) => {
        updateShaderLabel(materialIndex, nextShaderLabel);
        setHasChanges(true);
    }, [updateShaderLabel]);

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

    return (
        <>
            <Button variant="outline" className="w-full" onClick={() => setIsOpen(true)}>
                {t("numatb.open")}
            </Button>
            {isOpen ? (
                <AppRndModalShell
                    titleId="misc-tools-numatb-editor-title"
                    title={t("numatb.editTitle", { name: selectedFile?.name || t("numatb.fileFallback") })}
                    subtitle={t("numatb.subtitle")}
                    headerIcon={<FileEdit className="h-5 w-5" />}
                    dimensions={NUMATB_MODAL_DIMENSIONS}
                    storageKey="misc-tools-numatb-editor-size"
                    closeDisabled={isSaving}
                    onClose={handleClose}
                >
                    <div className="flex min-h-0 flex-1 flex-col p-4">
                    {!selectedFile ? (
                        <div className="flex flex-1 items-center justify-center p-8">
                            <Button onClick={handleSelectFile} disabled={isConverting}>
                                {isConverting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        {t("common.loading")}
                                    </>
                                ) : (
                                    <>
                                        <FileEdit className="mr-2 h-4 w-4" />
                                        {t("numatb.selectFile")}
                                    </>
                                )}
                            </Button>
                        </div>
                    ) : isConverting ? (
                        <div className="flex flex-1 items-center justify-center p-8">
                            <div className="flex items-center space-x-3">
                                <Loader2 className="animate-spin h-5 w-5" />
                                <span>{t("numatb.converting")}</span>
                            </div>
                        </div>
                    ) : error ? (
                        <div className="flex flex-1 flex-col items-center justify-center space-y-4 p-8">
                            <span className="text-red-600" data-i18n-ignore="">{error}</span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => selectedFile && convertFile(selectedFile)}
                            >
                                {t("numatb.tryAgain")}
                            </Button>
                        </div>
                    ) : numatbData ? (
                        <div className="flex flex-1 flex-col space-y-3 overflow-hidden">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex flex-wrap gap-2">
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
                                            <span>{isSaving ? t("numatb.saving") : t("numatb.save")}</span>
                                        </Button>

                                        <Button
                                            onClick={handleReset}
                                            disabled={isConverting || isSaving}
                                            variant="outline"
                                            size="sm"
                                            className="flex items-center space-x-2"
                                        >
                                            <RotateCcw className="h-4 w-4" />
                                            <span>{t("numatb.reset")}</span>
                                        </Button>

                                        <Button
                                            onClick={handleAddMaterialEntry}
                                            disabled={isConverting || isSaving}
                                            variant="outline"
                                            size="sm"
                                            className="flex items-center space-x-2"
                                        >
                                            <Plus className="h-4 w-4" />
                                            <span>{t("numatb.addEntry")}</span>
                                        </Button>

                                        <Button
                                            onClick={handleCopyMaterialAsNew}
                                            disabled={isConverting || isSaving || !numatbData?.Matl?.V16?.entries[selectedMaterialIndex]}
                                            variant="outline"
                                            size="sm"
                                            className="flex items-center space-x-2"
                                        >
                                            <Copy className="h-4 w-4" />
                                            <span>{t("numatb.copyAsNew")}</span>
                                        </Button>

                                        <Button
                                            onClick={handleSelectFile}
                                            disabled={isConverting || isSaving}
                                            variant="outline"
                                            size="sm"
                                            className="flex items-center space-x-2"
                                        >
                                            <FileEdit className="h-4 w-4" />
                                            <span>{t("numatb.loadDifferent")}</span>
                                        </Button>
                                    </div>

                                    {hasChanges && (
                                        <span className="text-sm text-orange-600">{t("numatb.unsaved")}</span>
                                    )}
                                </div>

                                <Separator />

                                <div className="flex flex-1 gap-4 overflow-hidden">
                                    <div className="w-64 flex-shrink-0">
                                        <div className="flex h-full min-h-0 flex-col rounded-lg border p-2">
                                            <Label className="mb-2 block text-sm font-medium">
                                                {t("numatb.materials", { count: materials.length })}
                                            </Label>
                                            <div
                                                ref={materialListRef}
                                                className="min-h-0 flex-1 overflow-auto overscroll-contain"
                                            >
                                                <div
                                                    className="relative w-full"
                                                    style={{ height: materialVirtualizer.getTotalSize() }}
                                                >
                                                    {materialVirtualizer.getVirtualItems().map((virtualRow) => {
                                                        const material = materials[virtualRow.index];
                                                        if (!material) return null;
                                                        const materialIndex = virtualRow.index;

                                                        return (
                                                            <div
                                                                key={virtualRow.key}
                                                                className="absolute left-0 top-0 w-full pb-1"
                                                                style={{
                                                                    height: virtualRow.size,
                                                                    transform: `translateY(${virtualRow.start}px)`,
                                                                }}
                                                            >
                                                                <div
                                                                    className={`group flex h-[72px] cursor-pointer items-center justify-between rounded p-2 text-sm transition-colors ${
                                                                        selectedMaterialIndex === materialIndex
                                                                            ? "border border-blue-300 bg-blue-100"
                                                                            : "hover:bg-muted"
                                                                    }`}
                                                                    onClick={() => setSelectedMaterialIndex(materialIndex)}
                                                                    title={t("numatb.materialTitle", {
                                                                        name: material.material_label,
                                                                        count: material.attributes?.length || 0,
                                                                    })}
                                                                >
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="truncate font-medium" data-i18n-ignore="">
                                                                            {material.material_label || t("numatb.materialFallback", { index: materialIndex + 1 })}
                                                                        </div>
                                                                        <div className="truncate text-xs text-muted-foreground" data-i18n-ignore="">
                                                                            {material.shader_label}
                                                                        </div>
                                                                        <div className="mt-1 text-xs text-muted-foreground">
                                                                            {t("numatb.attributeCount", { count: material.attributes?.length || 0 })}
                                                                        </div>
                                                                    </div>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="ml-2 h-7 w-7 shrink-0 p-0 text-red-500 opacity-0 hover:bg-red-50 hover:text-red-700 group-hover:opacity-100 focus-visible:opacity-100"
                                                                        onClick={(event) => {
                                                                            event.stopPropagation();
                                                                            setMaterialToDelete(materialIndex);
                                                                        }}
                                                                        title={t("numatb.deleteMaterial")}
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        {materials[selectedMaterialIndex] ? (
                                            <MaterialDetail
                                                material={materials[selectedMaterialIndex]}
                                                materialIndex={selectedMaterialIndex}
                                                editingLabel={editingLabel}
                                                editingLabelValue={editingLabelValue}
                                                onEditingLabelValueChange={setEditingLabelValue}
                                                onStartEditLabel={handleStartEditLabel}
                                                onSaveLabelEdit={handleSaveLabelEdit}
                                                onCancelLabelEdit={handleCancelLabelEdit}
                                                onAttributeUpdate={handleAttributeUpdate}
                                                onAddAttribute={handleAddAttribute}
                                                onRemoveAttribute={handleRemoveAttribute}
                                                onChangeShaderLabel={handleChangeShaderLabel}
                                            />
                                        ) : null}
                                    </div>
                                </div>
                        </div>
                    ) : (
                        <div className="flex h-32 flex-1 items-center justify-center text-muted-foreground">
                            {t("numatb.noData")}
                        </div>
                    )}

                    <AlertDialog
                        open={materialToDelete !== null}
                        onOpenChange={(open) => {
                            if (!open) setMaterialToDelete(null);
                        }}
                    >
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>{t("numatb.deleteTitle")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                    {t("numatb.deleteConfirm", {
                                        name: materialToDelete === null
                                            ? ""
                                            : materials[materialToDelete]?.material_label || t("numatb.materialFallback", { index: (materialToDelete ?? 0) + 1 }),
                                    })}
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>{t("numatb.cancel")}</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={() => {
                                        if (materialToDelete !== null) {
                                            handleRemoveMaterialEntry(materialToDelete);
                                            setMaterialToDelete(null);
                                        }
                                    }}
                                    className="bg-red-600 hover:bg-red-700"
                                >
                                    {t("numatb.delete")}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    </div>
                </AppRndModalShell>
            ) : null}
        </>
    );
}
