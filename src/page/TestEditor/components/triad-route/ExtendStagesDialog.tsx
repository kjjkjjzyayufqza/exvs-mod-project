import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { hashTriadSceneNames } from "@/services/triadRoute/triadRouteService";
import {
  formatHash,
  type HashedSceneName,
  type TriadRouteDocument,
} from "@/services/triadRoute/types";
import {
  defaultSceneNameForSlot,
  defaultSceneNumberForSlot,
  missingStageIndexes,
} from "./extendStages";

const HASH_DEBOUNCE_MS = 250;

export type ExtendStageSlot = {
  index: number;
  sceneName: string;
  sceneNo: number;
  donorStageIndex: number;
};

export type ExtendStagesValues = {
  slots: ExtendStageSlot[];
  /** Overwrite the scene's own leftover folder and briefing. */
  replaceExisting: boolean;
};

type ExtendStagesDialogProps = {
  open: boolean;
  draft: TriadRouteDocument | null;
  usedSceneNumbers: number[];
  existingSceneKeys: number[];
  existingPackageHashes: number[];
  /**
   * Where the create will look, so the name check sees what it will see.
   * Without these the dialog checks a narrower set than the create does and
   * a name reads as free right up until it fails.
   */
  outmissionDir: string;
  workspaceRoot: string;
  scriptPrefix: string;
  isCreating?: boolean;
  onCancel: () => void;
  onConfirm: (values: ExtendStagesValues) => void;
};

function emptySlots(): ExtendStageSlot[] {
  return [];
}

