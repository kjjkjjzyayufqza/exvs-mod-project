import { ModelState } from '../../../store/sceneStore';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';

interface ModelListProps {
    models: Record<string, ModelState>;
    selectedModelId: string | null;
    onModelSelect: (modelId: string) => void;
}

export function ModelList({ models, selectedModelId, onModelSelect }: ModelListProps) {
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
}
