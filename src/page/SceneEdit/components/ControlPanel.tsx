import { useState } from 'react';
import { ModelState, useSceneStore } from '../../../store/sceneStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Separator } from '../../../components/ui/separator';
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, PanelLeftOpen, PanelRightOpen } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../components/ui/collapsible';
import { TexturePanel } from './TexturePanel';
import { PropertySection } from './PropertySection';
import { ModelList } from './ModelList';
import { ImportPanel } from './ImportPanel';
import { VdkConfigPanel } from './VdkConfigPanel';
import { SceneExportPanel } from './SceneExportPanel';
import { VdkObjectInfo, VdkConfig } from '../../../types/vdk';

interface ControlPanelProps {
    models: Record<string, ModelState>;
    selectedModelId: string | null;
    selectedModelState: ModelState | null;
    onUpdateModelTransform: (modelState: ModelState) => void;
    getInitialModelState: (modelId: string) => ModelState | null;
    onModelSelect: (modelId: string) => void;
    vdkConfigs: VdkConfig[];
    vdkObjectInfos: Map<number, VdkObjectInfo>;
    isVdkLoading: boolean;
    vdkLoadingError: string | null;
    onLoadVdkConfig: () => Promise<void>;
    onSaveVdkConfig: () => Promise<void>;
    onAddVdkObject: (objectNumber: number, position: [number, number, number], rotation: [number, number, number]) => void;
}



export function ControlPanel({
    models,
    selectedModelId,
    selectedModelState,
    onUpdateModelTransform,
    getInitialModelState,
    onModelSelect,
    vdkConfigs,
    vdkObjectInfos,
    isVdkLoading,
    vdkLoadingError,
    onLoadVdkConfig,
    onSaveVdkConfig,
    onAddVdkObject
}: ControlPanelProps) {
    const { removeModel, toggleModelLock } = useSceneStore();
    const [isControlsCollapsed, setIsControlsCollapsed] = useState(false);
    const [isPropertiesCollapsed, setIsPropertiesCollapsed] = useState(false);
    const [isModelListCollapsed, setIsModelListCollapsed] = useState(false);
    const [isTextureCollapsed, setIsTextureCollapsed] = useState(false);
    const [isVdkConfigCollapsed, setIsVdkConfigCollapsed] = useState(false);
    const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
    const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);

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



    return (
        <>
            {/* Left Panel - Control Panels */}
            {isLeftPanelCollapsed ? (
                /* Collapsed Left Panel */
                <div className="absolute top-4 left-4 z-50">
                    <Button
                        onClick={() => setIsLeftPanelCollapsed(false)}
                        size="sm"
                        className="h-8 w-8 p-0"
                    >
                        <PanelLeftOpen className="h-4 w-4" />
                    </Button>
                </div>
            ) : (
                /* Expanded Left Panel */
                <div className="absolute top-4 left-4 z-50 space-y-2 max-h-[calc(100vh-6rem)] overflow-y-auto custom-scrollbar-thin">
                    {/* Left Panel Collapse Button */}
                    <div className="flex justify-end mb-2">
                        <Button
                            onClick={() => setIsLeftPanelCollapsed(true)}
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-white/60  hover:bg-black/10 bg-black"
                        >
                            <ChevronLeft className="h-3 w-3" />
                        </Button>
                    </div>
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
                                        <PropertySection
                                            title="位置"
                                            property="position"
                                            selectedModelState={selectedModelState!}
                                            onPropertyChange={handlePropertyChange}
                                            onResetProperty={resetProperty}
                                            onCopyProperty={copyProperty}
                                            disabled={selectedModelState!.isLocked}
                                        />
                                        <Separator className="bg-white/10" />
                                        <PropertySection
                                            title="旋转"
                                            property="rotation"
                                            selectedModelState={selectedModelState!}
                                            onPropertyChange={handlePropertyChange}
                                            onResetProperty={resetProperty}
                                            onCopyProperty={copyProperty}
                                            disabled={selectedModelState!.isLocked}
                                        />
                                        <Separator className="bg-white/10" />
                                        <PropertySection
                                            title="缩放"
                                            property="scale"
                                            selectedModelState={selectedModelState!}
                                            onPropertyChange={handlePropertyChange}
                                            onResetProperty={resetProperty}
                                            onCopyProperty={copyProperty}
                                            disabled={selectedModelState!.isLocked}
                                        />
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
                                    <ModelList
                                        models={models}
                                        selectedModelId={selectedModelId}
                                        onModelSelect={onModelSelect}
                                        onModelRemove={removeModel}
                                        onModelLockToggle={toggleModelLock}
                                    />
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
            )}

            {/* Right Panel - Import Panel */}
            {isRightPanelCollapsed ? (
                /* Collapsed Right Panel */
                <div className="absolute top-4 right-4 z-50">
                    <Button
                        onClick={() => setIsRightPanelCollapsed(false)}
                        size="sm"
                        className="h-8 w-8 p-0"
                    >
                        <PanelRightOpen className="h-4 w-4" />
                    </Button>
                </div>
            ) : (
                /* Expanded Right Panel */
                <div className="absolute top-4 right-4 z-50 space-y-2 max-h-[calc(100vh-6rem)] overflow-y-auto custom-scrollbar-thin">
                    {/* Right Panel Collapse Button */}
                    <div className="flex justify-start mb-2">
                        <Button
                            onClick={() => setIsRightPanelCollapsed(true)}
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-white/60  hover:bg-black/10 bg-black"
                        >
                            <ChevronRight className="h-3 w-3" />
                        </Button>
                    </div>
                    <ImportPanel />

                    {/* Scene Export/Import Panel */}
                    <SceneExportPanel />

                    {/* VDK Configuration Panel */}
                    <VdkConfigPanel
                        vdkConfigs={vdkConfigs}
                        vdkObjectInfos={vdkObjectInfos}
                        isVdkLoading={isVdkLoading}
                        vdkLoadingError={vdkLoadingError}
                        onLoadConfig={onLoadVdkConfig}
                        onSaveConfig={onSaveVdkConfig}
                        onAddVdkObject={onAddVdkObject}
                    />
                </div>
            )}
        </>
    );
}
