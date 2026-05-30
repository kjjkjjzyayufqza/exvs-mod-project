import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Loader2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ImportStep {
  step: string;
  label: string;
  elapsedMs?: number;
  status: "pending" | "active" | "done";
}

interface StageImportProgressDialogProps {
  open: boolean;
  progress: number;
  steps: ImportStep[];
  onClose?: () => void;
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StepRow({ step }: { step: ImportStep }) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      {step.status === "done" && (
        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
      )}
      {step.status === "active" && (
        <Loader2 className="h-4 w-4 text-blue-400 shrink-0 animate-spin" />
      )}
      {step.status === "pending" && (
        <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
      )}
      <span
        className={cn(
          "flex-1",
          step.status === "done" && "text-muted-foreground",
          step.status === "active" && "text-foreground font-medium",
          step.status === "pending" && "text-muted-foreground/50"
        )}
      >
        {step.label}
      </span>
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
}: StageImportProgressDialogProps) {
  const activeStep = steps.find((s) => s.status === "active");
  const isBusy = steps.some((step) => step.status === "active");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isBusy) onClose?.();
      }}
    >
      <DialogContent
        className="max-w-md"
        hideCloseButton={isBusy}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Importing Stage</DialogTitle>
          <DialogDescription>
            {activeStep?.label ?? "Preparing..."}
          </DialogDescription>
        </DialogHeader>

        <Progress value={progress} className="h-2" />

        <div className="space-y-0.5 mt-2">
          {steps.map((step) => (
            <StepRow key={step.step} step={step} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