export function ExtendStagesDialog({
  open,
  draft,
  usedSceneNumbers,
  existingSceneKeys,
  existingPackageHashes,
  outmissionDir,
  workspaceRoot,
  scriptPrefix,
  isCreating,
  onCancel,
  onConfirm,
}: ExtendStagesDialogProps) {
  const { t } = useTranslation("test-triad-route");
  const suggestion = useMemo((): ExtendStageSlot[] => {
    if (!draft) return emptySlots();
    const firstDonor = draft.stages[0]?.index ?? 1;
    const taken = [...usedSceneNumbers];
    return missingStageIndexes(draft.stages.length, draft.course.category).map((index) => {
      const sceneNo = defaultSceneNumberForSlot(draft, index, taken);
      taken.push(sceneNo);
      return {
        index,
        sceneName: defaultSceneNameForSlot(draft, index),
        sceneNo,
        donorStageIndex: firstDonor,
      };
    });
  }, [draft, usedSceneNumbers]);
  const missing = draft ? missingStageIndexes(draft.stages.length, draft.course.category) : [];

  const [slots, setSlots] = useState<ExtendStageSlot[]>(suggestion);
  const [identities, setIdentities] = useState<HashedSceneName[]>([]);
  const [hashError, setHashError] = useState<string | null>(null);
  const [isHashing, setIsHashing] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const hashToken = useRef(0);
  const lookup = useRef({
    scenes: existingSceneKeys,
    packages: existingPackageHashes,
    workspace: { outmissionDir, workspaceRoot, scriptPrefix },
  });
  lookup.current = {
    scenes: existingSceneKeys,
    packages: existingPackageHashes,
    workspace: { outmissionDir, workspaceRoot, scriptPrefix },
  };

  useEffect(() => {
    if (!open) return;
    setSlots(suggestion);
    setIdentities([]);
    setHashError(null);
    setReplaceExisting(false);
  }, [open, suggestion]);

  const namesKey = slots.map((slot) => slot.sceneName).join("\u0000");

  useEffect(() => {
    if (!open || namesKey.length === 0) {
      setIdentities((current) => (current.length === 0 ? current : []));
      return;
    }
    const names = namesKey.split("\u0000");
    const token = (hashToken.current += 1);
    setIsHashing(true);
    const timer = setTimeout(() => {
      void hashTriadSceneNames(
        names,
        lookup.current.scenes,
        lookup.current.packages,
        lookup.current.workspace,
      )
        .then((result) => {
          if (token !== hashToken.current) return;
          setIdentities(result);
          setHashError(null);
        })
        .catch((error: unknown) => {
          if (token !== hashToken.current) return;
          setIdentities([]);
          setHashError(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          if (token === hashToken.current) setIsHashing(false);
        });
    }, HASH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, namesKey]);

  const duplicateNames = useMemo(() => {
    const seen = new Set<string>();
    const repeated = new Set<string>();
    for (const slot of slots) {
      const trimmed = slot.sceneName.trim().toLowerCase();
      if (!trimmed) continue;
      if (seen.has(trimmed)) repeated.add(trimmed);
      seen.add(trimmed);
    }
    return repeated;
  }, [slots]);

  /**
   * A name whose ids are taken is only usable when the holder is the scene's
   * own leftovers and replacing is on. A clash with anything else stays a
   * dead end here, because overwriting it would take out another scene.
   */
  const clashing = identities.filter(
    (identity) => identity.sceneKeyCollision !== null || identity.packageHashCollision !== null,
  );
  const reclaimable = identities.filter((identity) => identity.replaceable);
  const foreignClashes = clashing.filter((identity) => !identity.replaceable);

  const namesUsable =
    slots.length > 0 &&
    hashError === null &&
    duplicateNames.size === 0 &&
    identities.length === slots.length &&
    foreignClashes.length === 0 &&
    (reclaimable.length === 0 || replaceExisting) &&
    slots.every((slot) => /^[A-Za-z0-9_-]{1,64}$/.test(slot.sceneName.trim()));

  const canCreate = Boolean(draft) && !isCreating && !isHashing && namesUsable;

  const toggleSlot = (index: number, checked: boolean) => {
    if (!draft) return;
    setSlots((current) => {
      if (!checked) return current.filter((slot) => slot.index !== index);
      if (current.some((slot) => slot.index === index)) return current;
      const taken = [...usedSceneNumbers, ...current.map((slot) => slot.sceneNo)];
      return [...current, {
        index,
        sceneName: defaultSceneNameForSlot(draft, index),
        sceneNo: defaultSceneNumberForSlot(draft, index, taken),
        donorStageIndex: draft.stages[0]?.index ?? 1,
      }].sort((a, b) => a.index - b.index);
    });
  };

  const patchSlot = (index: number, next: Partial<ExtendStageSlot>) => {
    setSlots((current) =>
      current.map((slot) => (slot.index === index ? { ...slot, ...next } : slot)),
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onCancel() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("extend.title", { name: draft?.course.name || "—" })}</DialogTitle>
          <DialogDescription style={{ textWrap: "pretty" }}>
            {t("extend.description")}
          </DialogDescription>
        </DialogHeader>

        {draft ? (
          <div className="flex flex-col gap-3">
            <p className="text-[11px] text-muted-foreground" style={{ textWrap: "pretty" }}>
              {t("extend.saveNote")}
            </p>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("extend.slots")}</Label>
              <div className="flex flex-wrap gap-3">
                {missing.map((index) => (
                  <label key={index} className="inline-flex min-h-9 items-center gap-2 text-xs">
                    <Checkbox
                      checked={slots.some((slot) => slot.index === index)}
                      onCheckedChange={(checked) => toggleSlot(index, checked === true)}
                    />
                    {t("stages.stage", { index })}
                  </label>
                ))}
              </div>
            </div>

            {slots.map((slot, order) => {
              const identity = identities[order];
              const duplicate = duplicateNames.has(slot.sceneName.trim().toLowerCase());
              const malformed = !/^[A-Za-z0-9_-]{1,64}$/.test(slot.sceneName.trim());
              const clash = identity?.sceneKeyCollision ?? identity?.packageHashCollision ?? null;
              // Its own leftovers are not a problem once replacing is on, so
              // the row reads as reusable rather than as a clash.
              const reusable = identity?.replaceable === true;
              const bad = duplicate || malformed || (clash !== null && !reusable);
              return (
                <section key={slot.index} className="flex flex-col gap-2 rounded-md border bg-card/40 p-2.5">
                  <p className="text-xs font-medium">{t("stages.stage", { index: slot.index })}</p>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-[11px]">{t("wizard.sceneNames")}</Label>
                    <Input
                      value={slot.sceneName}
                      aria-invalid={bad}
                      className={cn("h-9 font-mono text-xs", bad && "border-destructive")}
                      onChange={(event) => patchSlot(slot.index, { sceneName: event.target.value })}
                    />
                    {identity && !bad ? (
                      <p className="flex flex-wrap items-center gap-x-3 text-[10px] tabular-nums text-muted-foreground">
                        {reusable ? (
                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <RefreshCw className="size-3" />
                            {t("extend.reusesExisting")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <Check className="size-3" />
                            {t("wizard.hashesFree")}
                          </span>
                        )}
                        <span className="font-mono">
                          {t("stages.sceneKey")} {formatHash(identity.sceneKey)}
                        </span>
                        <span className="font-mono">
                          {t("stages.scriptPackage")} {formatHash(identity.packageHash)}
                        </span>
                      </p>
                    ) : (
                      <p className="flex items-start gap-1 text-[10px] text-destructive">
                        <AlertTriangle className="mt-px size-3 shrink-0" />
                        {malformed
                          ? t("wizard.sceneNameInvalid")
                          : duplicate
                            ? t("wizard.sceneNameDuplicate")
                            : (clash ?? t("wizard.sceneNamePending"))}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-[11px]">{t("extend.donor")}</Label>
                    <Select
                      value={String(slot.donorStageIndex)}
                      onValueChange={(value) =>
                        patchSlot(slot.index, { donorStageIndex: Number(value) })
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {draft.stages.map((stage) => (
                          <SelectItem key={stage.index} value={String(stage.index)}>
                            {t("extend.donorThisStage", { index: stage.index })}
                            {stage.sceneName ? ` · ${stage.sceneName}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </section>
              );
            })}
            {reclaimable.length > 0 ? (
              <label className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] text-amber-700 dark:text-amber-400">
                <Checkbox
                  checked={replaceExisting}
                  disabled={isCreating}
                  onCheckedChange={(checked) => setReplaceExisting(checked === true)}
                />
                <span style={{ textWrap: "pretty" }}>
                  {t("extend.replaceExisting", {
                    scenes: reclaimable.map((identity) => identity.name).join(", "),
                  })}
                </span>
              </label>
            ) : null}
            {hashError ? <p className="text-[11px] text-destructive">{hashError}</p> : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={isCreating} onClick={onCancel}>
            {t("wizard.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!canCreate}
            onClick={() => onConfirm({ slots, replaceExisting })}
          >
            {isCreating ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Plus className="mr-1.5 size-4" />}
            {isCreating
              ? t("extend.adding")
              : replaceExisting
                ? t("extend.confirmReplacing")
                : t("extend.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
