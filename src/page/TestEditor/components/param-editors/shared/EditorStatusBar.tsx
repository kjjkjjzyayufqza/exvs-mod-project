import { AlertTriangle, Info, XCircle } from "lucide-react";
import type { ValidationMessage } from "./types";

interface EditorStatusBarProps {
  entryCount: number;
  selectedIndex: number;
  modifiedCount: number;
  validationMessages: ValidationMessage[];
  extra?: React.ReactNode;
}

export function EditorStatusBar({
  entryCount,
  selectedIndex,
  modifiedCount,
  validationMessages,
  extra,
}: EditorStatusBarProps) {
  const errors = validationMessages.filter((m) => m.level === "error").length;
  const warnings = validationMessages.filter(
    (m) => m.level === "warning",
  ).length;

  return (
    <div className="flex items-center gap-4 border-t bg-muted/30 px-4 py-1.5 text-[11px] text-muted-foreground">
      <span>
        Entry #{selectedIndex} of {entryCount}
      </span>
      {modifiedCount > 0 && (
        <span className="text-yellow-500">Modified: {modifiedCount} fields</span>
      )}
      {errors > 0 && (
        <span className="flex items-center gap-1 text-destructive">
          <XCircle className="h-3 w-3" /> {errors} error
          {errors > 1 ? "s" : ""}
        </span>
      )}
      {warnings > 0 && (
        <span className="flex items-center gap-1 text-yellow-500">
          <AlertTriangle className="h-3 w-3" /> {warnings} warning
          {warnings > 1 ? "s" : ""}
        </span>
      )}
      {extra && <span className="ml-auto">{extra}</span>}
    </div>
  );
}
