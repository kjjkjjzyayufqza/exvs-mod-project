import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useSceneEditorStore } from "../../store/sceneEditorStore";

interface CollisionListPanelProps {
  sourceIds: string[];
}

function folderLabel(sourceId: string): string {
  const normalized = sourceId.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[0] || sourceId;
}

export function CollisionListPanel({ sourceIds }: CollisionListPanelProps) {
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
                <span className="truncate">{folder}</span>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
