import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HavokMeshData } from "@/utils/havokXmlParser";
import { useSceneEditorStore } from "../../store/sceneEditorStore";
import { countHavokCollisionTriangles, formatTriangleCount } from "../../utils/hktSimplifyUtils";
import { VirtualizedList } from "../VirtualizedList";

/** py-0.5 + text-[11px] row with h-3 icon */
const COLLISION_ROW_HEIGHT = 22;

interface CollisionMeta {
  displayName: string;
  objectNodeId: string | null;
}

interface CollisionListPanelProps {
  sourceIds: string[];
  meshDataMap?: Map<string, HavokMeshData>;
  metaMap?: Map<string, CollisionMeta>;
}

function folderLabel(sourceId: string): string {
  const normalized = sourceId.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[0] || sourceId;
}

function labelForSource(sourceId: string, meta?: CollisionMeta): string {
  if (meta?.displayName) return meta.displayName;
  const normalized = sourceId.replace(/\\/g, "/");
  const parts = normalized.split("/");
  if (parts.length >= 2) {
    return parts[parts.length - 1]?.replace(/\.hkt$/i, "") ?? folderLabel(sourceId);
  }
  return sourceId;
}

export function CollisionListPanel({ sourceIds, meshDataMap, metaMap }: CollisionListPanelProps) {
  const { t } = useTranslation("scene-page");
  const collisionVisibility = useSceneEditorStore((s) => s.collisionVisibility);
  const toggleCollisionVisibility = useSceneEditorStore((s) => s.toggleCollisionVisibility);
  const setAllCollisionVisibility = useSceneEditorStore((s) => s.setAllCollisionVisibility);

  if (sourceIds.length === 0) return null;

  const allVisible = sourceIds.every((id) => collisionVisibility[folderLabel(id)] !== false);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("labels.collisionCount", { count: sourceIds.length })}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={() => setAllCollisionVisibility(!allVisible)}
          title={allVisible ? t("labels.hideAll") : t("labels.showAll")}
        >
          {allVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
        </Button>
      </div>
      <VirtualizedList
        items={sourceIds}
        rowHeight={COLLISION_ROW_HEIGHT}
        getItemKey={(sourceId) => sourceId}
        className="max-h-[200px] overflow-y-auto"
        emptyState={
          <p className="px-1.5 py-2 text-[10px] text-muted-foreground">{t("labels.noCollisionSources")}</p>
        }
        renderRow={(sourceId) => {
          const folder = folderLabel(sourceId);
          const visible = collisionVisibility[folder] !== false;
          const meshData = meshDataMap?.get(sourceId);
          const triCount = meshData ? countHavokCollisionTriangles(meshData) : null;
          return (
            <button
              type="button"
              className={cn(
                "flex h-full w-full items-center gap-1.5 px-1.5 py-0.5 text-[11px] rounded hover:bg-accent/40 text-left",
                !visible && "opacity-40",
              )}
              onClick={() => toggleCollisionVisibility(folder)}
            >
              {visible ? (
                <Eye className="h-3 w-3 shrink-0 text-green-400" />
              ) : (
                <EyeOff className="h-3 w-3 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate">{labelForSource(sourceId, metaMap?.get(sourceId))}</span>
              {triCount != null ? (
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {formatTriangleCount(triCount)}
                </span>
              ) : null}
            </button>
          );
        }}
      />
    </div>
  );
}
