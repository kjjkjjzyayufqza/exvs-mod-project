import { useCallback, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ImageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

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
import type { SeriesListEntry } from "@/models/seriesListEntry";
import { getPathSeparatorFromFileUrl } from "@/lib/fhm2d_fileUrlUtils";
import { formatSeriesPngFileNameFromBaseName, resolveMappedSeriesBaseName } from "./seriesImage";
import { SeriesImageReplaceDialog } from "./SeriesImageReplaceDialog";

const FormSchema = z.object({
  entryId: z.number().int(),
  recordLookupId: z.number().int(),
  iconFileIndex: z.number().int(),
  unk0x08: z.number().int(),
  seriesName: z.string(),
  displayNameRef: z.number().int(),
  characterListPosition: z.number().int(),
});

type FormData = z.infer<typeof FormSchema>;

interface SeriesFormProps {
  series: SeriesListEntry;
  index: number;
  editable?: boolean;
  seriesImageConvertDirPath?: string;
  seriesImageStructureJsonPath?: string;
  seriesImageWritable?: boolean;
  seriesImageSeriesBaseNameOrder?: Array<string | null>;
  onRefreshSeriesImages?: () => Promise<void> | void;
  isSeriesIdTaken?: (nextId: number) => boolean;
  onChange: (updated: SeriesListEntry) => void;
}

export function SeriesForm({
  series,
  index,
  editable = true,
  seriesImageConvertDirPath,
  seriesImageStructureJsonPath,
  seriesImageWritable = false,
  seriesImageSeriesBaseNameOrder,
  onRefreshSeriesImages,
  isSeriesIdTaken,
  onChange,
}: SeriesFormProps) {
  const { t } = useTranslation("test-lists");
  const [previewVersion, setPreviewVersion] = useState(0);
  const [seriesImageDialogOpen, setSeriesImageDialogOpen] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      entryId: series.entryId,
      recordLookupId: series.recordLookupId,
      iconFileIndex: series.iconFileIndex,
      unk0x08: series.unk0x08,
      seriesName: series.name || "",
      displayNameRef: series.displayNameRef,
      characterListPosition: series.characterListPosition,
    },
  });

  // Sync form values when series data changes
  useEffect(() => {
    form.reset({
      entryId: series.entryId,
      recordLookupId: series.recordLookupId,
      iconFileIndex: series.iconFileIndex,
      unk0x08: series.unk0x08,
      seriesName: series.name || "",
      displayNameRef: series.displayNameRef,
      characterListPosition: series.characterListPosition,
    });
  }, [series, form]);

  const onSubmit = useCallback((data: FormData) => {
    // Validate Series ID uniqueness
    if (isSeriesIdTaken?.(data.entryId)) {
      form.setError("entryId" as const, {
        type: "manual",
        message: t("series.idExists")
      });
      return;
    }

    const updatedSeries: SeriesListEntry = {
      ...series,
      entryId: data.entryId,
      recordLookupId: data.recordLookupId,
      iconFileIndex: data.iconFileIndex,
      unk0x08: data.unk0x08,
      name: data.seriesName,
      displayNameRef: data.displayNameRef,
      characterListPosition: data.characterListPosition,
    };

    onChange(updatedSeries);
  }, [form, isSeriesIdTaken, onChange, series]);

  const seriesName = series.name || "";
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
                    alt={seriesName || t("series.altFallback")}
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
                      {t("series.view")}
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <CardTitle className="text-lg">{t("series.details")}</CardTitle>
                    <div className="text-xs text-muted-foreground">
                      <div>ID: {series.entryId}</div>
                      <div>{t("series.indexLabel", { index })}</div>
                      <div>{t("series.imageLabel", { name: imageFileName ?? "-" })}</div>
                    </div>
                  </div>
                  <SeriesImageReplaceDialog
                    open={seriesImageDialogOpen}
                    onOpenChange={setSeriesImageDialogOpen}
                    iconFileIndex={series.iconFileIndex}
                    seriesImageConvertDirPath={seriesImageConvertDirPath}
                    seriesImageStructureJsonPath={seriesImageStructureJsonPath}
                    seriesImageWritable={seriesImageWritable}
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
                        disabled={!editable}
                        className="shrink-0 font-semibold shadow-sm gap-2"
                      >
                        <ImageIcon className="w-4 h-4 shrink-0" />
                        {t("series.image")}
                      </Button>
                    }
                  />
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex-1 min-h-0">
            <ScrollArea className="h-full pr-4">
              <fieldset disabled={!editable} className="space-y-4">
                <FormField
                  control={form.control}
                  name="entryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("series.seriesId")}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder={t("series.enterId")}
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
                      <FormLabel>{t("series.seriesName")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("series.enterName")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="iconFileIndex"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("series.field.iconFileIndex")}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormDescription>
                          {t("series.help.iconFileIndex")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="characterListPosition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("series.field.characterListPosition")}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormDescription>
                          {t("series.help.characterListPosition")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="displayNameRef"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("series.field.displayNameRef")}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormDescription>
                          {t("series.help.displayNameRef")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="recordLookupId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("series.field.recordLookupId")}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormDescription>{t("series.help.recordLookupId")}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="unk0x08"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("series.field.unk0x08")}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormDescription>{t("series.help.unk0x08")}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button type="submit" disabled={!editable || !form.formState.isDirty} className="w-full mt-4">
                  {t("series.saveChanges")}
                </Button>
              </fieldset>
            </ScrollArea>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}

