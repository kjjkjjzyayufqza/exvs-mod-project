import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TextureRefResolve } from "@/page/TestEditor/components/ssbh-model-preview/types";

type TexturesReadonlyTabProps = {
  textureResolve: TextureRefResolve[];
  resolvedPaths: string[];
};

function filenameFromPath(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? path;
}

export function TexturesReadonlyTab({ textureResolve, resolvedPaths }: TexturesReadonlyTabProps) {
  if (textureResolve.length === 0 && resolvedPaths.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        No texture references found
      </div>
    );
  }

  const resolvedCount = textureResolve.filter((t) => t.nutexbPath !== null).length;
  const missingCount = textureResolve.length - resolvedCount;

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground border-b pb-2">
        <span>References: {textureResolve.length}</span>
        <span className="text-green-600">Resolved: {resolvedCount}</span>
        {missingCount > 0 && (
          <span className="text-destructive">Missing: {missingCount}</span>
        )}
      </div>
      <div className="overflow-auto max-h-[500px] space-y-0.5">
        {textureResolve.map((entry, i) => {
          const resolved = entry.nutexbPath !== null;
          return (
            <div
              key={i}
              className={cn(
                "flex items-center gap-2 rounded px-2 py-1 text-xs",
                resolved ? "hover:bg-muted/30" : "bg-destructive/5",
              )}
            >
              {resolved ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
              ) : (
                <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
              )}
              <span className="font-mono truncate">{entry.reference}</span>
              {resolved && entry.nutexbPath && (
                <span className="ml-auto text-[10px] text-muted-foreground truncate max-w-[200px]">
                  {filenameFromPath(entry.nutexbPath)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
