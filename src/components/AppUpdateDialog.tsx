import { Download, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";

const UPDATE_DIALOG_DIMENSIONS = {
  width: 560,
  height: 480,
  minWidth: 420,
  minHeight: 360,
};

type AppUpdateDialogProps = {
  currentVersion: string;
  latestVersion: string;
  changelog: string;
  installing: boolean;
  progressPercent: number | null;
  errorMessage: string | null;
  onSkip: () => void;
  onUpdate: () => void;
};

export function AppUpdateDialog({
  currentVersion,
  latestVersion,
  changelog,
  installing,
  progressPercent,
  errorMessage,
  onSkip,
  onUpdate,
}: AppUpdateDialogProps) {
  const { t } = useTranslation("shared");
  const notes = changelog.trim();

  return (
    <AppRndModalShell
      titleId="app-update-dialog-title"
      title={t("updater.title")}
      subtitle={t("updater.subtitle", { version: latestVersion })}
      headerIcon={<Download className="h-5 w-5 text-primary" />}
      dimensions={UPDATE_DIALOG_DIMENSIONS}
      storageKey="app.rnd-size.app-update"
      onClose={onSkip}
      closeDisabled={installing}
      resizable
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2 bg-background px-6 py-4">
          <Button type="button" variant="outline" onClick={onSkip} disabled={installing}>
            {t("updater.skip")}
          </Button>
          <Button type="button" onClick={onUpdate} disabled={installing}>
            {installing ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                {progressPercent == null
                  ? t("updater.installing")
                  : t("updater.progress", { percent: progressPercent })}
              </>
            ) : (
              t("updater.update")
            )}
          </Button>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
        <p className="text-sm text-muted-foreground">
          {t("updater.current", { version: currentVersion })}
        </p>
        <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("updater.changelog")}
          </p>
          <pre className="whitespace-pre-wrap wrap-break-word font-sans text-sm">
            {notes || t("updater.emptyNotes")}
          </pre>
        </div>
        {errorMessage ? (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </AppRndModalShell>
  );
}
