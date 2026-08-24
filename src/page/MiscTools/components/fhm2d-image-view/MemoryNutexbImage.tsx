import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  getMemoryNutexbPngBytes,
  getMemoryNutexbRgbaBytes,
} from "@/components/ssbh-model-preview/fhm2dMemoryPreviewService";
import { parseRgbaResponse } from "@/components/ssbh-model-preview/nutexbPreviewCache";
import { cn } from "@/lib/utils";
import { pngBytesToObjectUrl, withImageDecodeSlot } from "./fhm2dImageViewModel";

export function MemoryNutexbImage({
  sessionId,
  virtualPath,
  mode,
  className,
}: {
  sessionId: string;
  virtualPath: string;
  mode: "thumb" | "full";
  className?: string;
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
          const raw = await getMemoryNutexbRgbaBytes({
            sessionId,
            virtualPath,
            maxDimension: 128,
          });
          if (cancelled) return;
          const parsed = parseRgbaResponse(raw);
          const canvas = canvasRef.current;
          if (!canvas) return;
          canvas.width = parsed.width;
          canvas.height = parsed.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            throw new Error("Canvas 2D context is unavailable");
          }
          const pixels = new Uint8ClampedArray(parsed.rgba.byteLength);
          pixels.set(parsed.rgba);
          const imageData = new ImageData(pixels, parsed.width, parsed.height);
          ctx.putImageData(imageData, 0, 0);
        } else {
          const raw = await getMemoryNutexbPngBytes({ sessionId, virtualPath });
          if (cancelled) return;
          objectUrl = pngBytesToObjectUrl(raw);
          setPngUrl(objectUrl);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mode, sessionId, virtualPath]);

  return (
    <div className={cn("relative flex h-full w-full items-center justify-center bg-black/80", className)}>
      {mode === "thumb" ? (
        <canvas ref={canvasRef} className="max-h-full max-w-full object-contain" />
      ) : pngUrl ? (
        <img src={pngUrl} alt="" className="max-h-full max-w-full object-contain" />
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
