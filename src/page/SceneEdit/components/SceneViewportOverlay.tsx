import { memo } from "react";
import { useTranslation } from "react-i18next";

interface SceneViewportOverlayProps {
  isLoading?: boolean;
  modelLoadProgress: { loaded: number; total: number } | null;
  textureProgress: { done: number; total: number; currentLabel?: string } | null;
  hktLoadProgress: { loaded: number; total: number } | null;
}

export interface SceneDrawStats {
  drawCount: number;
  triangleCount: number;
  vertexCount: number;
  subModelCount: number;
}

export const SceneViewportOverlay = memo(function SceneViewportOverlay({
  isLoading,
  modelLoadProgress,
  textureProgress,
  hktLoadProgress,
}: SceneViewportOverlayProps) {
  const { t } = useTranslation("scene-root-b");
  const hktPercent =
    hktLoadProgress && hktLoadProgress.total > 0
      ? Math.round((hktLoadProgress.loaded / hktLoadProgress.total) * 100)
      : 0;
  return (
    <>
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-[3px] border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
            <span className="text-sm text-muted-foreground font-medium">
              {modelLoadProgress
                ? t("overlay.streamingModels", modelLoadProgress)
                : t("overlay.loadingStage")}
            </span>
            {modelLoadProgress && modelLoadProgress.total > 0 && (
              <div className="w-48 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${(modelLoadProgress.loaded / modelLoadProgress.total) * 100}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}
      {(hktLoadProgress || textureProgress) && (
        <div className="absolute bottom-3 left-3 right-3 z-[60] flex flex-col gap-2 pointer-events-none">
          {hktLoadProgress && hktLoadProgress.total > 0 && (
            <div className="bg-black/75 backdrop-blur-sm text-white text-xs px-3 py-2 rounded-lg flex items-center gap-2.5 border border-emerald-400/20">
              <div className="w-3 h-3 border-2 border-emerald-400/40 border-t-emerald-400 rounded-full animate-spin shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="truncate">
                    {t("overlay.loadingCollision", hktLoadProgress)}
                  </span>
                  <span className="text-white/60 ml-2 shrink-0">{hktPercent}%</span>
                </div>
              </div>
              <div className="w-16 h-1 bg-white/20 rounded-full overflow-hidden shrink-0">
                <div
                  className="h-full bg-emerald-400 rounded-full transition-all duration-300"
                  style={{ width: `${hktPercent}%` }}
                />
              </div>
            </div>
          )}
          {textureProgress && (
            <div className="bg-black/75 backdrop-blur-sm text-white text-xs px-3 py-2 rounded-lg flex items-center gap-2.5 border border-white/10">
              <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="truncate">
                    {t("overlay.decodingTextures", textureProgress)}
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
          )}
        </div>
      )}
    </>
  );
});
