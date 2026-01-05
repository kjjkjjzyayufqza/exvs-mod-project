import { ChangeEvent, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SeriesData } from "@/models/seriesList";

interface SeriesFormProps {
  series: SeriesData;
  index: number;
  onChange: (updated: SeriesData) => void;
}

export function SeriesForm({ series, index, onChange }: SeriesFormProps) {
  const handleNumberChange = useCallback(
    (field: keyof Pick<SeriesData, "unk1" | "unk2" | "unk3" | "unk4" | "unk5" | "unk6">) =>
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
  const thumbnailSrc = "/tauri.svg";

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-4">
          <div className="h-32 w-32 shrink-0 overflow-hidden rounded border bg-white">
            <img src={thumbnailSrc} alt={seriesName || "Series"} className="h-full w-full object-contain" />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <CardTitle className="text-lg">Series Details</CardTitle>
            <div className="text-xs text-muted-foreground">
              <div>ID: {series.SeriesId}</div>
              <div>Index: {index}</div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 min-h-0">
        <ScrollArea className="h-full pr-4">
          <div className="space-y-4">
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
              <div className="space-y-2">
                <Label htmlFor="unk1">unk1</Label>
                <Input
                  id="unk1"
                  type="number"
                  value={series.unk1}
                  onChange={handleNumberChange("unk1")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="unk2">unk2</Label>
                <Input
                  id="unk2"
                  type="number"
                  value={series.unk2}
                  onChange={handleNumberChange("unk2")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="unk3">unk3</Label>
                <Input
                  id="unk3"
                  type="number"
                  value={series.unk3}
                  onChange={handleNumberChange("unk3")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="unk4">unk4</Label>
                <Input
                  id="unk4"
                  type="number"
                  value={series.unk4}
                  onChange={handleNumberChange("unk4")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="unk5">unk5</Label>
                <Input
                  id="unk5"
                  type="number"
                  value={series.unk5}
                  onChange={handleNumberChange("unk5")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="unk6">unk6</Label>
                <Input
                  id="unk6"
                  type="number"
                  value={series.unk6}
                  onChange={handleNumberChange("unk6")}
                />
              </div>
            </div>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

