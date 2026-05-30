import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Circle, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

export type SaveStepStatus = "pending" | "running" | "done" | "error";

export type SaveStepInfo = {
  id: string;
  label: string;
  status: SaveStepStatus;
  detail?: string;
  error?: string;
};

interface SaveProgressDialogProps {
  open: boolean;
  title: string;
  steps: SaveStepInfo[];
  onClose: () => void;
  canClose: boolean;
  completionSummary?: string[];
}

function StepIcon({ status }: { status: SaveStepStatus }) {
  switch (status) {
    case "done":
      return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
    case "running":
      return <Loader2 className="h-4 w-4 text-blue-400 shrink-0 animate-spin" />;
    case "error":
      return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
    case "pending":
      return <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />;
  }
}

function SaveStepRow({ step }: { step: SaveStepInfo }) {
  const [expanded, setExpanded] = useState(false);
  const hasError = step.status === "error" && step.error;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 py-1 text-sm",
          hasError && "cursor-pointer",
        )}
        onClick={hasError ? () => setExpanded((v) => !v) : undefined}
      >
        <StepIcon status={step.status} />
        <span
          className={cn(
            "flex-1",
            step.status === "done" && "text-muted-foreground",
            step.status === "running" && "text-foreground font-medium",
            step.status === "pending" && "text-muted-foreground/50",
            step.status === "error" && "text-destructive font-medium",
          )}
        >
          {step.label}
        </span>
        {step.detail && (
          <span className="text-xs text-muted-foreground tabular-nums">{step.detail}</span>
        )}
        {hasError && (
          expanded
            ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
            : <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
      </div>
      {hasError && expanded && (
        <div className="ml-6 mb-1 rounded bg-destructive/10 p-2 text-xs text-destructive whitespace-pre-wrap">
          {step.error}
        </div>
      )}
    </div>
  );
}

export function SaveProgressDialog({
  open,
  title,
  steps,
  onClose,
  canClose,
  completionSummary,
}: SaveProgressDialogProps) {
  const hasError = steps.some((s) => s.status === "error");
  const allDone = steps.length > 0 && steps.every((s) => s.status === "done");
  const activeStep = steps.find((s) => s.status === "running");
  const hasCompletionSummary = allDone && completionSummary && completionSummary.length > 0;

  const displayTitle = allDone
    ? `${title} — Complete`
    : hasError
      ? `${title} — Failed`
      : title;

  const description = activeStep?.label
    ?? (hasCompletionSummary
      ? "The following changes were written to disk:"
      : allDone
        ? "All steps completed successfully."
        : hasError
          ? "One or more steps failed."
          : "Preparing...");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && canClose) onClose();
      }}
    >
      <DialogContent
        className="max-w-md"
        hideCloseButton={!canClose}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{displayTitle}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {hasCompletionSummary && (
          <div className="rounded border bg-muted/30 p-3 max-h-40 overflow-y-auto">
            <ul className="space-y-1 text-sm text-muted-foreground list-disc ml-4">
              {completionSummary.map((line) => (
                <li key={line} className="break-words">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-0.5 mt-2">
          {steps.map((step) => (
            <SaveStepRow key={step.id} step={step} />
          ))}
        </div>

        <DialogFooter>
          <Button
            variant={hasError ? "destructive" : "default"}
            disabled={!canClose}
            onClick={onClose}
          >
            {canClose ? "Close" : "Processing..."}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
