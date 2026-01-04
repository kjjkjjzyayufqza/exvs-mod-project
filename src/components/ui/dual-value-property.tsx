import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Edit3, Save, X } from "lucide-react";
import { toast } from 'sonner';
import { int32ToHexDisplay, hexDisplayToInt32, validateHexInput } from "@/module/commonFunc";

interface DualValuePropertyProps {
  label: string;
  labelExtra?: React.ReactNode;
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
  onValidationErrorChange?: (message: string) => void;
  showHex?: boolean; // Option to hide hex display for simple int32 properties
  variant?: "default" | "compact";
  editOnRowClick?: boolean;
  mode?: "toggle" | "live";
  onCommit?: (value: number) => void;
}

/**
 * DualValueProperty component for displaying and editing values as both int32 and hex
 * Supports byte-order reversal for hex display (little-endian to big-endian)
 */
export function DualValueProperty({
  label,
  labelExtra,
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
  onValidationErrorChange,
  showHex = true,
  variant = "default",
  editOnRowClick = false,
  mode = "toggle",
  onCommit,
}: DualValuePropertyProps) {
  const [editFormat, setEditFormat] = useState<'int32' | 'hex'>('int32');
  const isEditing = editingProperty === property;
  const displayValue = value !== undefined ? value : 0;
  const hexValue = showHex ? int32ToHexDisplay(displayValue) : '';
  const [liveIntDraft, setLiveIntDraft] = useState<string>(String(displayValue));
  const [liveHexDraft, setLiveHexDraft] = useState<string>(hexValue);
  const [liveValidationError, setLiveValidationError] = useState<string>("");

  useEffect(() => {
    if (mode !== "live") return;
    setLiveIntDraft(String(displayValue));
    setLiveHexDraft(hexValue);
    setLiveValidationError("");
  }, [displayValue, hexValue, mode]);

  const resolvedEditFormat = useMemo(() => {
    if (!showHex) return "int32" as const;
    return editFormat;
  }, [editFormat, showHex]);

  const handleStartEdit = (format: 'int32' | 'hex') => {
    const nextFormat = showHex ? format : "int32";
    setEditFormat(nextFormat);
    const initialValue = format === 'hex' ? hexValue : String(displayValue);
    onStartEdit(property, initialValue);
  };

  const handleFormatChange = (newFormat: 'int32' | 'hex') => {
    if (!isEditing) return;
    if (!showHex) return;
    
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
      onValidationErrorChange?.("");
    } catch (error) {
      // If conversion fails, keep current format
      toast.error('Invalid value for conversion');
    }
  };

  const handleSave = () => {
    try {
      let finalValue: number;
      if (resolvedEditFormat === 'hex') {
        finalValue = hexDisplayToInt32(editValue);
      } else {
        finalValue = parseInt(editValue) || 0;
      }
      
      // Update the edit value to the int32 value before saving
      onValueChange(String(finalValue));
      onValidationErrorChange?.("");
      onSaveEdit();
    } catch (error) {
      toast.error('Invalid value format');
    }
  };

  // Non-editable display
  if (!editable) {
    return (
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2 min-w-0">
          <Label className="text-sm font-medium truncate">{label}</Label>
          {labelExtra}
        </div>
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

  // Compact editable display - card style with vertical layout
  if (editable && variant === "compact") {
    const startEditOnRowClick = editOnRowClick && !isEditing;
    const containerBaseClass = "group relative space-y-2 rounded-md border p-3";

    if (mode === "live") {
      const commit = (nextValue: number) => {
        if (!onCommit) return;
        onCommit(nextValue);
      };

      return (
        <div className={containerBaseClass}>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-medium text-muted-foreground truncate">
              {label}
            </Label>
            {labelExtra}
          </div>

          {showHex ? (
            <div className="flex rounded-md shadow-xs">
              <Input
                value={liveIntDraft}
                onChange={(e) => {
                  const next = e.target.value;
                  setLiveIntDraft(next);
                  setLiveValidationError("");

                  const trimmed = next.trim();
                  if (!trimmed) {
                    commit(0);
                    return;
                  }

                  if (!/^-?\d+$/.test(trimmed)) {
                    setLiveValidationError("Invalid int32 value");
                    return;
                  }

                  commit(Number.parseInt(trimmed, 10) | 0);
                }}
                placeholder="Int32"
                className={[
                  "h-8 font-mono text-sm shadow-none rounded-l-md rounded-r-none -mr-px",
                  liveValidationError ? "border-red-500" : "",
                ].join(" ")}
                aria-invalid={liveValidationError ? true : undefined}
                title={liveValidationError || undefined}
              />
              <Input
                value={liveHexDraft}
                onChange={(e) => {
                  const validation = validateHexInput(e.target.value);
                  setLiveHexDraft(validation.formatted);
                  setLiveValidationError(validation.isValid ? "" : validation.error ?? "Invalid hex format");

                  if (!validation.isValid) return;

                  try {
                    commit(hexDisplayToInt32(validation.formatted));
                  } catch (error) {
                    setLiveValidationError(error instanceof Error ? error.message : "Invalid hex format");
                  }
                }}
                placeholder="XX XX XX XX"
                className={[
                  "h-8 font-mono text-sm shadow-none rounded-r-md rounded-l-none -ml-px",
                  liveValidationError ? "border-red-500" : "",
                ].join(" ")}
                aria-invalid={liveValidationError ? true : undefined}
                title={liveValidationError || undefined}
              />
            </div>
          ) : (
            <Input
              value={liveIntDraft}
              onChange={(e) => {
                const next = e.target.value;
                setLiveIntDraft(next);
                setLiveValidationError("");

                const trimmed = next.trim();
                if (!trimmed) {
                  commit(0);
                  return;
                }

                if (!/^-?\d+$/.test(trimmed)) {
                  setLiveValidationError("Invalid int32 value");
                  return;
                }

                commit(Number.parseInt(trimmed, 10) | 0);
              }}
              placeholder="Int32"
              className={[
                "h-8 font-mono text-sm",
                liveValidationError ? "border-red-500" : "",
              ].join(" ")}
              aria-invalid={liveValidationError ? true : undefined}
              title={liveValidationError || undefined}
            />
          )}

          {liveValidationError && (
            <div className="text-[11px] text-red-500">
              {liveValidationError}
            </div>
          )}
        </div>
      );
    }

    const CardContent = (
      <div className={containerBaseClass}>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs font-medium text-muted-foreground truncate">
            {label}
          </Label>
          {labelExtra}
        </div>

        {/* Input with add-ons style - two separate inputs */}
        {showHex ? (
          <div className="flex rounded-md shadow-xs">
            <Input
              value={isEditing && resolvedEditFormat === "int32" ? editValue : String(displayValue)}
              onChange={isEditing && resolvedEditFormat === "int32" ? (e) => {
                const newValue = e.target.value;
                onValidationErrorChange?.("");
                onValueChange(newValue);
              } : undefined}
              onKeyDown={isEditing && resolvedEditFormat === "int32" ? (e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") onCancelEdit();
              } : undefined}
              onClick={!isEditing && startEditOnRowClick ? () => handleStartEdit("int32") : (isEditing && resolvedEditFormat !== "int32" ? () => handleFormatChange("int32") : undefined)}
              readOnly={!isEditing || resolvedEditFormat !== "int32"}
              placeholder="Int32"
              className={[
                "h-8 font-mono text-sm shadow-none rounded-l-md rounded-r-none -mr-px",
                !isEditing || resolvedEditFormat !== "int32" ? "cursor-pointer hover:bg-accent/20" : "",
                isEditing && resolvedEditFormat === "int32" && validationError ? "border-red-500" : "",
              ].join(" ")}
              autoFocus={isEditing && resolvedEditFormat === "int32"}
              aria-invalid={isEditing && resolvedEditFormat === "int32" && validationError ? true : undefined}
              title={!isEditing ? "Click to edit" : (resolvedEditFormat !== "int32" ? "Click to switch to Int32 format" : validationError || undefined)}
            />
            <Input
              value={isEditing && resolvedEditFormat === "hex" ? editValue : hexValue}
              onChange={isEditing && resolvedEditFormat === "hex" ? (e) => {
                const newValue = e.target.value;
                const validation = validateHexInput(newValue);
                onValueChange(validation.formatted);
                onValidationErrorChange?.(validation.isValid ? "" : validation.error ?? "Invalid hex format");
              } : undefined}
              onKeyDown={isEditing && resolvedEditFormat === "hex" ? (e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") onCancelEdit();
              } : undefined}
              onClick={!isEditing && startEditOnRowClick ? () => handleStartEdit("hex") : (isEditing && resolvedEditFormat !== "hex" ? () => handleFormatChange("hex") : undefined)}
              readOnly={!isEditing || resolvedEditFormat !== "hex"}
              placeholder="XX XX XX XX"
              className={[
                "h-8 font-mono text-sm shadow-none rounded-r-md rounded-l-none -ml-px",
                !isEditing || resolvedEditFormat !== "hex" ? "cursor-pointer hover:bg-accent/20" : "",
                isEditing && resolvedEditFormat === "hex" && validationError ? "border-red-500" : "",
              ].join(" ")}
              autoFocus={isEditing && resolvedEditFormat === "hex"}
              aria-invalid={isEditing && resolvedEditFormat === "hex" && validationError ? true : undefined}
              title={!isEditing ? "Click to edit" : (resolvedEditFormat !== "hex" ? "Click to switch to Hex format" : validationError || undefined)}
            />
          </div>
        ) : (
          <Input
            value={isEditing ? editValue : String(displayValue)}
            onChange={isEditing ? (e) => {
              const newValue = e.target.value;
              onValidationErrorChange?.("");
              onValueChange(newValue);
            } : undefined}
            onKeyDown={isEditing ? (e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") onCancelEdit();
            } : undefined}
            onClick={!isEditing && startEditOnRowClick ? () => handleStartEdit("int32") : undefined}
            readOnly={!isEditing}
            placeholder="Integer value"
            className={[
              "h-8 font-mono text-sm",
              !isEditing ? "cursor-pointer hover:bg-accent/20" : "",
              validationError ? "border-red-500" : "",
            ].join(" ")}
            autoFocus={isEditing}
            aria-invalid={validationError ? true : undefined}
            title={validationError || (!isEditing ? "Click to edit" : undefined)}
          />
        )}

        {/* Validation error */}
        {isEditing && validationError && (
          <div className="text-[11px] text-red-500">
            {validationError}
          </div>
        )}

        {/* Action buttons - only show when editing or when not using editOnRowClick */}
        {isEditing ? (
          <div className="flex items-center justify-end gap-1">
            <Button size="icon" className="h-7 w-7" onClick={handleSave} title="Save">
              <Save className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCancelEdit} title="Cancel">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : !editOnRowClick && (
          <Button
            size="sm"
            variant="outline"
            className="w-full h-7"
            onClick={() => handleStartEdit("int32")}
            title="Edit"
          >
            <Edit3 className="h-3 w-3 mr-1.5" />
            Edit
          </Button>
        )}
      </div>
    );

    return CardContent;
  }

  // Editable display (default)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-medium truncate">{label}</Label>
        {labelExtra}
      </div>
      
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
                <Edit3 className="h-3 w-3 mr-2" />
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
              value={resolvedEditFormat}
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
              if (showHex && resolvedEditFormat === 'hex') {
                const validation = validateHexInput(newValue);
                onValueChange(validation.formatted);
                onValidationErrorChange?.(validation.isValid ? "" : validation.error ?? "Invalid hex format");
              } else {
                onValueChange(newValue);
                onValidationErrorChange?.("");
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') onCancelEdit();
            }}
            placeholder={
              showHex && resolvedEditFormat === 'hex' 
                ? 'XX XX XX XX' 
                : 'Integer value'
            }
            className={validationError ? 'border-red-500' : ''}
            autoFocus
          />
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
