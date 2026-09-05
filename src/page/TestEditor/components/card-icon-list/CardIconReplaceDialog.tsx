import { useCallback, useEffect, useMemo, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { ImageIcon } from "lucide-react";

import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilePathInput } from "@/components/ui/filePathInput";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DDS_FORMATS } from "@/lib/ddsFormats";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { buildCardIconPreviewPath } from "./cardIconUtils";
import { splitPathSegments } from "@/lib/fhm2d_fileUrlUtils";
import type { CardIconItem } from "./cardIconStructure";
import { useTranslation } from "react-i18next";

type ReplaceSummary = {
  outputNutexbPath: string;
  previewPngPath: string;
  nutexbName: string;
};

const CARD_ICON_REPLACE_MODAL_DIMENSIONS = {
  width: 860,
  height: 680,
  minWidth: 700,
  minHeight: 520,
};

interface CardIconReplaceDialogProps {
  folderPath: string;
  convertDirPath: string;
  selectedItem: CardIconItem | null;
  onApplied: () => Promise<void> | void;
  triggerLabel?: string;
  disabled?: boolean;
}

function resolveFullPath(folderPath: string, fileUrl: string): Promise<string> {
  const segments = splitPathSegments(fileUrl);
  if (segments.length === 0) return Promise.resolve("");
  return join(folderPath, ...segments);
}

