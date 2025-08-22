import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Edit3, Save, X, Hash } from "lucide-react";
import { toast } from 'sonner';
import { int32ToHexDisplay, hexDisplayToInt32, validateHexInput } from "@/module/commonFunc";

interface DualValuePropertyProps {
  label: string;
  value: number | undefined;
  property: string;
  editable?: boolean;
  editingProperty: string | null;
  editValue: string;
  validationError: string;
  onStartEdit: (property: string, value: string | number) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onValueChange: (value: string) => void;
  showHex?: boolean; // Option to hide hex display for simple int32 properties
}

/**
 * DualValueProperty component for displaying and editing values as both int32 and hex
 * Supports byte-order reversal for hex display (little-endian to big-endian)
 */
export function DualValueProperty({
  label,
  value,
  property,
  editable = false,
  editingProperty,
  editValue,
  validationError,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onValueChange,
  showHex = true
}: DualValuePropertyProps) {
  const [editFormat, setEditFormat] = useState<'int32' | 'hex'>('int32');
  const isEditing = editingProperty === property;
  const displayValue = value !== undefined ? value : 0;
  const hexValue = showHex ? int32ToHexDisplay(displayValue) : '';

  const handleStartEdit = (format: 'int32' | 'hex') => {
    setEditFormat(format);
    const initialValue = format === 'hex' ? hexValue : String(displayValue);
    onStartEdit(property, initialValue);
  };

  const handleFormatChange = (newFormat: 'int32' | 'hex') => {
    if (!isEditing) return;
    
    try {
      let convertedValue: string;
      if (newFormat === 'hex' && editFormat === 'int32') {
        // Convert from int32 to hex
        const intValue = parseInt(editValue) || 0;
        convertedValue = int32ToHexDisplay(intValue);
      } else if (newFormat === 'int32' && editFormat === 'hex') {
        // Convert from hex to int32
        const intValue = hexDisplayToInt32(editValue);
        convertedValue = String(intValue);
      } else {
        convertedValue = editValue;
      }
      
      setEditFormat(newFormat);
      onValueChange(convertedValue);
    } catch (error) {
      // If conversion fails, keep current format
      toast.error('Invalid value for conversion');
    }
  };

  const handleSave = () => {
    try {
      let finalValue: number;
      if (editFormat === 'hex') {
        finalValue = hexDisplayToInt32(editValue);
      } else {
        finalValue = parseInt(editValue) || 0;
      }
      
      // Update the edit value to the int32 value before saving
      onValueChange(String(finalValue));
      onSaveEdit();
    } catch (error) {
      toast.error('Invalid value format');
    }
  };

  // Non-editable display
  if (!editable) {
    return (
      <div className="flex justify-between items-center">
        <Label className="text-sm font-medium">{label}</Label>
        {showHex ? (
          <div className="flex items-center gap-4 text-sm text-muted-foreground font-mono">
            <span title="Int32 value">{displayValue}</span>
            <span title="Hex value" className="text-xs">({hexValue})</span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground font-mono">
            {displayValue}
          </span>
        )}
      </div>
    );
  }

  // Editable display
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      
      {!isEditing ? (
        <div className="space-y-2">
          {/* Display both values */}
          {showHex ? (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Int32</div>
                <div className="font-mono p-2 bg-muted rounded-md text-center">
                  {displayValue}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Hex</div>
                <div className="font-mono p-2 bg-muted rounded-md text-center">
                  {hexValue}
                </div>
              </div>
            </div>
          ) : (
            <div className="font-mono p-2 bg-muted rounded-md text-center">
              {displayValue}
            </div>
          )}
          
          {/* Edit buttons */}
          {showHex ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleStartEdit('int32')}
              >
                <Edit3 className="h-3 w-3 mr-2" />
                Edit Int32
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleStartEdit('hex')}
              >
                <Hash className="h-3 w-3 mr-2" />
                Edit Hex
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => handleStartEdit('int32')}
            >
              <Edit3 className="h-3 w-3 mr-2" />
              Edit
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Format toggle - only show if hex is enabled */}
          {showHex && (
            <ToggleGroup
              type="single"
              value={editFormat}
              onValueChange={(value) => value && handleFormatChange(value as 'int32' | 'hex')}
              className="justify-start"
            >
              <ToggleGroupItem value="int32" aria-label="Int32 format">
                Int32
              </ToggleGroupItem>
              <ToggleGroupItem value="hex" aria-label="Hex format">
                Hex
              </ToggleGroupItem>
            </ToggleGroup>
          )}
          
          {/* Input field */}
          <Input
            value={editValue}
            onChange={(e) => {
              const newValue = e.target.value;
              if (showHex && editFormat === 'hex') {
                const validation = validateHexInput(newValue);
                onValueChange(validation.formatted);
              } else {
                onValueChange(newValue);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') onCancelEdit();
            }}
            placeholder={
              showHex && editFormat === 'hex' 
                ? 'XX XX XX XX' 
                : 'Integer value'
            }
            className={validationError ? 'border-red-500' : ''}
            autoFocus
          />
          
          {/* Helper text */}
          <div className="text-xs text-muted-foreground">
            {showHex && editFormat === 'hex' 
              ? 'Enter hex bytes separated by spaces (e.g., "8C FB 6D AE")'
              : 'Enter integer value (e.g., "-1368523892")'
            }
          </div>
          
          {/* Validation error */}
          {validationError && (
            <div className="text-xs text-red-500">
              {validationError}
            </div>
          )}
          
          {/* Action buttons */}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} className="flex-1">
              <Save className="h-3 w-3 mr-2" />
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={onCancelEdit} className="flex-1">
              <X className="h-3 w-3 mr-2" />
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
