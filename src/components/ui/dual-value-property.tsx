import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Edit3, Save, X } from "lucide-react";
import { toast } from 'sonner';
import { int32ToHexDisplay, hexDisplayToInt32, float32ToHexDisplay, hexDisplayToFloat32, validateHexInput } from "@/module/commonFunc";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface DualValuePropertyProps {
  label: string;
  labelExtra?: React.ReactNode;
  preview?: React.ReactNode;
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
  showHex?: boolean; // Option to hide hex display for simple properties
  isFloat?: boolean; // Toggle to parse/display as Float32 instead of Int32
  variant?: "default" | "compact";
  containerClassName?: string;
  editOnRowClick?: boolean;
  mode?: "toggle" | "live";
  onCommit?: (value: number) => void;
  onLiveIntInputFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onLiveIntInputClick?: (e: React.MouseEvent<HTMLInputElement>) => void;
}

/**
 * DualValueProperty component for displaying and editing values as both numeric (int32/float) and hex
 * Supports byte-order reversal for hex display (little-endian to big-endian)
 */
export function DualValueProperty({
  label,
  labelExtra,
  preview,
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
  isFloat = false,
  variant = "default",
  containerClassName,
  editOnRowClick = false,
  mode = "toggle",
  onCommit,
  onLiveIntInputFocus,
  onLiveIntInputClick,
}: DualValuePropertyProps) {
  const { t } = useTranslation("ui-b");
  const [editFormat, setEditFormat] = useState<'number' | 'hex'>('number');
  const isEditing = editingProperty === property;
  const displayValue = value !== undefined ? value : 0;
  
  const hexValue = showHex 
    ? (isFloat ? float32ToHexDisplay(displayValue) : int32ToHexDisplay(displayValue)) 
    : '';
    
  const [liveIntDraft, setLiveIntDraft] = useState<string>(String(displayValue));
  const [liveHexDraft, setLiveHexDraft] = useState<string>(hexValue);
  const [liveValidationError, setLiveValidationError] = useState<string>("");

  const numberLabel = isFloat ? "Float32" : "Int32";

  useEffect(() => {
    if (mode !== "live") return;
    setLiveIntDraft(String(displayValue));
    setLiveHexDraft(hexValue);
    setLiveValidationError("");
  }, [displayValue, hexValue, mode]);

  const resolvedEditFormat = useMemo(() => {
    if (!showHex) return "number" as const;
    return editFormat;
  }, [editFormat, showHex]);

  const handleStartEdit = (format: 'number' | 'hex') => {
    const nextFormat = showHex ? format : "number";
    setEditFormat(nextFormat);
    const initialValue = format === 'hex' ? hexValue : String(displayValue);
    onStartEdit(property, initialValue);
  };

  const handleFormatChange = (newFormat: 'number' | 'hex') => {
    if (!isEditing) return;
    if (!showHex) return;
    
    try {
      let convertedValue: string;
      if (newFormat === 'hex' && editFormat === 'number') {
        const numValue = isFloat ? parseFloat(editValue) || 0 : parseInt(editValue) || 0;
        convertedValue = isFloat ? float32ToHexDisplay(numValue) : int32ToHexDisplay(numValue);
      } else if (newFormat === 'number' && editFormat === 'hex') {
        const numValue = isFloat ? hexDisplayToFloat32(editValue) : hexDisplayToInt32(editValue);
        convertedValue = String(numValue);
      } else {
        convertedValue = editValue;
      }
      
      setEditFormat(newFormat);
      onValueChange(convertedValue);
      onValidationErrorChange?.("");
    } catch (error) {
      toast.error(t("invalidValueConversion"));
    }
  };

  const handleSave = () => {
    try {
      let finalValue: number;
      if (resolvedEditFormat === 'hex') {
        finalValue = isFloat ? hexDisplayToFloat32(editValue) : hexDisplayToInt32(editValue);
      } else {
        finalValue = isFloat ? parseFloat(editValue) || 0 : parseInt(editValue) || 0;
      }
      
      onValueChange(String(finalValue));
      onValidationErrorChange?.("");
      onSaveEdit();
    } catch (error) {
      toast.error(t("invalidValueFormat"));
    }
  };

  if (!editable) {
    return (
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2 min-w-0">
          <Label className="text-sm font-medium truncate">{label}</Label>
          {labelExtra}
        </div>
        {showHex ? (
          <div className="flex items-center gap-4 text-sm text-muted-foreground font-mono">
            <span title={t("numberValue", { numberLabel })}>{displayValue}</span>
            <span title={t("hexValue")} className="text-xs">({hexValue})</span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground font-mono">
            {displayValue}
          </span>
        )}
      </div>
    );
  }

  if (editable && variant === "compact") {
    const startEditOnRowClick = editOnRowClick && !isEditing;
    const containerBaseClass = cn(
      "group relative space-y-2 rounded-md border p-3",
      containerClassName,
    );

    if (mode === "live") {
      const commit = (nextValue: number) => {
        if (!onCommit) return;
        onCommit(nextValue);
      };

      return (
        <div className={containerBaseClass}>
          <div className="flex items-center justify-between gap-2">
            <Label className="min-w-0 flex-1 text-xs font-medium text-foreground/85 truncate">
              {label}
            </Label>
            {labelExtra}
          </div>

          {preview}

          {showHex ? (
            <div className="flex items-stretch rounded-md shadow-xs">
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

                  if (isFloat) {
                    if (isNaN(Number(trimmed))) {
                      setLiveValidationError(t("invalidFloat32"));
                      return;
                    }
                    commit(Number.parseFloat(trimmed) || 0);
                  } else {
                    if (!/^-?\d+$/.test(trimmed)) {
                      setLiveValidationError(t("invalidInt32"));
                      return;
                    }
                    commit(Number.parseInt(trimmed, 10) | 0);
                  }
                }}
                onFocus={onLiveIntInputFocus}
                onClick={onLiveIntInputClick}
                placeholder={numberLabel}
                className={cn(
                  "h-8 flex-1 font-mono text-xs tabular-nums shadow-none rounded-l-md rounded-r-none -mr-px",
                  liveValidationError && "border-red-500",
                )}
                aria-invalid={liveValidationError ? true : undefined}
                title={liveValidationError || undefined}
              />
              <Input
                value={liveHexDraft}
                onChange={(e) => {
                  const validation = validateHexInput(e.target.value);
                  setLiveHexDraft(validation.formatted);
                  setLiveValidationError(validation.isValid ? "" : validation.error ?? t("invalidHex"));

                  if (!validation.isValid) return;

                  try {
                    commit(isFloat ? hexDisplayToFloat32(validation.formatted) : hexDisplayToInt32(validation.formatted));
                  } catch (error) {
                    setLiveValidationError(error instanceof Error ? error.message : t("invalidHex"));
                  }
                }}
                placeholder={t("hexPlaceholder")}
                onFocus={onLiveIntInputFocus}
                onClick={onLiveIntInputClick}
                className={cn(
                  "h-8 w-[9.5rem] shrink-0 font-mono text-xs tabular-nums uppercase tracking-wide shadow-none rounded-r-md rounded-l-none -ml-px text-right",
                  liveValidationError && "border-red-500",
                )}
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

                if (isFloat) {
                  if (isNaN(Number(trimmed))) {
                    setLiveValidationError(t("invalidFloat32"));
                    return;
                  }
                  commit(Number.parseFloat(trimmed) || 0);
                } else {
                  if (!/^-?\d+$/.test(trimmed)) {
                    setLiveValidationError(t("invalidInt32"));
                    return;
                  }
                  commit(Number.parseInt(trimmed, 10) | 0);
                }
              }}
              onFocus={onLiveIntInputFocus}
              onClick={onLiveIntInputClick}
              placeholder={numberLabel}
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
          <Label className="min-w-0 flex-1 text-xs font-medium text-foreground/85 truncate">
            {label}
          </Label>
          {labelExtra}
        </div>

        {preview}

        {showHex ? (
          <div className="flex rounded-md shadow-xs">
            <Input
              value={isEditing && resolvedEditFormat === "number" ? editValue : String(displayValue)}
              onChange={isEditing && resolvedEditFormat === "number" ? (e) => {
                const newValue = e.target.value;
                onValidationErrorChange?.("");
                onValueChange(newValue);
              } : undefined}
              onKeyDown={isEditing && resolvedEditFormat === "number" ? (e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") onCancelEdit();
              } : undefined}
              onClick={!isEditing && startEditOnRowClick ? () => handleStartEdit("number") : (isEditing && resolvedEditFormat !== "number" ? () => handleFormatChange("number") : undefined)}
              readOnly={!isEditing || resolvedEditFormat !== "number"}
              placeholder={numberLabel}
              className={[
                "h-8 font-mono text-sm shadow-none rounded-l-md rounded-r-none -mr-px",
                !isEditing || resolvedEditFormat !== "number" ? "cursor-pointer hover:bg-accent/20" : "",
                isEditing && resolvedEditFormat === "number" && validationError ? "border-red-500" : "",
              ].join(" ")}
              autoFocus={isEditing && resolvedEditFormat === "number"}
              aria-invalid={isEditing && resolvedEditFormat === "number" && validationError ? true : undefined}
            title={!isEditing ? t("clickToEdit") : (resolvedEditFormat !== "number" ? t("clickToSwitchFormat", { numberLabel }) : validationError || undefined)}
            />
            <Input
              value={isEditing && resolvedEditFormat === "hex" ? editValue : hexValue}
              onChange={isEditing && resolvedEditFormat === "hex" ? (e) => {
                const newValue = e.target.value;
                const validation = validateHexInput(newValue);
                onValueChange(validation.formatted);
                onValidationErrorChange?.(validation.isValid ? "" : validation.error ?? t("invalidHex"));
              } : undefined}
              onKeyDown={isEditing && resolvedEditFormat === "hex" ? (e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") onCancelEdit();
              } : undefined}
              onClick={!isEditing && startEditOnRowClick ? () => handleStartEdit("hex") : (isEditing && resolvedEditFormat !== "hex" ? () => handleFormatChange("hex") : undefined)}
              readOnly={!isEditing || resolvedEditFormat !== "hex"}
              placeholder={t("hexPlaceholder")}
              className={[
                "h-8 font-mono text-sm shadow-none rounded-r-md rounded-l-none -ml-px",
                !isEditing || resolvedEditFormat !== "hex" ? "cursor-pointer hover:bg-accent/20" : "",
                isEditing && resolvedEditFormat === "hex" && validationError ? "border-red-500" : "",
              ].join(" ")}
              autoFocus={isEditing && resolvedEditFormat === "hex"}
              aria-invalid={isEditing && resolvedEditFormat === "hex" && validationError ? true : undefined}
              title={!isEditing ? t("clickToEdit") : (resolvedEditFormat !== "hex" ? t("clickToSwitchFormat", { numberLabel: t("hex") }) : validationError || undefined)}
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
            onClick={!isEditing && startEditOnRowClick ? () => handleStartEdit("number") : undefined}
            readOnly={!isEditing}
            placeholder={t("numberValue", { numberLabel })}
            className={[
              "h-8 font-mono text-sm",
              !isEditing ? "cursor-pointer hover:bg-accent/20" : "",
              validationError ? "border-red-500" : "",
            ].join(" ")}
            autoFocus={isEditing}
            aria-invalid={validationError ? true : undefined}
            title={validationError || (!isEditing ? t("clickToEdit") : undefined)}
          />
        )}

        {isEditing && validationError && (
          <div className="text-[11px] text-red-500">
            {validationError}
          </div>
        )}

        {isEditing ? (
          <div className="flex items-center justify-end gap-1">
            <Button size="icon" className="h-7 w-7" onClick={handleSave} title={t("save")}>
              <Save className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCancelEdit} title={t("cancel")}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : !editOnRowClick && (
          <Button
            size="sm"
            variant="outline"
            className="w-full h-7"
            onClick={() => handleStartEdit("number")}
            title={t("edit")}
          >
            <Edit3 className="h-3 w-3 mr-1.5" />
            {t("edit")}
          </Button>
        )}
      </div>
    );

    return CardContent;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-medium truncate">{label}</Label>
        {labelExtra}
      </div>
      
      {!isEditing ? (
        <div className="space-y-2">
          {showHex ? (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">{numberLabel}</div>
                <div className="font-mono p-2 bg-muted rounded-md text-center">
                  {displayValue}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">{t("hex")}</div>
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
          
          {showHex ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleStartEdit('number')}
              >
                <Edit3 className="h-3 w-3 mr-2" />
                {t("editNumber", { numberLabel })}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleStartEdit('hex')}
              >
                <Edit3 className="h-3 w-3 mr-2" />
                {t("editHex")}
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => handleStartEdit('number')}
            >
              <Edit3 className="h-3 w-3 mr-2" />
              {t("edit")}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {showHex && (
            <ToggleGroup
              type="single"
              value={resolvedEditFormat}
              onValueChange={(value) => value && handleFormatChange(value as 'number' | 'hex')}
              className="justify-start"
            >
              <ToggleGroupItem value="number" aria-label={t("formatAria", { numberLabel })}>
                {numberLabel}
              </ToggleGroupItem>
              <ToggleGroupItem value="hex" aria-label={t("hexFormat")}>
                {t("hex")}
              </ToggleGroupItem>
            </ToggleGroup>
          )}
          
          <Input
            value={editValue}
            onChange={(e) => {
              const newValue = e.target.value;
              if (showHex && resolvedEditFormat === 'hex') {
                const validation = validateHexInput(newValue);
                onValueChange(validation.formatted);
                onValidationErrorChange?.(validation.isValid ? "" : validation.error ?? t("invalidHex"));
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
                ? t("hexPlaceholder") 
                : t("numberValue", { numberLabel })
            }
            className={validationError ? 'border-red-500' : ''}
            autoFocus
          />
          {validationError && (
            <div className="text-xs text-red-500">
              {validationError}
            </div>
          )}
          
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} className="flex-1">
              <Save className="h-3 w-3 mr-2" />
              {t("save")}
            </Button>
            <Button size="sm" variant="outline" onClick={onCancelEdit} className="flex-1">
              <X className="h-3 w-3 mr-2" />
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
