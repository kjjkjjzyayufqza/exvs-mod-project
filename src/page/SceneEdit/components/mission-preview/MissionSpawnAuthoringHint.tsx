import { useTranslation } from "react-i18next";
import { GitBranch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MissionSpawnEditMode = "ready" | "needEditor" | "compiled";

interface MissionSpawnAuthoringHintProps {
  mode: Exclude<MissionSpawnEditMode, "ready">;
  onEditNodes?: () => void;
  className?: string;
}

/** Explains why loaded spawn markers cannot be dragged yet. */
export function MissionSpawnAuthoringHint({
  mode,
  onEditNodes,
  className,
}: MissionSpawnAuthoringHintProps) {
  const { t } = useTranslation("scene-mission-preview");
  const title = mode === "needEditor" ? t("spawn.needEditorTitle") : t("spawn.compiledTitle");
  const body = mode === "needEditor" ? t("spawn.needEditorBody") : t("spawn.compiledBody");

  return (
    <div
      className={cn(
        "pointer-events-auto rounded-sm border border-amber-500/40 bg-background/95 px-3 py-2 shadow-[0_10px_28px_rgba(12,14,18,0.35)]",
        className,
      )}
    >
      <p className="text-[11px] font-semibold leading-snug text-balance text-foreground">
        {title}
      </p>
      <p className="mt-1 max-w-xl text-[10px] leading-relaxed text-pretty text-muted-foreground">
        {body}
      </p>
      {mode === "needEditor" && onEditNodes ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-2 h-6 gap-1 px-2 text-[10px] transition-transform active:translate-y-px"
          onClick={onEditNodes}
        >
          <GitBranch className="h-3 w-3" />
          {t("spawn.needEditorAction")}
        </Button>
      ) : null}
    </div>
  );
}
