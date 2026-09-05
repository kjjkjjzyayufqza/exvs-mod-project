import { openPath } from "@tauri-apps/plugin-opener";
import { CheckCircle2, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { GvsIndexedNameRef } from "./gvsFileNameSearch";
import { useTranslation } from "react-i18next";

interface StageGvsFileNameStatusProps {
  resolvedRef: GvsIndexedNameRef | null;
  isLoading: boolean;
  error: string | null;
}

export function StageGvsFileNameStatus({
  resolvedRef,
  isLoading,
  error,
}: StageGvsFileNameStatusProps) {
  const { t } = useTranslation("test-stage-list-view");
  if (!resolvedRef && !isLoading && !error) {
    return null;
  }

  if (isLoading) {
    return <div className="w-3 h-3 animate-pulse bg-muted rounded-full" aria-label={t("gvsFileNameStatus.indexing")} />;
  }

  if (error) {
    return (
      <div
        className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-muted/50 border text-[9px] font-bold"
        title={error}
      >
        <span className="text-muted-foreground">DIR</span>
        <XCircle className="h-2.5 w-2.5 text-destructive" />
      </div>
    );
  }

  if (!resolvedRef) {
    return null;
  }

  const hasMatch = resolvedRef.exists;
  const tooltip = hasMatch
    ? t("gvsFileNameStatus.exists", { path: resolvedRef.filePath })
    : t("gvsFileNameStatus.missing", { path: resolvedRef.filePath });

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 px-1 py-0.5 rounded bg-muted/50 border text-[9px] font-bold transition-colors",
        hasMatch && "cursor-pointer hover:bg-accent hover:text-accent-foreground active:bg-accent/80"
      )}
      title={tooltip}
      onClick={hasMatch ? () => void openPath(resolvedRef.filePath) : undefined}
    >
      <span className="text-muted-foreground">DIR</span>
      {hasMatch ? (
        <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />
      ) : (
        <XCircle className="h-2.5 w-2.5 text-destructive" />
      )}
    </div>
  );
}
