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

interface StageSaveToRegistryButtonProps {
  stage: StageListEntry;
  index: number;
  workspacePath: string;
  resourceRegistry: UseResourceRegistryResult;
  slotSeeds: Partial<Record<StageHashSlot, string>>;
}

function describeSaveResult(slots: ReturnType<typeof resolveStageSlotSeeds>): string | undefined {
  const unverified = slots.filter((slot) => !slot.seedVerified).map((slot) => slot.slot);
  if (unverified.length === 0) {
    return undefined;
  }
  return `Generated placeholder seeds for: ${unverified.join(", ")}. Edit in Resource Registry if needed.`;
}

export function StageSaveToRegistryButton({
  stage,
  index,
  workspacePath,
  resourceRegistry,
  slotSeeds,
}: StageSaveToRegistryButtonProps) {
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const persistStage = useCallback(async () => {
    if (!workspacePath.trim()) {
      toast.error("Select a workspace folder in Resource Registry or EXVS2 Workspace first");
      return;
    }

    const slots = resolveStageSlotSeeds(stage, resourceRegistry.mergedEntries, slotSeeds);
    if (slots.length === 0) {
      toast.error("No non-zero stage hash fields to save");
      return;
    }

    setBusy(true);
    try {
      const entries = buildStageRegistryEntries(stage, slots);
      const saved = await resourceRegistry.replaceWorkspaceStageByEntryId(stage.entryId, entries);
      if (!saved) {
        toast.error("Failed to save to workspace registry");
        return;
      }
      const hint = describeSaveResult(slots);
      toast.success(`Saved ${entries.length} registry entries for stage ID ${stage.entryId}`, {
        description: hint,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message || "Failed to save to registry");
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }, [resourceRegistry, slotSeeds, stage, workspacePath]);

  const handleClick = useCallback(() => {
    if (!workspacePath.trim()) {
      toast.error("Select a workspace folder in Resource Registry or EXVS2 Workspace first");
      return;
    }

    const slots = resolveStageSlotSeeds(stage, resourceRegistry.mergedEntries, slotSeeds);
    if (slots.length === 0) {
      toast.error("No non-zero stage hash fields to save");
      return;
    }

    const existing = findStageRegistryEntriesByEntryId(resourceRegistry.mergedEntries, stage.entryId);
    if (existing.length > 0) {
      setPendingCount(existing.length);
      setConfirmOpen(true);
      return;
    }

    void persistStage();
  }, [persistStage, resourceRegistry.mergedEntries, slotSeeds, stage, workspacePath]);

  const stageTitle = stage.name?.trim() || `Stage ${stage.entryId}`;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 shrink-0"
        disabled={busy || resourceRegistry.loading}
        onClick={handleClick}
        title="Save current stage hashes to workspace resource registry"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
        Save to Registry
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Overwrite registry entries?</AlertDialogTitle>
            <AlertDialogDescription>
              Stage ID {stage.entryId} ({stageTitle}, index {index}) already has {pendingCount} registry
              row(s). Overwrite them with the current hash and seed values?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void persistStage()}>
              Overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
