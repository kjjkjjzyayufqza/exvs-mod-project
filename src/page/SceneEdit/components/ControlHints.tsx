import { useState, useEffect } from 'react';
import { BoxState } from '../../../store/sceneStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';

interface ControlHintsProps {
    selectedBoxId: string | null;
    selectedBoxState: BoxState | null;
    onUpdateBoxTransform: (boxState: BoxState) => void;
}

interface PropertyInputProps {
    label: string;
    value: number;
    onChange: (value: number) => void;
}

function PropertyInput({ label, value, onChange }: PropertyInputProps) {
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
            onChange(numValue);
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
        <div className="flex items-center gap-2">
            <Label htmlFor={label} className="w-6 text-xs text-muted-foreground">
                {label}
            </Label>
            <Input
                id={label}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className="w-16 h-6 text-xs px-1 text-white"
            />
        </div>
    );
}

export function ControlHints({ selectedBoxId, selectedBoxState, onUpdateBoxTransform }: ControlHintsProps) {
    const handlePropertyChange = (property: 'position' | 'rotation' | 'scale', axis: 0 | 1 | 2, value: number) => {
        if (!selectedBoxState) return;

        const newBoxState: BoxState = {
            ...selectedBoxState,
            [property]: selectedBoxState[property].map((v, i) => i === axis ? value : v) as [number, number, number]
        };

        onUpdateBoxTransform(newBoxState);
    };

    return (
        <div className="absolute top-4 left-4 z-50 space-y-3">
            {/* Controls Card */}
            <Card className="w-64 bg-black/80 backdrop-blur-sm border-gray-700">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-white">Controls</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                    <div className="text-xs text-gray-300 space-y-1">
                        <p className="font-semibold text-white">Selected: {selectedBoxId || 'None'}</p>
                        <p>W: XYZ translate</p>
                        <p>E: rotate</p>
                        <p>R: scale</p>
                        <p>Ctrl+Z: Undo</p>
                        <p>Ctrl+Y: Redo</p>
                    </div>
                </CardContent>
            </Card>

            {/* Properties Card */}
            {selectedBoxState && (
                <Card className="w-64 bg-black/80 backdrop-blur-sm border-gray-700">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-white">Transform</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {/* Position */}
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-white">Position</Label>
                            <div className="grid grid-cols-3 gap-2">
                                <PropertyInput
                                    label="X"
                                    value={selectedBoxState.position[0]}
                                    onChange={(value) => handlePropertyChange('position', 0, value)}
                                />
                                <PropertyInput
                                    label="Y"
                                    value={selectedBoxState.position[1]}
                                    onChange={(value) => handlePropertyChange('position', 1, value)}
                                />
                                <PropertyInput
                                    label="Z"
                                    value={selectedBoxState.position[2]}
                                    onChange={(value) => handlePropertyChange('position', 2, value)}
                                />
                            </div>
                        </div>

                        {/* Rotation */}
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-white">Rotation</Label>
                            <div className="grid grid-cols-3 gap-2">
                                <PropertyInput
                                    label="X"
                                    value={selectedBoxState.rotation[0]}
                                    onChange={(value) => handlePropertyChange('rotation', 0, value)}
                                />
                                <PropertyInput
                                    label="Y"
                                    value={selectedBoxState.rotation[1]}
                                    onChange={(value) => handlePropertyChange('rotation', 1, value)}
                                />
                                <PropertyInput
                                    label="Z"
                                    value={selectedBoxState.rotation[2]}
                                    onChange={(value) => handlePropertyChange('rotation', 2, value)}
                                />
                            </div>
                        </div>

                        {/* Scale */}
                        <div className="space-y-2">
                            <Label className="text-xs font-semibold text-white">Scale</Label>
                            <div className="grid grid-cols-3 gap-2">
                                <PropertyInput
                                    label="X"
                                    value={selectedBoxState.scale[0]}
                                    onChange={(value) => handlePropertyChange('scale', 0, value)}
                                />
                                <PropertyInput
                                    label="Y"
                                    value={selectedBoxState.scale[1]}
                                    onChange={(value) => handlePropertyChange('scale', 1, value)}
                                />
                                <PropertyInput
                                    label="Z"
                                    value={selectedBoxState.scale[2]}
                                    onChange={(value) => handlePropertyChange('scale', 2, value)}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
