import { useState } from 'react';
import { ModelState, SubModelState, useSceneStore } from '../../../store/sceneStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Separator } from '../../../components/ui/separator';
import { ScrollArea } from '../../../components/ui/scroll-area';
import { Image, Upload, X, FileImage } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../components/ui/tooltip';

interface TexturePanelProps {
    models: Record<string, ModelState>;
    selectedModelId: string | null;
}

interface SubModelTextureItemProps {
    modelId: string;
    subModel: SubModelState;
    onSelectTexture: (modelId: string, subModelId: string) => Promise<void>;
    onRemoveTexture: (modelId: string, subModelId: string) => void;
}

function SubModelTextureItem({ modelId, subModel, onSelectTexture, onRemoveTexture }: SubModelTextureItemProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handleSelectTexture = async () => {
        setIsLoading(true);
        try {
            await onSelectTexture(modelId, subModel.id);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRemoveTexture = () => {
        onRemoveTexture(modelId, subModel.id);
    };

    return (
        <div className="flex items-center gap-2 p-1 bg-black/30 rounded-lg border border-white/10">
            {/* Texture Preview */}
            <div className="w-10 h-10 rounded-md border border-white/20 bg-black/50 flex items-center justify-center overflow-hidden">
                {subModel.textureBlob ? (
                    <img
                        src={subModel.textureBlob}
                        alt={`${subModel.name} texture`}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <FileImage className="w-6 h-6 text-white/40" />
                )}
            </div>

            {/* SubModel Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="text-sm font-medium text-white truncate max-w-[100px] cursor-default">
                                {subModel.name}
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{subModel.name}</p>
                        </TooltipContent>
                    </Tooltip>
                    <Badge variant="outline" className="text-xs px-1 py-0 text-white/60 border-white/20">
                        #{subModel.geometryIndex}
                    </Badge>
                </div>
                {subModel.texturePath && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="text-xs text-white/60 truncate max-w-[140px] cursor-default">
                                {subModel.texturePath.split(/[/\\]/).pop()}
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{subModel.texturePath}</p>
                        </TooltipContent>
                    </Tooltip>
                )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-1">
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleSelectTexture}
                    disabled={isLoading}
                    className="h-7 w-7 p-0 text-white/60 hover:text-white hover:bg-card/10"
                    title="选择贴图"
                >
                    {isLoading ? (
                        <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                    ) : (
                        <Upload className="h-4 w-4" />
                    )}
                </Button>
                {subModel.texturePath && (
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleRemoveTexture}
                        className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        title="移除贴图"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>
        </div>
    );
}

export function TexturePanel({ models, selectedModelId }: TexturePanelProps) {
    const { setSubModelTexture, removeSubModelTexture } = useSceneStore();

    const handleSelectTexture = async (modelId: string, subModelId: string) => {
        try {
            // Open file dialog to select image file
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Image Files',
                    extensions: ['png', 'jpg', 'jpeg', 'bmp', 'tga', 'dds', 'tiff']
                }]
            });

            if (selected) {
                await setSubModelTexture(modelId, subModelId, selected);
            }
        } catch (error) {
            console.error('Failed to select texture:', error);
        }
    };

    const handleRemoveTexture = (modelId: string, subModelId: string) => {
        removeSubModelTexture(modelId, subModelId);
    };

    // Get models with subModels
    const modelsWithSubModels = Object.values(models).filter(model =>
        model.subModels && model.subModels.length > 0
    );

    return (
        <ScrollArea className="h-96">
            <div className="space-y-4">
                {modelsWithSubModels.length === 0 ? (
                    <div className="text-xs text-white/60 text-center py-8">
                        没有可设置贴图的模型
                        <br />
                        请先加载包含子模型的DAE文件
                    </div>
                ) : (
                    modelsWithSubModels.map((model) => (
                        <div key={model.id} className="space-y-2">
                            {/* Model Header */}
                            <div className="flex items-center gap-2 pb-2">
                                <Badge
                                    variant="outline"
                                    className={`text-xs px-2 py-1 ${selectedModelId === model.id
                                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                            : 'text-white/80 border-white/20'
                                        }`}
                                >
                                    {model.type}
                                </Badge>
                                <span className="text-sm font-medium text-white truncate">
                                    {model.name}
                                </span>
                                <span className="text-xs text-white/40">
                                    ({model.subModels?.length} 子模型)
                                </span>
                            </div>

                            {/* SubModels */}
                            <div className="space-y-2 pl-2">
                                {model.subModels?.map((subModel) => (
                                    <SubModelTextureItem
                                        key={subModel.id}
                                        modelId={model.id}
                                        subModel={subModel}
                                        onSelectTexture={handleSelectTexture}
                                        onRemoveTexture={handleRemoveTexture}
                                    />
                                ))}
                            </div>

                            {/* Separator between models */}
                            {model !== modelsWithSubModels[modelsWithSubModels.length - 1] && (
                                <Separator className="bg-card/10 mt-4" />
                            )}
                        </div>
                    ))
                )}
            </div>
        </ScrollArea>
    );
}
