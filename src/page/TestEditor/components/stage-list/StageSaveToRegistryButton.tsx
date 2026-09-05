import { useCallback, useState } from "react";
import { Database, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import type { UseResourceRegistryResult } from "@/hooks/useResourceRegistry";
import type { StageListEntry } from "@/models/stageListEntry";
import {
  buildStageRegistryEntries,
  findStageRegistryEntriesByEntryId,
  resolveStageSlotSeeds,
  type StageHashSlot,
} from "@/services/resourceRegistry/stageRegistrySync";
import { useTranslation } from "react-i18next";

interface StageSaveToRegistryButtonProps {
  stage: StageListEntry;
  index: number;
  workspacePath: string;
  resourceRegistry: UseResourceRegistryResult;
  slotSeeds: Partial<Record<StageHashSlot, string>>;
}

export function StageSaveToRegistryButton({
  stage,
  index,
  workspacePath,
  resourceRegistry,
  slotSeeds,
}: StageSaveToRegistryButtonProps) {
  const { t } = useTranslation("test-stage-list-view");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const persistStage = useCallback(async () => {
    if (!workspacePath.trim()) {
      toast.error(t("saveRegistry.selectWorkspace"));
      return;
    }

    const slots = resolveStageSlotSeeds(stage, resourceRegistry.mergedEntries, slotSeeds);
    if (slots.length === 0) {
      toast.error(t("saveRegistry.noHashes"));
      return;
    }

    setBusy(true);
    try {
      const entries = buildStageRegistryEntries(stage, slots);
      const saved = await resourceRegistry.replaceWorkspaceStageByEntryId(stage.entryId, entries);
      if (!saved) {
        toast.error(t("saveRegistry.saveFailed"));
        return;
      }
      const unverified = slots.filter((slot) => !slot.seedVerified).map((slot) => slot.slot);
      toast.success(t("toast.savedRegistry", { count: entries.length, id: stage.entryId }), {
        description:
          unverified.length > 0
            ? t("saveRegistry.placeholderSeeds", { slots: unverified.join(", ") })
            : undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message || t("saveRegistry.saveFailed"));
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }, [resourceRegistry, slotSeeds, stage, t, workspacePath]);

  const handleClick = useCallback(() => {
    if (!workspacePath.trim()) {
      toast.error(t("saveRegistry.selectWorkspace"));
      return;
    }

    const slots = resolveStageSlotSeeds(stage, resourceRegistry.mergedEntries, slotSeeds);
    if (slots.length === 0) {
      toast.error(t("saveRegistry.noHashes"));
      return;
    }

    const existing = findStageRegistryEntriesByEntryId(resourceRegistry.mergedEntries, stage.entryId);
    if (existing.length > 0) {
      setPendingCount(existing.length);
      setConfirmOpen(true);
      return;
    }

    void persistStage();
  }, [persistStage, resourceRegistry.mergedEntries, slotSeeds, stage, t, workspacePath]);

  const stageTitle = stage.name?.trim() || t("card.fallbackName", { id: stage.entryId });

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 shrink-0"
        disabled={busy || resourceRegistry.loading}
        onClick={handleClick}
        title={t("saveRegistry.title")}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
        {t("saveRegistry.button")}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("saveRegistry.overwriteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("saveRegistry.overwriteDescription", {
                id: stage.entryId,
                name: stageTitle,
                index,
                count: pendingCount,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void persistStage()}>
              {t("saveRegistry.overwrite")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
