import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle2, Loader2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const STAGE_IMPORT_PROGRESS_DIMENSIONS = {
  width: 520,
  height: 480,
  minWidth: 440,
  minHeight: 360,
};

export interface ImportStep {
  step: string;
  label: string;
  detail?: string;
  elapsedMs?: number;
  status: "pending" | "active" | "done";
  tone?: "default" | "warning";
}

interface StageImportProgressDialogProps {
  open: boolean;
  progress: number;
  steps: ImportStep[];
  onClose?: () => void;
  title?: string;
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StepRow({ step }: { step: ImportStep }) {
  return (
    <div className="flex items-start gap-2 py-1 text-sm">
      {step.status === "done" && (
        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
      )}
      {step.status === "active" && (
        <Loader2 className="h-4 w-4 text-blue-400 shrink-0 animate-spin" />
      )}
      {step.status === "pending" && step.tone !== "warning" && (
        <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
      )}
      {step.status === "pending" && step.tone === "warning" && (
        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "break-words",
            step.status === "done" && "text-muted-foreground",
            step.status === "active" && "text-foreground font-medium",
            step.status === "pending" && "text-muted-foreground/50",
            step.tone === "warning" && "text-amber-600"
          )}
        >
          {step.label}
        </div>
        {step.detail && (
          <div className="mt-0.5 break-words text-xs text-muted-foreground">
            {step.detail}
          </div>
        )}
      </div>
      {step.status === "done" && step.elapsedMs != null && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatElapsed(step.elapsedMs)}
        </span>
      )}
    </div>
  );
}

export function StageImportProgressDialog({
  open,
  progress,
  steps,
  onClose,
  title,
}: StageImportProgressDialogProps) {
  const { t } = useTranslation("scene-root-b");
  const activeStep = steps.find((s) => s.status === "active");
  const isBusy = steps.some((step) => step.status === "active");

  if (!open) return null;

  return (
    <AppRndModalShell
      titleId="stage-import-progress-title"
      title={title ?? t("import.title")}
      subtitle={activeStep?.label ?? t("import.preparing")}
      headerIcon={<Loader2 className={cn("h-5 w-5 text-primary", isBusy && "animate-spin")} />}
      dimensions={STAGE_IMPORT_PROGRESS_DIMENSIONS}
      storageKey="app.rnd-size.stage-import-progress"
      onClose={() => onClose?.()}
      closeDisabled={isBusy}
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <Progress value={progress} className="h-2" />

        <div className="space-y-0.5 mt-2">
          {steps.map((step) => (
            <StepRow key={step.step} step={step} />
          ))}
        </div>
      </div>
    </AppRndModalShell>
  );
}
