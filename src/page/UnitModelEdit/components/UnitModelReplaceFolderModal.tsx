import { AlertTriangle, CheckCircle2, FileBox, ImageIcon, Loader2, Replace } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { UnitModelReplacePreview } from "../utils/unitModelModelService";
import { UnitModelSourceValidationPreview } from "./UnitModelSourceValidationPreview";

const LIST_CAP = 10;

function NameList({ items, empty = "none" }: { items: string[]; empty?: string }) {
  if (items.length === 0) {
    return <span className="text-[10px] text-muted-foreground">{empty}</span>;
  }
  const shown = items.slice(0, LIST_CAP);
  const extra = items.length - shown.length;
  return (
    <ul className="mt-1 flex flex-wrap gap-1">
      {shown.map((item) => (
        <li
          key={item}
          className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
        >
          {item}
        </li>
      ))}
      {extra > 0 ? (
        <li className="rounded px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          +{extra} more
        </li>
      ) : null}
    </ul>
  );
}

function CountRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "warning";
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded border border-border/60 bg-muted/20 px-2 py-1.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span
        className={
          tone === "warning"
            ? "font-mono text-[11px] text-amber-600 dark:text-amber-400"
            : "font-mono text-[11px]"
        }
      >
        {value}
      </span>
    </div>
  );
}

type UnitModelReplaceFolderModalProps = {
  open: boolean;
  preview: UnitModelReplacePreview | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function UnitModelReplaceFolderModal({
  open,
  preview,
  busy,
  onConfirm,
  onCancel,
}: UnitModelReplaceFolderModalProps) {
  const blockers = preview?.blockers ?? [];
  const warnings = preview?.warnings ?? [];
  const skeleton = preview?.compatibility.skeleton;
  const materials = preview?.compatibility.materials;
  const textures = preview?.textures;
  const canConfirm = Boolean(preview) && blockers.length === 0 && !busy;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <AlertDialogContent className="max-w-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Replace className="h-4 w-4 text-primary" aria-hidden />
            Replace model from folder
          </AlertDialogTitle>
          <AlertDialogDescription>
            Review the prepared SSBH folder before it replaces the selected model in place.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {preview ? (
          <div className="max-h-[62vh] space-y-3 overflow-y-auto pr-1 text-xs">
            <section className="rounded-md border border-primary/30 bg-primary/5 p-2.5">
              <div className="flex items-start gap-2">
                <FileBox className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">Target identity is preserved</span>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      index {preview.target.modelIndex}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-[11px]">{preview.target.modelName}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    The source folder name is discarded; NUMDLB identity and model order stay on the target.
                  </p>
                </div>
              </div>
            </section>

            <UnitModelSourceValidationPreview
              validation={preview.source}
              mode="replace"
              texturePlan={preview.textures}
            />

            <section className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                Compatibility
              </p>
              {skeleton ? (
                <>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                    <CountRow label="Target bones" value={skeleton.targetBoneCount} />
                    <CountRow label="Source bones" value={skeleton.sourceBoneCount} />
                    <CountRow
                      label="Matching names"
                      value={skeleton.matchingBoneNames}
                      tone={
                        skeleton.missingInSource.length > 0 || skeleton.newInSource.length > 0
                          ? "warning"
                          : "default"
                      }
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Missing in source</p>
                      <NameList items={skeleton.missingInSource} />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">New in source</p>
                      <NameList items={skeleton.newInSource} />
                    </div>
                  </div>
                </>
              ) : null}
              {materials ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Kept materials</p>
                    <NameList items={materials.keptLabels} />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Removed materials</p>
                    <NameList items={materials.removedLabels} />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Added materials</p>
                    <NameList items={materials.addedLabels} />
                  </div>
                </div>
              ) : null}
            </section>

            {textures ? (
              <section className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-2.5">
                <p className="flex items-center gap-1.5 text-[11px] font-medium">
                  <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  Texture commit plan
                </p>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  <CountRow label="Referenced" value={textures.referenced.length} />
                  <CountRow label="Copied" value={textures.copiedFromSource.length} />
                  <CountRow label="Reused" value={textures.reusedFromPool.length} />
                  <CountRow
                    label="Missing"
                    value={textures.missing.length}
                    tone={textures.missing.length > 0 ? "warning" : "default"}
                  />
                </div>
                {textures.orphanedAfterReplace.length > 0 ? (
                  <div>
                    <p className="text-[10px] text-muted-foreground">May be removed after replace</p>
                    <NameList items={textures.orphanedAfterReplace} />
                  </div>
                ) : null}
              </section>
            ) : null}

            {warnings.length > 0 ? (
              <section className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-amber-700 dark:text-amber-300">
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  Warnings
                </p>
                <ul className="space-y-1">
                  {warnings.map((warning) => (
                    <li key={warning} className="text-[10px]">
                      {warning}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {blockers.length > 0 ? (
              <section className="rounded-md border border-red-500/40 bg-red-500/10 p-2.5 text-red-600 dark:text-red-400">
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  Blockers
                </p>
                <ul className="space-y-1">
                  {blockers.map((blocker) => (
                    <li key={blocker} className="text-[10px]">
                      {blocker}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}

        <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          <Button type="button" disabled={!canConfirm} onClick={onConfirm}>
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {busy ? "Replacing..." : "Replace contents"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
