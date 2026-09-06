import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { formatCameraHash } from "./cameraTableDocument";

export type CameraClipScopeAction = "copy" | "clone" | "remove";
export type CameraClipScopeChoice = "shot" | "clip";

type CameraClipScopeDialogProps = {
  open: boolean;
  action: CameraClipScopeAction | null;
  clipHash: number;
  entryId: number;
  shotIndex: number;
  shotCount: number;
  sortKeyStart: number;
  sortKeyEnd: number;
  onOpenChange: (open: boolean) => void;
  onChoose: (scope: CameraClipScopeChoice) => void;
};

export function CameraClipScopeDialog({
  open,
  action,
  clipHash,
  entryId,
  shotIndex,
  shotCount,
  sortKeyStart,
  sortKeyEnd,
  onOpenChange,
  onChoose,
}: CameraClipScopeDialogProps) {
  const { t } = useTranslation("test-lists");
  if (!action) return null;

  const choiceClass =
    "w-full rounded-md border px-3 py-2.5 text-left transition-[background-color,border-color,transform] duration-150 hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.99]";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md" showCloseButton onCloseClick={() => onOpenChange(false)}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(`cameraTable.scope.${action}.title`)}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-1 font-mono text-[11px] tabular-nums">
            <span className="block text-pretty">
              {t("cameraTable.scope.shotMeta", {
                n: shotIndex + 1,
                count: shotCount,
                id: formatCameraHash(entryId),
              })}
            </span>
            <span className="block text-pretty">
              {t("cameraTable.scope.clipMeta", {
                hash: formatCameraHash(clipHash),
                count: shotCount,
                start: sortKeyStart,
                end: sortKeyEnd,
              })}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2">
          <button type="button" className={choiceClass} onClick={() => onChoose("shot")}>
            <div className="text-sm font-medium">{t(`cameraTable.scope.${action}.shot`)}</div>
            <p className="mt-0.5 text-[11px] text-pretty text-muted-foreground">
              {t(`cameraTable.scope.${action}.shotHint`)}
            </p>
          </button>
          <button
            type="button"
            className={cn(choiceClass, action === "remove" && "border-destructive/40 hover:bg-destructive/10")}
            onClick={() => onChoose("clip")}
          >
            <div className={cn("text-sm font-medium", action === "remove" && "text-destructive")}>
              {t(`cameraTable.scope.${action}.clip`)}
            </div>
            <p className="mt-0.5 text-[11px] text-pretty text-muted-foreground">
              {t(`cameraTable.scope.${action}.clipHint`, { count: shotCount })}
            </p>
          </button>
        </div>
        {action === "remove" ? (
          <p className="text-[11px] text-pretty text-muted-foreground">{t("cameraTable.scope.remove.warn")}</p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel type="button">{t("cameraTable.scope.cancel")}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
