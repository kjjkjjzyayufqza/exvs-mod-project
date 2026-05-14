import { memo } from "react";
import { Activity, Triangle, Cpu } from "lucide-react";
import type { NutexbTextureDataMap } from "../hooks/useSceneTextureLoader";

export interface SceneDrawStats {
  drawCount: number;
  triangleCount: number;
  vertexCount: number;
  subModelCount: number;
}

interface SceneViewportOverlayProps {
  drawStats: SceneDrawStats | null;
  textureProgress: { done: number; total: number; currentLabel?: string } | null;
  textureDataMap: NutexbTextureDataMap;
  showStats: boolean;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export const SceneViewportOverlay = memo(function SceneViewportOverlay({
  drawStats,
  textureProgress,
  textureDataMap,
  showStats,
}: SceneViewportOverlayProps) {
  const textureCount = textureDataMap.size;

  return (
    <>
      {showStats && drawStats && (
        <div className="absolute top-2 left-2 pointer-events-none">
          <div className="bg-black/60 backdrop-blur-sm text-white text-[10px] font-mono px-2.5 py-1.5 rounded-md space-y-0.5 border border-white/10">
            <div className="flex items-center gap-1.5">
              <Triangle className="h-3 w-3 text-emerald-400" />
              <span className="text-white/70">Tris:</span>
              <span className="text-emerald-300">{formatCount(drawStats.triangleCount)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Activity className="h-3 w-3 text-blue-400" />
              <span className="text-white/70">Draws:</span>
              <span className="text-blue-300">{drawStats.drawCount}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Cpu className="h-3 w-3 text-amber-400" />
              <span className="text-white/70">Verts:</span>
              <span className="text-amber-300">{formatCount(drawStats.vertexCount)}</span>
            </div>
            {textureCount > 0 && (
              <div className="flex items-center gap-1.5 pt-0.5 border-t border-white/10">
                <span className="text-white/70">Tex:</span>
                <span className="text-purple-300">{textureCount}</span>
              </div>
            )}
            {drawStats.subModelCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-white/70">Objects:</span>
                <span className="text-orange-300">{drawStats.subModelCount}</span>
              </div>
            )}
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
