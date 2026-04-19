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
  const pct =
    textureDecode && textureDecode.total > 0
      ? Math.min(100, Math.round((textureDecode.done / textureDecode.total) * 100))
      : 0;

  if (readingBundle) {
    return (
      <div
        className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/55 backdrop-blur-[2px]"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="pointer-events-auto mx-4 w-full max-w-sm rounded-lg border border-border/80 bg-background/90 px-4 py-3 shadow-lg">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Loading model</p>
              <p className="text-[11px] text-muted-foreground">Reading .numdlb, mesh, materials…</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!textureDecode) return null;

  return (
    <div
      className="pointer-events-none absolute bottom-2 right-2 z-10 max-w-[min(100%,280px)] rounded-md border border-border/70 bg-background/85 px-2.5 py-2 shadow-md backdrop-blur-sm"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
          <p className="text-[11px] font-medium text-foreground leading-tight">Decoding textures</p>
          <span className="ml-auto shrink-0 tabular-nums text-[10px] text-muted-foreground">
            {textureDecode.done}/{textureDecode.total}
          </span>
        </div>
        <p
          className="truncate text-[10px] text-muted-foreground"
          title={textureDecode.currentLabel ?? undefined}
        >
          {textureDecode.currentLabel ?? "Preparing…"}
        </p>
        <Progress value={pct} className="h-1" />
        <p className="text-[9px] leading-snug text-muted-foreground">
          Preview stays interactive. Disable unused slots in Material Debug to finish faster.
        </p>
      </div>
    </div>
  );
}