export function CardIconReplaceDialog({
  folderPath,
  convertDirPath,
  selectedItem,
  onApplied,
  triggerLabel,
  disabled = false,
}: CardIconReplaceDialogProps) {
  const { t } = useTranslation("test-lists");
  const resolvedTriggerLabel = triggerLabel ?? t("cardIcon.editImage");
  const [openState, setOpenState] = useState(false);
  const [pngPath, setPngPath] = useState("");
  const [ddsFormat, setDdsFormat] = useState<string>("BC7RgbaUnormSrgb");
  const [isDetectingFormat, setIsDetectingFormat] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);

  const targetFileUrl = selectedItem?.fileUrl ?? "";
  const canEdit = Boolean(!disabled && folderPath && convertDirPath && targetFileUrl);
  const defaultPreviewPngPath = useMemo(() => {
    if (!selectedItem?.name) return "";
    return buildCardIconPreviewPath(convertDirPath, selectedItem.name) ?? "";
  }, [convertDirPath, selectedItem?.name]);

  const previewSrc = useMemo(() => {
    if (pngPath) return convertFileSrc(pngPath);
    return defaultPreviewPngPath ? convertFileSrc(defaultPreviewPngPath) : null;
  }, [defaultPreviewPngPath, pngPath]);

  const handlePngPicked = useCallback((picked: string | string[]) => {
    if (Array.isArray(picked)) {
      setPngPath(picked[0] ?? "");
      return;
    }
    setPngPath(picked);
  }, []);

  useEffect(() => {
    const detectDdsFormat = async () => {
      if (!openState || !folderPath || !targetFileUrl) return;
      try {
        setIsDetectingFormat(true);
        const nutexbPath = await resolveFullPath(folderPath, targetFileUrl);
        if (!nutexbPath) {
          throw new Error("Failed to resolve nutexb path");
        }
        const detected = await invoke<string>("card_icon_detect_dds_format", { nutexbPath });
        const matched = DDS_FORMATS.find((opt) => opt.value === detected);
        if (!matched) {
          throw new Error(`Unsupported DDS format from nutexb: ${detected}`);
        }
        setDdsFormat(matched.value);
      } catch (error) {
        console.error(error);
        const message =
          error instanceof Error ? error.message : t("cardIcon.detectFormatFailed");
        toast.error(message);
      } finally {
        setIsDetectingFormat(false);
      }
    };
    void detectDdsFormat();
  }, [folderPath, openState, targetFileUrl]);

  const handleApply = useCallback(async () => {
    if (!selectedItem) {
      toast.error(t("cardIcon.selectItem"));
      return;
    }
    if (!folderPath) {
      toast.error(t("cardIcon.folderEmpty"));
      return;
    }
    if (!convertDirPath) {
      toast.error(t("cardIcon.convertMissing"));
      return;
    }
    if (!targetFileUrl) {
      toast.error(t("cardIcon.targetMissing"));
      return;
    }
    const sourcePngPath = pngPath || defaultPreviewPngPath;
    if (!sourcePngPath) {
      toast.error(t("cardIcon.noSourcePng"));
      return;
    }
    if (!(await exists(sourcePngPath))) {
      toast.error(t("cardIcon.sourceMissing"));
      return;
    }

    try {
      setIsReplacing(true);
      const nutexbPath = await resolveFullPath(folderPath, targetFileUrl);
      if (!nutexbPath) {
        toast.error(t("cardIcon.resolveNutexbFailed"));
        return;
      }
      const result = await invoke<ReplaceSummary>("card_icon_replace_from_png_with_dds_format", {
        nutexbPath,
        convertDir: convertDirPath,
        pngPath: sourcePngPath,
        ddsFormat,
      });
      toast.success(t("cardIcon.updated", { name: result.nutexbName }));
      setOpenState(false);
      setPngPath("");
      await onApplied();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : t("cardIcon.replaceFailed");
      toast.error(message);
    } finally {
      setIsReplacing(false);
    }
  }, [
    convertDirPath,
    ddsFormat,
    folderPath,
    onApplied,
    pngPath,
    selectedItem,
    targetFileUrl,
    defaultPreviewPngPath,
    t,
  ]);

  return (
    <>
      <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => setOpenState(true)}>
        {resolvedTriggerLabel}
      </Button>
      {openState ? (
        <AppRndModalShell
          titleId="card-icon-replace-title"
          title={t("cardIcon.replaceTitle")}
          subtitle={t("cardIcon.replaceSubtitle")}
          headerIcon={<ImageIcon className="h-5 w-5 text-primary" />}
          dimensions={CARD_ICON_REPLACE_MODAL_DIMENSIONS}
          storageKey="app.rnd-size.card-icon-replace"
          onClose={() => setOpenState(false)}
          closeDisabled={isReplacing}
        >
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <Label>{t("common.preview")}</Label>
            <Card className="overflow-hidden min-h-[360px]">
              <AspectRatio ratio={1} className="bg-black flex items-center justify-center">
                {previewSrc ? (
                  <img
                    src={previewSrc}
                    alt={t("cardIcon.previewAlt")}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full w-full bg-black">
                    <span className="text-sm text-muted-foreground">{t("common.noPreview")}</span>
                  </div>
                )}
              </AspectRatio>
            </Card>
            <div className="text-xs text-muted-foreground min-h-8 leading-snug">
              {pngPath ? t("cardIcon.previewSelected") : t("cardIcon.previewCurrent")}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("cardIcon.labelTargetNutexb")}</Label>
              <div className="text-xs text-muted-foreground break-all border rounded-md px-3 py-2 min-h-10" data-i18n-ignore="">
                {targetFileUrl || t("cardIcon.noTarget")}
              </div>
              <div className="text-xs text-muted-foreground min-h-8 leading-snug">
                {t("cardIcon.resolvedFrom")}{" "}
                <span className="font-mono" data-i18n-ignore="">
                  SubFileData.fileUrl
                </span>
                .
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("common.ddsFormat")}</Label>
              <Select
                value={ddsFormat}
                onValueChange={setDdsFormat}
                disabled={isReplacing || isDetectingFormat}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("common.selectDdsFormat")} />
                </SelectTrigger>
                <SelectContent>
                  {DDS_FORMATS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground min-h-8 leading-snug">
                {isDetectingFormat
                  ? t("cardIcon.detectingFormat")
                  : t("cardIcon.defaultOriginal")}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="card-icon-replace-png">{t("cardIcon.sourcePngOptional")}</Label>
              <FilePathInput
                id="card-icon-replace-png"
                value={pngPath}
                placeholder={t("common.selectPng")}
                picker={{
                  kind: "file",
                  multiple: false,
                  title: t("common.selectPngTitle"),
                  filters: [{ name: "PNG", extensions: ["png"] }],
                }}
                onPickedValue={handlePngPicked}
                disabled={isReplacing}
              />
              <div className="text-xs text-muted-foreground min-h-8 leading-snug">
                {t("cardIcon.ifEmptyUses")}{" "}
                <span className="font-mono" data-i18n-ignore="">
                  __convert
                </span>{" "}
                {t("cardIcon.previewPng")}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpenState(false)} disabled={isReplacing}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => void handleApply()}
                disabled={isReplacing || isDetectingFormat || !canEdit || (!pngPath && !defaultPreviewPngPath)}
              >
                {isReplacing ? t("common.replacing") : t("common.apply")}
              </Button>
            </div>
          </div>
            </div>
          </div>
        </AppRndModalShell>
      ) : null}
    </>
  );
}
