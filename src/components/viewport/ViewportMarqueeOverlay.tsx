import type { ScreenRect } from "./viewportInteraction";

interface ViewportMarqueeOverlayProps {
  rect: ScreenRect | null;
}

export function ViewportMarqueeOverlay({ rect }: ViewportMarqueeOverlayProps) {
  if (!rect) return null;

  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  if (width <= 0 && height <= 0) return null;

  return (
    <div
      className="pointer-events-none absolute z-20 border border-orange-400/90 bg-orange-400/10"
      style={{
        left: rect.left,
        top: rect.top,
        width,
        height,
      }}
    />
  );
}
