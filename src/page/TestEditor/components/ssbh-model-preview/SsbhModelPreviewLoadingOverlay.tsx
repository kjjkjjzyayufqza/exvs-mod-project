import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { SsbhModelPreviewTextureDecodeProgress } from "./SsbhModelPreviewContext";

type SsbhModelPreviewLoadingOverlayProps = {
  readingBundle: boolean;
  textureDecode: SsbhModelPreviewTextureDecodeProgress | null;
};

export function SsbhModelPreviewLoadingOverlay({
  readingBundle,
  textureDecode,
}: SsbhModelPreviewLoadingOverlayProps) {
  if (!readingBundle && !textureDecode) return null;

  const pct =
    textureDecode && textureDecode.total > 0
      ? Math.min(100, Math.round((textureDecode.done / textureDecode.total) * 100))
      : 0;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/55 backdrop-blur-[2px]"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="pointer-events-auto mx-4 w-full max-w-sm rounded-lg border border-border/80 bg-background/90 px-4 py-3 shadow-lg">
        {readingBundle ? (
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Loading model</p>
              <p className="text-[11px] text-muted-foreground">Reading .numdlb, mesh, materials…</p>
            </div>
          </div>
        ) : textureDecode ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">Decoding textures</p>
                <p className="truncate text-[11px] text-muted-foreground" title={textureDecode.currentLabel ?? undefined}>
                  {textureDecode.currentLabel ?? "Preparing…"}
                </p>
              </div>
              <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                {textureDecode.done}/{textureDecode.total}
              </span>
            </div>
            <Progress value={pct} className="h-1.5" />
            <p className="text-[10px] leading-snug text-muted-foreground">
              Each .nutexb is decoded to PNG in memory for Three.js. Large models may take a while — disable
              unused slots in Material Debug to speed up.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
