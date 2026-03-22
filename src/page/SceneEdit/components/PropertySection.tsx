import { ModelState } from '../../../store/sceneStore';
import { Label } from '../../../components/ui/label';
import { Button } from '../../../components/ui/button';
import { RotateCcw, Copy } from 'lucide-react';
import { PropertyInput } from './PropertyInput';

interface PropertySectionProps {
    title: string;
    property: 'position' | 'rotation' | 'scale';
    selectedModelState: ModelState;
    onPropertyChange: (property: 'position' | 'rotation' | 'scale', axis: 0 | 1 | 2, value: number) => void;
    onResetProperty: (property: 'position' | 'rotation' | 'scale') => void;
    onCopyProperty: (property: 'position' | 'rotation' | 'scale') => void;
    disabled?: boolean;
}

export function PropertySection({
    title,
    property,
    selectedModelState,
    onPropertyChange,
    onResetProperty,
    onCopyProperty,
    disabled = false
}: PropertySectionProps) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-white">{title}</Label>
                <div className="flex gap-1">
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onCopyProperty(property)}
                        disabled={disabled}
                        className="h-5 w-5 p-0 text-white/60 hover:text-white hover:bg-card/10 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="复制值"
                    >
                        <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onResetProperty(property)}
                        disabled={disabled}
                        className="h-5 w-5 p-0 text-white/60 hover:text-white hover:bg-card/10 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    value={property === 'rotation' ? selectedModelState[property][0] * 180 / Math.PI : selectedModelState[property][0]}
                    onChange={(value) => onPropertyChange(property, 0, property === 'rotation' ? value * Math.PI / 180 : value)}
                    disabled={disabled}
                />
                <PropertyInput
                    label="Y"
                    axis="y"
                    value={property === 'rotation' ? selectedModelState[property][1] * 180 / Math.PI : selectedModelState[property][1]}
                    onChange={(value) => onPropertyChange(property, 1, property === 'rotation' ? value * Math.PI / 180 : value)}
                    disabled={disabled}
                />
                <PropertyInput
                    label="Z"
                    axis="z"
                    value={property === 'rotation' ? selectedModelState[property][2] * 180 / Math.PI : selectedModelState[property][2]}
                    onChange={(value) => onPropertyChange(property, 2, property === 'rotation' ? value * Math.PI / 180 : value)}
                    disabled={disabled}
                />
            </div>
        </div>
    );
}
