import { useState, useEffect } from 'react';
import { ModelState } from '../../../store/sceneStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Separator } from '../../../components/ui/separator';
import { RotateCcw, Copy, ChevronLeft, ChevronRight, List, ChevronDown, ChevronUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../components/ui/collapsible';
import { TexturePanel } from './TexturePanel';

interface ControlPanelProps {
    models: Record<string, ModelState>;
    selectedModelId: string | null;
    selectedModelState: ModelState | null;
    onUpdateModelTransform: (modelState: ModelState) => void;
    getInitialModelState: (modelId: string) => ModelState | null;
    onModelSelect: (modelId: string) => void;
}

interface PropertyInputProps {
    label: string;
    value: number;
    onChange: (value: number) => void;
    axis: 'x' | 'y' | 'z';
}

function PropertyInput({ label, value, onChange, axis }: PropertyInputProps) {
    const [inputValue, setInputValue] = useState(value.toString());

    useEffect(() => {
        setInputValue(value.toFixed(3));
    }, [value]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
    };

    const handleBlur = () => {
        const numValue = parseFloat(inputValue);
        if (!isNaN(numValue)) {
            // Only update if the value has actually changed
            if (Math.abs(numValue - value) > 0.001) {
                onChange(numValue);
            } else {
                // Reset to original value if no significant change
                setInputValue(value.toFixed(3));
            }
        } else {
            setInputValue(value.toFixed(3));
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleBlur();
        } else if (e.key === 'Escape') {
            setInputValue(value.toFixed(3));
            (e.target as HTMLInputElement).blur();
        }
    };

    return (
        <div className="flex flex-col gap-1">
            <div className={`text-xs font-medium p-1 rounded-md text-center text-white bg-white/10`}>
                {label}
            </div>
            <Input
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className={`h-8 text-xs text-center bg-black/50 border transition-colors border-white/20 focus:border-white/40 text-white`}
            />
        </div>
    );
}

export function ControlPanel({ models, selectedModelId, selectedModelState, onUpdateModelTransform, getInitialModelState, onModelSelect }: ControlPanelProps) {
    const [isControlsCollapsed, setIsControlsCollapsed] = useState(false);
    const [isPropertiesCollapsed, setIsPropertiesCollapsed] = useState(false);
    const [isModelListCollapsed, setIsModelListCollapsed] = useState(false);
    const [isTextureCollapsed, setIsTextureCollapsed] = useState(false);

    const handlePropertyChange = (property: 'position' | 'rotation' | 'scale', axis: 0 | 1 | 2, value: number) => {
        if (!selectedModelState) return;

        const newModelState: ModelState = {
            ...selectedModelState,
            [property]: selectedModelState[property].map((v, i) => i === axis ? value : v) as [number, number, number]
        };

        onUpdateModelTransform(newModelState);
    };

    const resetProperty = (property: 'position' | 'rotation' | 'scale') => {
        if (!selectedModelState || !selectedModelId) return;

        const initialModelState = getInitialModelState(selectedModelId);
        if (!initialModelState) return;

        const newModelState: ModelState = {
            ...selectedModelState,
            [property]: initialModelState[property]
        };

        onUpdateModelTransform(newModelState);
    };

    const copyProperty = (property: 'position' | 'rotation' | 'scale') => {
        if (!selectedModelState) return;
        const value = selectedModelState[property];
        navigator.clipboard.writeText(`${value[0]}, ${value[1]}, ${value[2]}`);
    };

    const ModelList = () => {
        const modelEntries = Object.values(models);

        return (
            <div className="space-y-1 max-h-48 overflow-y-auto">
                {modelEntries.length === 0 ? (
                    <div className="text-xs text-white/60 text-center py-4">
                        No models in scene
                    </div>
                ) : (
                    modelEntries.map((model) => (
                        <Button
                            key={model.id}
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                onModelSelect(model.id);
                            }}
                            className={`w-full justify-start h-8 text-left text-xs ${
                                selectedModelId === model.id
                                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                    : 'text-white/80 hover:text-white hover:bg-white/10'
                            }`}
                        >
                            <div className="flex items-center gap-2 w-full">
                                <Badge variant="outline" className="text-xs px-1 py-0">
                                    {model.type}
                                </Badge>
                                <span className="truncate flex-1">{model.name}</span>
                                {model.subModels && model.subModels.length > 0 && (
                                    <span className="text-xs text-white/40">({model.subModels.length} 子模型)</span>
                                )}
                            </div>
                        </Button>
                    ))
                )}
            </div>
        );
    };

    const PropertySection = ({ title, property }: {
        title: string;
        property: 'position' | 'rotation' | 'scale';
    }) => (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-white">{title}</Label>
                <div className="flex gap-1">
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyProperty(property)}
                        className="h-5 w-5 p-0 text-white/60 hover:text-white hover:bg-white/10"
                        title="复制值"
                    >
                        <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => resetProperty(property)}
                        className="h-5 w-5 p-0 text-white/60 hover:text-white hover:bg-white/10"
                        title="重置"
                    >
                        <RotateCcw className="h-3 w-3" />
                    </Button>
                </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
                <PropertyInput
                    label="X"
                    axis="x"
                    value={selectedModelState![property][0]}
                    onChange={(value) => handlePropertyChange(property, 0, value)}
                />
                <PropertyInput
                    label="Y"
                    axis="y"
                    value={selectedModelState![property][1]}
                    onChange={(value) => handlePropertyChange(property, 1, value)}
                />
                <PropertyInput
                    label="Z"
                    axis="z"
                    value={selectedModelState![property][2]}
                    onChange={(value) => handlePropertyChange(property, 2, value)}
                />
            </div>
        </div>
    );

    return (
        <div className="absolute top-4 left-4 z-50 space-y-2 max-h-[calc(100vh-2rem)] overflow-y-auto custom-scrollbar-thin">
            {/* Controls Card */}
            <Collapsible open={!isControlsCollapsed} onOpenChange={(open) => setIsControlsCollapsed(!open)}>
                <Card className="w-72 bg-black/90 backdrop-blur-lg border-white/10">
                    <CardHeader className="p-1 border-b border-white/10">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm text-white">
                                控制面板
                            </CardTitle>
                            <CollapsibleTrigger asChild>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-5 w-5 p-0 text-white/60 hover:text-white hover:bg-white/10"
                                >
                                    {isControlsCollapsed ? <ChevronDown className="h-3 w-3 transition-transform duration-200" /> : <ChevronUp className="h-3 w-3 transition-transform duration-200" />}
                                </Button>
                            </CollapsibleTrigger>
                        </div>
                    </CardHeader>
                    <CollapsibleContent>
                        <CardContent className="p-1">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-white/80">当前选中:</span>
                                    <Badge variant="secondary" className="bg-white/10 text-white border-white/20 text-xs">
                                        {selectedModelState?.name || 'None'}
                                    </Badge>
                                </div>
                                <Separator className="bg-white/10" />
                                <div className="grid grid-cols-2 gap-2 text-xs text-white/80">
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-1">
                                            <kbd className="p-1 bg-white/10 rounded text-white font-mono text-xs">W</kbd>
                                            <span className="text-xs">平移</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <kbd className="p-1 bg-white/10 rounded text-white font-mono text-xs">E</kbd>
                                            <span className="text-xs">旋转</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <kbd className="p-1 bg-white/10 rounded text-white font-mono text-xs">R</kbd>
                                            <span className="text-xs">缩放</span>
                                        </div>
                                    </div>
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-1">
                                            <kbd className="p-1 bg-white/10 rounded text-white font-mono text-xs">Ctrl+Z</kbd>
                                            <span className="text-xs">撤销</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <kbd className="p-1 bg-white/10 rounded text-white font-mono text-xs">Ctrl+Y</kbd>
                                            <span className="text-xs">重做</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Properties Card */}
            {selectedModelState && (
                <Collapsible open={!isPropertiesCollapsed} onOpenChange={(open) => setIsPropertiesCollapsed(!open)}>
                    <Card className="w-72 bg-black/90 backdrop-blur-lg border-white/10">
                        <CardHeader className="p-1 border-b border-white/10">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm text-white">
                                    变换属性
                                </CardTitle>
                                <CollapsibleTrigger asChild>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-5 w-5 p-0 text-white/60 hover:text-white hover:bg-white/10"
                                    >
                                        {isPropertiesCollapsed ? <ChevronDown className="h-3 w-3 transition-transform duration-200" /> : <ChevronUp className="h-3 w-3 transition-transform duration-200" />}
                                    </Button>
                                </CollapsibleTrigger>
                            </div>
                        </CardHeader>
                        <CollapsibleContent>
                            <CardContent className="p-1 space-y-3">
                                <PropertySection title="位置" property="position" />
                                <Separator className="bg-white/10" />
                                <PropertySection title="旋转" property="rotation" />
                                <Separator className="bg-white/10" />
                                <PropertySection title="缩放" property="scale" />
                            </CardContent>
                        </CollapsibleContent>
                    </Card>
                </Collapsible>
            )}


            {/* Model List Card */}
            <Collapsible open={!isModelListCollapsed} onOpenChange={(open) => setIsModelListCollapsed(!open)}>
                <Card className="w-72 bg-black/90 backdrop-blur-lg border-white/10">
                    <CardHeader className="p-1 border-b border-white/10">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm text-white flex items-center gap-2">
                                <List className="h-4 w-4" />
                                模型列表
                            </CardTitle>
                            <CollapsibleTrigger asChild>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-5 w-5 p-0 text-white/60 hover:text-white hover:bg-white/10"
                                >
                                    {isModelListCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                                </Button>
                            </CollapsibleTrigger>
                        </div>
                    </CardHeader>
                    <CollapsibleContent>
                        <CardContent className="p-1">
                            <ModelList />
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

            {/* Texture Panel */}
            <Collapsible open={!isTextureCollapsed} onOpenChange={(open) => setIsTextureCollapsed(!open)}>
                <Card className="w-72 bg-black/90 backdrop-blur-lg border-white/10">
                    <CardHeader className="p-1 border-b border-white/10">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm text-white">
                                贴图设置
                            </CardTitle>
                            <CollapsibleTrigger asChild>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-5 w-5 p-0 text-white/60 hover:text-white hover:bg-white/10"
                                >
                                    {isTextureCollapsed ? <ChevronDown className="h-3 w-3 transition-transform duration-200" /> : <ChevronUp className="h-3 w-3 transition-transform duration-200" />}
                                </Button>
                            </CollapsibleTrigger>
                        </div>
                    </CardHeader>
                    <CollapsibleContent>
                        <CardContent className="p-1">
                            <TexturePanel
                                models={models}
                                selectedModelId={selectedModelId}
                            />
                        </CardContent>
                    </CollapsibleContent>
                </Card>
            </Collapsible>

        </div>
    );
}
