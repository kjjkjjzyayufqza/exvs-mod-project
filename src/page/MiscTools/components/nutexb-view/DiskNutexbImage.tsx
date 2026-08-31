import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";

import { parseRgbaResponse } from "@/components/ssbh-model-preview/nutexbPreviewCache";
import { cn } from "@/lib/utils";
import { pngBytesToObjectUrl, withImageDecodeSlot } from "../fhm2d-image-view/fhm2dImageViewModel";

export function DiskNutexbImage({
  path,
  mode,
  className,
  maxDimension = 128,
}: {
  path: string;
  mode: "thumb" | "full";
  className?: string;
  maxDimension?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pngUrl, setPngUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setPngUrl(null);

    void withImageDecodeSlot(async () => {
      try {
        if (mode === "thumb") {
          const raw = await invoke<ArrayBuffer | Uint8Array>("nutexb_rgba_bytes", {
            inputPath: path,
            maxDimension,
          });
          if (cancelled) return;
          const parsed = parseRgbaResponse(raw);
          const canvas = canvasRef.current;
          if (!canvas) return;
          canvas.width = parsed.width;
          canvas.height = parsed.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas 2D context is unavailable");
          const pixels = new Uint8ClampedArray(parsed.rgba.byteLength);
          pixels.set(parsed.rgba);
          ctx.putImageData(new ImageData(pixels, parsed.width, parsed.height), 0, 0);
        } else {
          const raw = await invoke<ArrayBuffer | Uint8Array>("nutexb_png_bytes", { inputPath: path });
          if (cancelled) return;
          objectUrl = pngBytesToObjectUrl(raw);
          setPngUrl(objectUrl);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [maxDimension, mode, path]);

  return (
    <div className={cn("relative h-full w-full overflow-hidden bg-black/80", className)}>
      {mode === "thumb" ? (
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        />
      ) : pngUrl ? (
        <img src={pngUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
      ) : null}
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-x-1 bottom-1 line-clamp-2 text-[10px] text-destructive">{error}</div>
      ) : null}
    </div>
  );
}
