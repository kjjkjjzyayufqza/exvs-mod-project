import { ChangeEvent, useCallback, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SeriesData } from "@/models/seriesList";
import { getPathSeparatorFromFileUrl } from "@/lib/fhm2d_fileUrlUtils";
import { DualValueProperty } from "@/components/ui/dual-value-property";
import { formatSeriesImageFileName } from "./seriesImage";
import { SeriesImageReplaceDialog } from "./SeriesImageReplaceDialog";

interface SeriesFormProps {
  series: SeriesData;
  index: number;
  seriesImageConvertDirPath?: string;
  isSeriesIdTaken?: (nextId: number) => boolean;
  onChange: (updated: SeriesData) => void;
}

export function SeriesForm({ series, index, seriesImageConvertDirPath, isSeriesIdTaken, onChange }: SeriesFormProps) {
  const [editingProperty, setEditingProperty] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [validationError, setValidationError] = useState<string>("");
  const editValueRef = useRef<string>("");
  const [previewVersion, setPreviewVersion] = useState(0);

  const handleStartEdit = useCallback((property: string, value: string | number) => {
    setEditingProperty(property);
    const next = String(value ?? "");
    setEditValue(next);
    editValueRef.current = next;
    setValidationError("");
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingProperty(null);
    setEditValue("");
    editValueRef.current = "";
    setValidationError("");
  }, []);

  const handleValueChange = useCallback((value: string) => {
    setEditValue(value);
    editValueRef.current = value;
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingProperty) return;
    if (validationError) return;

    if (editingProperty === "SeriesId") {
      const trimmed = editValueRef.current.trim();
      const parsed = trimmed ? Number.parseInt(trimmed, 10) : 0;
      const nextId = Number.isFinite(parsed) ? (parsed | 0) : 0;

      if (isSeriesIdTaken?.(nextId)) {
        setValidationError("Series ID already exists");
        return;
      }

      onChange({ ...series, SeriesId: nextId });
      setEditingProperty(null);
      setEditValue("");
      editValueRef.current = "";
      setValidationError("");
      return;
    }

    setEditingProperty(null);
  }, [editingProperty, isSeriesIdTaken, onChange, series, validationError]);

  const handleNumberChange = useCallback(
    (field: keyof Pick<SeriesData, "iconFileIndex" | "unk2" | "unk3" | "unk4" | "unk5" | "characterListPosition">) =>
      (e: ChangeEvent<HTMLInputElement>) => {
        const value = Number(e.target.value) || 0;
        onChange({ ...series, [field]: value });
      },
    [series, onChange]
  );

  const handleNameChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const newName = e.target.value;
      onChange({
        ...series,
        unkStr1: {
          ...series.unkStr1,
          Utf8String: newName,
        },
      });
    },
    [series, onChange]
  );

  const seriesName = series.unkStr1?.Utf8String || "";
  const imageFileName = formatSeriesImageFileName(series.iconFileIndex);
  const imageFilePath = (() => {
    if (!seriesImageConvertDirPath || !imageFileName) return null;
    const sep = getPathSeparatorFromFileUrl(seriesImageConvertDirPath);
    if (seriesImageConvertDirPath.endsWith(sep)) return `${seriesImageConvertDirPath}${imageFileName}`;
    return `${seriesImageConvertDirPath}${sep}${imageFileName}`;
  })();
  const thumbnailSrc = (() => {
    if (!imageFilePath) return "/tauri.svg";
    const base = convertFileSrc(imageFilePath);
    const q = base.includes("?") ? "&" : "?";
    return `${base}${q}v=${previewVersion}`;
  })();

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-4">
          <div className="shrink-0 space-y-2">
            <div className="h-24 w-48 overflow-hidden rounded border bg-black">
              <img
                src={thumbnailSrc}
                alt={seriesName || "Series"}
                className="h-full w-full object-contain"
                onError={(e) => {
                  e.currentTarget.src = "/tauri.svg";
                }}
              />
            </div>
            <SeriesImageReplaceDialog
              iconFileIndex={series.iconFileIndex}
              seriesImageConvertDirPath={seriesImageConvertDirPath}
              onApplied={(nextIconFileIndex) => {
                onChange({ ...series, iconFileIndex: nextIconFileIndex });
                setPreviewVersion((v) => v + 1);
              }}
            />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <CardTitle className="text-lg">Series Details</CardTitle>
            <div className="text-xs text-muted-foreground">
              <div>ID: {series.SeriesId}</div>
              <div>Index: {index}</div>
              <div>Image: {imageFileName ?? "-"}</div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 min-h-0">
        <ScrollArea className="h-full pr-4">
          <div className="space-y-4">
            <DualValueProperty
              label="Series ID"
              value={series.SeriesId}
              property="SeriesId"
              editable
              editingProperty={editingProperty}
              editValue={editValue}
              validationError={validationError}
              onStartEdit={handleStartEdit}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={handleCancelEdit}
              onValueChange={handleValueChange}
              onValidationErrorChange={setValidationError}
              variant="compact"
              showHex={true}
            />

            <div className="space-y-2">
              <Label htmlFor="series-name">Series Name</Label>
              <Input
                id="series-name"
                value={seriesName}
                onChange={handleNameChange}
                placeholder="Enter series name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="iconFileIndex">iconFileIndex</Label>
                <div className="text-xs text-muted-foreground min-h-8 leading-snug">
                  Points to image index in 0xA0253AA0.fhm2d.
                </div>
                <Input
                  id="iconFileIndex"
                  type="number"
                  value={series.iconFileIndex}
                  onChange={handleNumberChange("iconFileIndex")}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="unk2">unk2</Label>
                <div className="text-xs text-muted-foreground min-h-8 leading-snug" />
                <Input
                  id="unk2"
                  type="number"
                  value={series.unk2}
                  onChange={handleNumberChange("unk2")}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="unk3">unk3</Label>
                <div className="text-xs text-muted-foreground min-h-8 leading-snug" />
                <Input
                  id="unk3"
                  type="number"
                  value={series.unk3}
                  onChange={handleNumberChange("unk3")}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="unk4">unk4</Label>
                <div className="text-xs text-muted-foreground min-h-8 leading-snug" />
                <Input
                  id="unk4"
                  type="number"
                  value={series.unk4}
                  onChange={handleNumberChange("unk4")}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="unk5">unk5</Label>
                <div className="text-xs text-muted-foreground min-h-8 leading-snug" />
                <Input
                  id="unk5"
                  type="number"
                  value={series.unk5}
                  onChange={handleNumberChange("unk5")}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="characterListPosition">characterListPosition</Label>
                <div className="text-xs text-muted-foreground min-h-8 leading-snug">
                  Position/index used for character list ordering.
                </div>
                <Input
                  id="characterListPosition"
                  type="number"
                  value={series.characterListPosition}
                  onChange={handleNumberChange("characterListPosition")}
                />
              </div>
            </div>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

