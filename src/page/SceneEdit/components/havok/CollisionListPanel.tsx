import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { HavokMeshData } from "@/utils/havokXmlParser";
import { useSceneEditorStore } from "../../store/sceneEditorStore";
import { countHavokCollisionTriangles, formatTriangleCount } from "../../utils/hktSimplifyUtils";

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
  const collisionVisibility = useSceneEditorStore((s) => s.collisionVisibility);
  const toggleCollisionVisibility = useSceneEditorStore((s) => s.toggleCollisionVisibility);
  const setAllCollisionVisibility = useSceneEditorStore((s) => s.setAllCollisionVisibility);

  if (sourceIds.length === 0) return null;

  const allVisible = sourceIds.every((id) => collisionVisibility[folderLabel(id)] !== false);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Collision ({sourceIds.length})
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={() => setAllCollisionVisibility(!allVisible)}
          title={allVisible ? "Hide All" : "Show All"}
        >
          {allVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
        </Button>
      </div>
      <ScrollArea className="max-h-[200px]">
        <div className="flex flex-col">
          {sourceIds.map((sourceId) => {
            const folder = folderLabel(sourceId);
            const visible = collisionVisibility[folder] !== false;
            const meshData = meshDataMap?.get(sourceId);
            const triCount = meshData ? countHavokCollisionTriangles(meshData) : null;
            return (
              <button
                key={sourceId}
                type="button"
                className={cn(
                  "flex items-center gap-1.5 px-1.5 py-0.5 text-[11px] rounded hover:bg-accent/40 text-left",
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
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
