import { ModelState } from '../../../store/sceneStore';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Trash2, Lock, Unlock } from 'lucide-react';

interface ModelListProps {
    models: Record<string, ModelState>;
    selectedModelId: string | null;
    onModelSelect: (modelId: string) => void;
    onModelRemove: (modelId: string) => void;
    onModelLockToggle: (modelId: string) => void;
}

export function ModelList({ models, selectedModelId, onModelSelect, onModelRemove, onModelLockToggle }: ModelListProps) {
    const modelEntries = Object.values(models);

    return (
        <div className="space-y-1 max-h-48 overflow-y-auto">
            {modelEntries.length === 0 ? (
                <div className="text-xs text-white/60 text-center py-4">
                    No models in scene
                </div>
            ) : (
                modelEntries.map((model) => (
                    <div
                        key={model.id}
                        className={`flex items-center gap-1 p-1 rounded text-xs cursor-pointer ${
                            selectedModelId === model.id
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                : 'text-white/80 hover:text-white hover:bg-card/10'
                        } ${model.isLocked ? 'opacity-60' : ''}`}
                        onClick={() => onModelSelect(model.id)}
                    >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                            <Badge variant="outline" className="text-xs px-1 py-0">
                                {model.type}
                            </Badge>
                            <span className="truncate flex-1">{model.name}</span>
                            {model.subModels && model.subModels.length > 0 && (
                                <span className="text-xs text-white/40">({model.subModels.length} 子模型)</span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-white/60 hover:text-white hover:bg-card/10"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onModelLockToggle(model.id);
                                }}
                            >
                                {model.isLocked ? (
                                    <Lock className="h-3 w-3" />
                                ) : (
                                    <Unlock className="h-3 w-3" />
                                )}
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-white/60 hover:text-red-400 hover:bg-red-500/20"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onModelRemove(model.id);
                                }}
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}
