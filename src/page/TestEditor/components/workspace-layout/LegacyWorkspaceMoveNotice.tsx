import { useCallback, useState } from "react";
import { FolderInput } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  resolveWorkspaceContent,
  type WorkspaceContentId,
} from "@/services/testEditorWorkspace/contentCatalog";
import { moveLegacyWorkspaceContentToConfigured } from "@/services/testEditorWorkspace/legacyMigration";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";

interface LegacyWorkspaceMoveNoticeProps {
  workspaceRoot: string;
  workspaceDocument: TestEditorWorkspaceDocument;
  contentId: WorkspaceContentId;
  sourceLayout: "configured" | "legacy" | "missing";
  configuredPath: string;
  onMoved: () => void | Promise<void>;
  className?: string;
}

function formatCaughtError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function LegacyWorkspaceMoveNotice({
  workspaceRoot,
  workspaceDocument,
  contentId,
  sourceLayout,
  configuredPath,
  onMoved,
  className = "",
}: LegacyWorkspaceMoveNoticeProps) {
  const [isMoving, setIsMoving] = useState(false);

  const handleMove = useCallback(async () => {
    if (isMoving || sourceLayout !== "legacy") return;

    setIsMoving(true);
    try {
      const content = await resolveWorkspaceContent(
        workspaceRoot,
        workspaceDocument,
        contentId,
      );
      const result = await moveLegacyWorkspaceContentToConfigured(content);
      toast.success(`Moved ${content.descriptor.label} to the configured workspace route`, {
        description: result.configuredFolderPath,
      });
      await onMoved();
    } catch (error) {
      console.error(`Failed to move legacy workspace content "${contentId}":`, error);
      toast.error(`Failed to move legacy content: ${formatCaughtError(error)}`);
    } finally {
      setIsMoving(false);
    }
  }, [
    contentId,
    isMoving,
    onMoved,
    sourceLayout,
    workspaceDocument,
    workspaceRoot,
  ]);

  if (sourceLayout !== "legacy") {
    return null;
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300 ${className}`}
    >
      <span className="min-w-0 flex-1">
        Legacy flat workspace content is read-only. Writes target{" "}
        <span className="font-mono break-all">{configuredPath}</span>.
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 shrink-0 gap-1.5 border-amber-500/40 bg-background/70 px-2 text-xs"
        onClick={() => void handleMove()}
        disabled={isMoving}
        title="Move legacy pack folder and structure JSON to the configured route"
      >
        <FolderInput className="h-3.5 w-3.5" />
        {isMoving ? "Moving..." : "Move to New"}
      </Button>
    </div>
  );
}
