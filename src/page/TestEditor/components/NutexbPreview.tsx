import { useEffect, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { dirname, join } from "@tauri-apps/api/path";
import { ImageOff, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

type NutexbInfo = {
  name: string;
  width: number;
  height: number;
  depth: number;
  imageFormat: string;
  mipmapCount: number;
  layerCount: number;
  dataSize: number;
  isSwizzled: boolean;
};

type NutexbPreviewProps = {
  path: string;
};

/** Mirrors Rust's sanitize_file_name to derive the correct output PNG filename. */
function sanitizeFileName(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "texture";
  return trimmed.replace(/[\\/:*?"<>|]/g, "_");
}

export function NutexbPreview({ path }: NutexbPreviewProps) {
  const { t } = useTranslation("test-lists");
  const [isLoading, setIsLoading] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [imgKey, setImgKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<NutexbInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setIsLoading(true);
      setPreviewSrc(null);
      setError(null);
      setInfo(null);

      try {
        const nutexbInfo = await invoke<NutexbInfo>("nutexb_read_info", { inputPath: path });
        if (cancelled) return;
        setInfo(nutexbInfo);

        const dir = await dirname(path);
        const safeName = sanitizeFileName(nutexbInfo.name);
        const outputPath = await join(dir, "__convert", `${safeName}.png`);

        await invoke("nutexb_export_png", { inputPath: path, outputPath });
        if (cancelled) return;

        setPreviewSrc(convertFileSrc(outputPath));
        setImgKey((k) => k + 1);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-xs">{t("nutexb.converting")}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-destructive">
        <ImageOff className="h-5 w-5" />
        <span className="break-all text-center text-xs">{error}</span>
      </div>
    );
  }

  if (!previewSrc || !info) return null;

  return (
    <div className="flex flex-col gap-3">
      <img
        key={imgKey}
        src={previewSrc}
        alt={info.name}
        className="w-full rounded border object-contain"
      />
      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="shrink-0 text-muted-foreground">{t("nutexb.texture")}</span>
          <span className="truncate text-right" title={info.name} data-i18n-ignore="">
            {info.name}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t("nutexb.size")}</span>
          <span data-i18n-ignore="">
            {info.width} × {info.height}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="shrink-0 text-muted-foreground">{t("nutexb.format")}</span>
          <span className="truncate text-right" title={info.imageFormat} data-i18n-ignore="">
            {info.imageFormat}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t("nutexb.mipmaps")}</span>
          <span data-i18n-ignore="">{info.mipmapCount}</span>
        </div>
      </div>
    </div>
  );
}
