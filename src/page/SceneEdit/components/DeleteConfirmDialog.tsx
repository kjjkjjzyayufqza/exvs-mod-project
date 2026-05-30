import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Folder, Trash2 } from "lucide-react";
import type { DeleteConfirmation } from "../utils/sceneDeleteConfirm";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface DeleteConfirmMeta {
  placementCount?: number;
  hasHktData?: boolean;
}

interface DeleteConfirmDialogProps {
  open: boolean;
  preview: DeleteConfirmation | null;
  meta?: DeleteConfirmMeta;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog({
  open,
  preview,
  meta,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  if (!preview) return null;

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-lg" showCloseButton onCloseClick={onCancel}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Delete {preview.previews.length} folder{preview.previews.length !== 1 ? "s" : ""}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete {preview.totalFiles} file{preview.totalFiles !== 1 ? "s" : ""}{" "}
            ({formatBytes(preview.totalSizeBytes)}) from disk. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ScrollArea className="max-h-48 rounded border border-destructive/20 p-2">
          <div className="space-y-2">
            {preview.previews.map((p) => (
              <div key={p.folderName} className="flex items-start gap-2 text-sm">
                <Folder className="h-4 w-4 mt-0.5 text-destructive/70 shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium truncate">{p.folderName}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.files.length} file{p.files.length !== 1 ? "s" : ""} &middot; {formatBytes(p.totalSizeBytes)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {(meta?.placementCount != null && meta.placementCount > 0 || meta?.hasHktData) && (
          <div className="text-xs text-muted-foreground space-y-1 px-1">
            {meta?.placementCount != null && meta.placementCount > 0 && (
              <p>{meta.placementCount} placement entry(ies) will also be removed.</p>
            )}
            {meta?.hasHktData && (
              <p>Associated HKT collision data will also be removed.</p>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel type="button" onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            type="button"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            Confirm Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
