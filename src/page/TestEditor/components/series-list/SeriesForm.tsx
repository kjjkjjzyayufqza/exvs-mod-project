import { useCallback, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ImageIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SeriesData } from "@/models/seriesList";
import { getPathSeparatorFromFileUrl } from "@/lib/fhm2d_fileUrlUtils";
import { formatSeriesPngFileNameFromBaseName, resolveMappedSeriesBaseName } from "./seriesImage";
import { SeriesImageReplaceDialog } from "./SeriesImageReplaceDialog";

const FormSchema = z.object({
  SeriesId: z.number().int(),
  unk2: z.number().int(),
  iconFileIndex: z.number().int(),
  unk3: z.number().int(),
  seriesName: z.string(),
  unk4: z.number().int(),
  unk5: z.number().int(),
  characterListPosition: z.number().int(),
});

type FormData = z.infer<typeof FormSchema>;

interface SeriesFormProps {
  series: SeriesData;
  index: number;
  seriesImageConvertDirPath?: string;
  seriesImageSeriesBaseNameOrder?: Array<string | null>;
  onRefreshSeriesImages?: () => Promise<void> | void;
  isSeriesIdTaken?: (nextId: number) => boolean;
  onChange: (updated: SeriesData) => void;
}

export function SeriesForm({
  series,
  index,
  seriesImageConvertDirPath,
  seriesImageSeriesBaseNameOrder,
  onRefreshSeriesImages,
  isSeriesIdTaken,
  onChange,
}: SeriesFormProps) {
  const [previewVersion, setPreviewVersion] = useState(0);
  const [seriesImageDialogOpen, setSeriesImageDialogOpen] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      SeriesId: series.SeriesId,
      unk2: series.unk2,
      iconFileIndex: series.iconFileIndex,
      unk3: series.unk3,
      seriesName: series.unkStr1?.Utf8String || "",
      unk4: series.unk4,
      unk5: series.unk5,
      characterListPosition: series.characterListPosition,
    },
  });

  // Sync form values when series data changes
  useEffect(() => {
    form.reset({
      SeriesId: series.SeriesId,
      unk2: series.unk2,
      iconFileIndex: series.iconFileIndex,
      unk3: series.unk3,
      seriesName: series.unkStr1?.Utf8String || "",
      unk4: series.unk4,
      unk5: series.unk5,
      characterListPosition: series.characterListPosition,
    });
  }, [series, form]);

  const onSubmit = useCallback((data: FormData) => {
    // Validate SeriesId uniqueness
    if (isSeriesIdTaken?.(data.SeriesId)) {
      form.setError("SeriesId", {
        type: "manual",
        message: "Series ID already exists"
      });
      return;
    }

    const updatedSeries: SeriesData = {
      ...series,
      SeriesId: data.SeriesId,
      unk2: data.unk2,
      iconFileIndex: data.iconFileIndex,
      unk3: data.unk3,
      unkStr1: {
        ...series.unkStr1,
        Utf8String: data.seriesName,
      },
      unk4: data.unk4,
      unk5: data.unk5,
      characterListPosition: data.characterListPosition,
    };

    onChange(updatedSeries);
  }, [form, isSeriesIdTaken, onChange, series]);

  const seriesName = series.unkStr1?.Utf8String || "";
  const baseName = resolveMappedSeriesBaseName(seriesImageSeriesBaseNameOrder, series.iconFileIndex);
  const imageFileName = baseName ? formatSeriesPngFileNameFromBaseName(baseName) : null;
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
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="h-full flex flex-col">
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-start gap-4">
              <div className="shrink-0">
                <div className="h-24 w-48 overflow-hidden rounded border bg-black relative group">
                  <img
                    src={thumbnailSrc}
                    alt={seriesName || "Series"}
                    className="h-full w-full object-contain"
                    onError={(e) => {
                      e.currentTarget.src = "/tauri.svg";
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="shadow-md font-semibold"
                      onClick={() => setSeriesImageDialogOpen(true)}
                    >
                      View
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <CardTitle className="text-lg">Series Details</CardTitle>
                    <div className="text-xs text-muted-foreground">
                      <div>ID: {series.SeriesId}</div>
                      <div>Index: {index}</div>
                      <div>Image: {imageFileName ?? "-"}</div>
                    </div>
                  </div>
                  <SeriesImageReplaceDialog
                    open={seriesImageDialogOpen}
                    onOpenChange={setSeriesImageDialogOpen}
                    iconFileIndex={series.iconFileIndex}
                    seriesImageConvertDirPath={seriesImageConvertDirPath}
                    seriesImageSeriesBaseNameOrder={seriesImageSeriesBaseNameOrder}
                    onRefreshSeriesImages={onRefreshSeriesImages}
                    onApplied={(nextIconFileIndex) => {
                      form.setValue("iconFileIndex", nextIconFileIndex);
                      setPreviewVersion((v) => v + 1);
                    }}
                    trigger={
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="shrink-0 font-semibold shadow-sm gap-2"
                      >
                        <ImageIcon className="w-4 h-4 shrink-0" />
                        Image
                      </Button>
                    }
                  />
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex-1 min-h-0">
            <ScrollArea className="h-full pr-4">
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="SeriesId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Series ID</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Enter series ID"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="seriesName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Series Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter series name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="unk2"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>unk2</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="iconFileIndex"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>iconFileIndex</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormDescription>
                          Points to image index in 0xA0253AA0.fhm2d.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="unk3"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>unk3</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="unk4"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>unk4</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="unk5"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>unk5</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="characterListPosition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>characterListPosition</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormDescription>
                          Position/index used for character list ordering.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button type="submit" disabled={!form.formState.isDirty} className="w-full mt-4">
                  Save Changes
                </Button>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}

