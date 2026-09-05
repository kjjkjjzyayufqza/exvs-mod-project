import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
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
import { FolderMinus, FolderPlus, FolderPen, FolderSync, Info } from "lucide-react";
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
  const { t } = useTranslation("scene-placement");
  if (!preview) return null;

  const pipelineNotes = buildSavePipelineNotes(preview);
  const modifiedItems = preview.modified.map(
    (item) => `${item.folderName} (${item.fields.join(", ")})`,
  );
  const replacedItems = preview.replaced.map((folderName) => `${folderName} model`);

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-lg" showCloseButton onCloseClick={onCancel}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("save.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("save.description", { stageRoot: stageRoot ?? t("save.stageFolder") })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ScrollArea className="max-h-64 rounded border p-3">
          <div className="space-y-4 pr-2">
            <ChangeSection
              title={t("save.addObjects", { count: preview.added.length })}
              icon={<FolderPlus className="h-4 w-4 shrink-0" />}
              toneClass="text-green-600 dark:text-green-400"
              items={preview.added}
            />
            <ChangeSection
              title={t("save.updateObjects", { count: preview.modified.length })}
              icon={<FolderPen className="h-4 w-4 shrink-0" />}
              toneClass="text-amber-600 dark:text-amber-400"
              items={modifiedItems}
            />
            <ChangeSection
              title={t("save.deleteObjects", { count: preview.deleted.length })}
              icon={<FolderMinus className="h-4 w-4 shrink-0" />}
              toneClass="text-destructive"
              items={preview.deleted}
            />
            <ChangeSection
              title={t("save.replaceModels", { count: preview.replaced.length })}
              icon={<FolderSync className="h-4 w-4 shrink-0" />}
              toneClass="text-blue-600 dark:text-blue-400"
              items={replacedItems}
            />
            <ChangeSection
              title={t("save.updateSceneFiles", { count: preview.globalChanges.length })}
              icon={<Info className="h-4 w-4 shrink-0" />}
              toneClass="text-blue-600 dark:text-blue-400"
              items={preview.globalChanges}
            />
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Info className="h-4 w-4 shrink-0" />
                {t("save.pipelineAlso")}
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
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction type="button" onClick={onConfirm}>
            {t("save.saveToFolder")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
