import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ImageOff } from "lucide-react";
import { useTranslation } from "react-i18next";

type ImagePreviewProps = {
  path: string;
};

const SUPPORTED_IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".ico",
  ".svg",
];

export function isImageFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function ImagePreview({ path }: ImagePreviewProps) {
  const { t } = useTranslation("test-workspace");
  const [error, setError] = useState(false);

  const previewSrc = convertFileSrc(path);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-destructive">
        <ImageOff className="h-5 w-5" />
        <span className="break-all text-center text-xs">{t("preview.loadFailed")}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <img
        src={previewSrc}
        alt=""
        className="w-full rounded border object-contain max-h-[300px]"
        onError={() => setError(true)}
      />
    </div>
  );
}
