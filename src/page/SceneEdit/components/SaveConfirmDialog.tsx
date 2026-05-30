import type { ReactNode } from "react";
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
import { FolderMinus, FolderPlus, FolderPen, Info } from "lucide-react";
import type { SaveChangePreview } from "../utils/sceneSaveConfirm";
import { buildSavePipelineNotes } from "../utils/sceneSaveConfirm";

interface SaveConfirmDialogProps {
  open: boolean;
  preview: SaveChangePreview | null;
  stageRoot: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function ChangeSection({
  title,
  icon,
  toneClass,
  items,
}: {
  title: string;
  icon: ReactNode;
  toneClass: string;
  items: string[];
}) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className={`flex items-center gap-2 text-sm font-medium ${toneClass}`}>
        {icon}
        {title}
      </div>
      <ul className="ml-6 space-y-1 text-sm text-muted-foreground list-disc">
        {items.map((item) => (
          <li key={item} className="break-all">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SaveConfirmDialog({
  open,
  preview,
  stageRoot,
  onConfirm,
  onCancel,
}: SaveConfirmDialogProps) {
  if (!preview) return null;

  const pipelineNotes = buildSavePipelineNotes(preview);
  const modifiedItems = preview.modified.map(
    (item) => `${item.folderName} (${item.fields.join(", ")})`,
  );

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-lg" showCloseButton onCloseClick={onCancel}>
        <AlertDialogHeader>
          <AlertDialogTitle>Save changes to folder?</AlertDialogTitle>
          <AlertDialogDescription>
            The following pending edits will be written to{" "}
            <span className="font-medium text-foreground break-all">{stageRoot ?? "the stage folder"}</span>.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ScrollArea className="max-h-64 rounded border p-3">
          <div className="space-y-4 pr-2">
            <ChangeSection
              title={`Add ${preview.added.length} object${preview.added.length !== 1 ? "s" : ""}`}
              icon={<FolderPlus className="h-4 w-4 shrink-0" />}
              toneClass="text-green-600 dark:text-green-400"
              items={preview.added}
            />
            <ChangeSection
              title={`Update ${preview.modified.length} object${preview.modified.length !== 1 ? "s" : ""}`}
              icon={<FolderPen className="h-4 w-4 shrink-0" />}
              toneClass="text-amber-600 dark:text-amber-400"
              items={modifiedItems}
            />
            <ChangeSection
              title={`Delete ${preview.deleted.length} object${preview.deleted.length !== 1 ? "s" : ""}`}
              icon={<FolderMinus className="h-4 w-4 shrink-0" />}
              toneClass="text-destructive"
              items={preview.deleted}
            />
            <ChangeSection
              title={`Update ${preview.globalChanges.length} scene file${preview.globalChanges.length !== 1 ? "s" : ""}`}
              icon={<Info className="h-4 w-4 shrink-0" />}
              toneClass="text-blue-600 dark:text-blue-400"
              items={preview.globalChanges}
            />
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Info className="h-4 w-4 shrink-0" />
                Save pipeline will also
              </div>
              <ul className="ml-6 space-y-1 text-sm text-muted-foreground list-disc">
                {pipelineNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          </div>
        </ScrollArea>

        <AlertDialogFooter>
          <AlertDialogCancel type="button" onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction type="button" onClick={onConfirm}>
            Save to Folder
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
