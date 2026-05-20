import { memo } from "react";

interface SceneViewportOverlayProps {
  isLoading?: boolean;
  textureProgress: { done: number; total: number; currentLabel?: string } | null;
}

export interface SceneDrawStats {
  drawCount: number;
  triangleCount: number;
  vertexCount: number;
  subModelCount: number;
}

export const SceneViewportOverlay = memo(function SceneViewportOverlay({
  isLoading,
  textureProgress,
}: SceneViewportOverlayProps) {
  return (
    <>
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-[3px] border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
            <span className="text-sm text-muted-foreground font-medium">Loading stage bundle...</span>
          </div>
        </div>
      )}
      {textureProgress && (
        <div className="absolute bottom-3 left-3 right-3 pointer-events-none">
          <div className="bg-black/75 backdrop-blur-sm text-white text-xs px-3 py-2 rounded-lg flex items-center gap-2.5 border border-white/10">
            <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="truncate">
                  Decoding textures ({textureProgress.done}/{textureProgress.total})
                </span>
                <span className="text-white/60 ml-2 shrink-0">
                  {Math.round((textureProgress.done / textureProgress.total) * 100)}%
                </span>
              </div>
              {textureProgress.currentLabel && (
                <div className="text-[10px] text-white/50 truncate mt-0.5">
                  {textureProgress.currentLabel}
                </div>
              )}
            </div>
            <div className="w-16 h-1 bg-white/20 rounded-full overflow-hidden shrink-0">
              <div
                className="h-full bg-blue-400 rounded-full transition-all duration-300"
                style={{ width: `${(textureProgress.done / textureProgress.total) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
});
