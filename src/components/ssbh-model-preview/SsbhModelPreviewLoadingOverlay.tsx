import { useEffect, useRef, useState } from "react";
import { Check, Circle, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { SsbhModelPreviewTextureDecodeProgress } from "./SsbhModelPreviewContext";

type SsbhModelPreviewLoadingOverlayProps = {
  readingBundle: boolean;
  textureDecode: SsbhModelPreviewTextureDecodeProgress | null;
};

// Simulated loading steps for the single backend call
const BUNDLE_STEPS = ["Model", "Material", "Skeleton", "Mesh", "Helper"] as const;
const STEP_INTERVAL_MS = 300;

type StepStatus = "pending" | "active" | "done";

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done") return <Check className="h-3.5 w-3.5 text-green-500" />;
  if (status === "active") return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
  return <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />;
}

export function SsbhModelPreviewLoadingOverlay({
  readingBundle,
  textureDecode,
}: SsbhModelPreviewLoadingOverlayProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animate through bundle steps while readingBundle is true
  useEffect(() => {
    if (readingBundle) {
      setActiveIndex(0);
      timerRef.current = setInterval(() => {
        setActiveIndex((prev) => (prev < BUNDLE_STEPS.length - 1 ? prev + 1 : prev));
      }, STEP_INTERVAL_MS);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [readingBundle]);

  const pct =
    textureDecode && textureDecode.total > 0
      ? Math.min(100, Math.round((textureDecode.done / textureDecode.total) * 100))
      : 0;

  // Determine status for each bundle step
  const getStepStatus = (i: number): StepStatus => {
    if (!readingBundle) return "done";
    if (i < activeIndex) return "done";
    if (i === activeIndex) return "active";
    return "pending";
  };

  // Determine texture step status
  const getTextureStatus = (): StepStatus => {
    if (!textureDecode) return readingBundle ? "pending" : "done";
    if (pct >= 100) return "done";
    return "active";
  };

  if (!readingBundle && !textureDecode) return null;

  // Texture-only phase: show compact corner overlay (non-blocking)
  if (!readingBundle && textureDecode) {
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
          <p className="truncate text-[10px] text-muted-foreground" title={textureDecode.currentLabel ?? undefined}>
            {textureDecode.currentLabel ?? "Preparing…"}
          </p>
          <Progress value={pct} className="h-1" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/55 backdrop-blur-[2px]"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="pointer-events-auto mx-4 w-full max-w-sm rounded-lg border border-border/80 bg-background/90 px-4 py-3 shadow-lg">
        {/* Step list */}
        <ul className="flex flex-col gap-1.5">
          {BUNDLE_STEPS.map((label, i) => {
            const status = getStepStatus(i);
            return (
              <li key={label} className="flex items-center gap-2.5">
                <StepIcon status={status} />
                <span
                  className={`text-xs ${status === "pending" ? "text-muted-foreground/60" : "text-foreground"}`}
                >
                  {label}
                </span>
              </li>
            );
          })}
          {/* Textures step */}
          <li className="flex items-center gap-2.5">
            <StepIcon status={getTextureStatus()} />
            <span
              className={`text-xs ${getTextureStatus() === "pending" ? "text-muted-foreground/60" : "text-foreground"}`}
            >
              Textures
              {textureDecode && getTextureStatus() === "active" && (
                <span className="ml-1.5 tabular-nums text-[10px] text-muted-foreground">
                  {textureDecode.done}/{textureDecode.total}
                </span>
              )}
            </span>
          </li>
        </ul>

        {/* Texture decode progress bar */}
        {textureDecode && getTextureStatus() === "active" && (
          <div className="mt-2.5 flex flex-col gap-1">
            <Progress value={pct} className="h-1" />
            <p className="truncate text-[10px] text-muted-foreground">
              {textureDecode.currentLabel ?? "Preparing…"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
