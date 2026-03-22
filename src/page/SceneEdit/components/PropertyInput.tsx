import { useState, useEffect } from 'react';
import { Input } from '../../../components/ui/input';

interface PropertyInputProps {
    label: string;
    value: number;
    onChange: (value: number) => void;
    axis: 'x' | 'y' | 'z';
    disabled?: boolean;
}

export function PropertyInput({ label, value, onChange, axis, disabled = false }: PropertyInputProps) {
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
            <div className={`text-xs font-medium p-1 rounded-md text-center text-white bg-card/10`}>
                {label}
            </div>
            <Input
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                className={`h-8 text-xs text-center bg-black/50 border transition-colors border-white/20 focus:border-white/40 text-white ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
        </div>
    );
}
