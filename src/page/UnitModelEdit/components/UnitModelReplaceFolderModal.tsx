import { AlertTriangle, CheckCircle2, FileBox, FileUp, FolderOpen, ImageIcon, Loader2, Replace } from "lucide-react";

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
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import type {
  UnitModelNumshbReplacePreview,
  UnitModelReplacePreview,
} from "../utils/unitModelModelService";
import { UnitModelSourceValidationPreview } from "./UnitModelSourceValidationPreview";

export type UnitModelReplaceScope = "full" | "numshb" | "fullFbx";

const LIST_CAP = 10;

function NameList({ items, empty }: { items: string[]; empty?: string }) {
  const { t } = useTranslation("unit-replace-folder");
  if (items.length === 0) {
    return <span className="text-[10px] text-muted-foreground">{empty ?? t("lists.none")}</span>;
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
          {t("lists.more", { count: extra })}
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

function objectLabel(name: string, subindex: number): string {
  return `${name}#${subindex}`;
}

type UnitModelReplaceFolderModalProps = {
  open: boolean;
  targetModelName: string;
  targetModelIndex: number | null;
  scope: UnitModelReplaceScope;
  fullPreview: UnitModelReplacePreview | null;
  numshbPreview: UnitModelNumshbReplacePreview | null;
  busy: boolean;
  onScopeChange: (scope: UnitModelReplaceScope) => void;
  onChooseFullFolder: () => void;
  onChooseExistingNumshb: () => void;
  onConvertFbx: () => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export function UnitModelReplaceFolderModal({
  open,
  targetModelName,
  targetModelIndex,
  scope,
  fullPreview,
  numshbPreview,
  busy,
  onScopeChange,
  onChooseFullFolder,
  onChooseExistingNumshb,
  onConvertFbx,
  onConfirm,
  onCancel,
}: UnitModelReplaceFolderModalProps) {
  const blockers =
    scope === "numshb" ? (numshbPreview?.blockers ?? []) : (fullPreview?.blockers ?? []);
  const warnings =
    scope === "numshb" ? (numshbPreview?.warnings ?? []) : (fullPreview?.warnings ?? []);
  const hasPreview = scope === "numshb" ? Boolean(numshbPreview) : Boolean(fullPreview);
  const canConfirm = hasPreview && blockers.length === 0 && !busy;
  const identityName = fullPreview?.target.modelName ?? numshbPreview?.target.modelName ?? targetModelName;
  const identityIndex = fullPreview?.target.modelIndex ?? numshbPreview?.target.modelIndex ?? targetModelIndex;
  const { t } = useTranslation("unit-replace-folder");

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
            {t("title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("description")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="max-h-[62vh] space-y-3 overflow-y-auto pr-1 text-xs">
          <section className="rounded-md border border-primary/30 bg-primary/5 p-2.5">
            <div className="flex items-start gap-2">
              <FileBox className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{t("identity.preserved")}</span>
                  {identityIndex != null ? (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {t("identity.index", { index: identityIndex })}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 font-mono text-[11px]">{identityName}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {t("identity.help")}
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-2.5">
            <p className="text-[11px] font-medium">{t("scope.label")}</p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => onScopeChange("full")}
                className={cn(
                  "rounded-md border px-2.5 py-2 text-left transition-colors",
                  scope === "full"
                    ? "border-primary bg-primary/10"
                    : "border-border/60 hover:bg-muted/40",
                )}
              >
                <span className="block text-[11px] font-medium">{t("scope.full.title")}</span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  {t("scope.full.help")}
                </span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onScopeChange("fullFbx")}
                className={cn(
                  "rounded-md border px-2.5 py-2 text-left transition-colors",
                  scope === "fullFbx"
                    ? "border-primary bg-primary/10"
                    : "border-border/60 hover:bg-muted/40",
                )}
              >
                <span className="block text-[11px] font-medium">{t("scope.fullFbx.title")}</span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  {t("scope.fullFbx.help")}
                </span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onScopeChange("numshb")}
                className={cn(
                  "rounded-md border px-2.5 py-2 text-left transition-colors",
                  scope === "numshb"
                    ? "border-primary bg-primary/10"
                    : "border-border/60 hover:bg-muted/40",
                )}
              >
                <span className="block text-[11px] font-medium">{t("scope.numshb.title")}</span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  {t("scope.numshb.help")}
                </span>
              </button>
            </div>
          </section>

          <section className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-2.5">
            <p className="text-[11px] font-medium">{t("source.label")}</p>
            {scope === "full" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                disabled={busy}
                onClick={onChooseFullFolder}
              >
                <FolderOpen className="h-3.5 w-3.5" aria-hidden />
                {t("source.full")}
              </Button>
            ) : scope === "fullFbx" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                disabled={busy}
                onClick={onConvertFbx}
              >
                <FileUp className="h-3.5 w-3.5" aria-hidden />
                {t("source.convertFull")}
              </Button>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5"
                  disabled={busy}
                  onClick={onChooseExistingNumshb}
                >
                  <FolderOpen className="h-3.5 w-3.5" aria-hidden />
                  {t("source.numshb")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5"
                  disabled={busy}
                  onClick={onConvertFbx}
                >
                  <FileUp className="h-3.5 w-3.5" aria-hidden />
                  {t("source.convert")}
                </Button>
              </div>
            )}
          </section>

          {(scope === "full" || scope === "fullFbx") && fullPreview ? (
            <FullReplacePreview preview={fullPreview} />
          ) : null}
          {scope === "numshb" && numshbPreview ? (
            <NumshbReplacePreview preview={numshbPreview} />
          ) : null}

          {warnings.length > 0 ? (
            <section className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-amber-700 dark:text-amber-300">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                {t("warnings")}
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
                {t("blockers")}
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

        <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel type="button" disabled={busy} onClick={onCancel}>
            {t("cancel")}
          </AlertDialogCancel>
          <Button type="button" disabled={!canConfirm} onClick={onConfirm}>
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {busy
              ? t("replacing")
              : scope === "numshb"
                ? t("replaceMesh")
                : t("replaceContents")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function FullReplacePreview({ preview }: { preview: UnitModelReplacePreview }) {
  const { t } = useTranslation("unit-replace-folder");
  const skeleton = preview.compatibility.skeleton;
  const materials = preview.compatibility.materials;
  const textures = preview.textures;
  return (
    <>
      <UnitModelSourceValidationPreview
        validation={preview.source}
        mode="replace"
        texturePlan={preview.textures}
      />
      <section className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-2.5">
        <p className="flex items-center gap-1.5 text-[11px] font-medium">
          <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          {t("preview.compatibility")}
        </p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
          <CountRow label={t("counts.targetBones")} value={skeleton.targetBoneCount} />
          <CountRow label={t("counts.sourceBones")} value={skeleton.sourceBoneCount} />
          <CountRow
            label={t("counts.matchingNames")}
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
            <p className="text-[10px] text-muted-foreground">{t("lists.missingInSource")}</p>
            <NameList items={skeleton.missingInSource} />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">{t("lists.newInSource")}</p>
            <NameList items={skeleton.newInSource} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <p className="text-[10px] text-muted-foreground">{t("lists.keptMaterials")}</p>
            <NameList items={materials.keptLabels} />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">{t("lists.removedMaterials")}</p>
            <NameList items={materials.removedLabels} />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">{t("lists.addedMaterials")}</p>
            <NameList items={materials.addedLabels} />
          </div>
        </div>
      </section>
      <section className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-2.5">
        <p className="flex items-center gap-1.5 text-[11px] font-medium">
          <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          {t("preview.texturePlan")}
        </p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <CountRow label={t("counts.referenced")} value={textures.referenced.length} />
          <CountRow label={t("counts.copied")} value={textures.copiedFromSource.length} />
          <CountRow label={t("counts.reused")} value={textures.reusedFromPool.length} />
          <CountRow
            label={t("counts.missing")}
            value={textures.missing.length}
            tone={textures.missing.length > 0 ? "warning" : "default"}
          />
        </div>
        {textures.orphanedAfterReplace.length > 0 ? (
          <div>
            <p className="text-[10px] text-muted-foreground">{t("lists.orphaned")}</p>
            <NameList items={textures.orphanedAfterReplace} />
          </div>
        ) : null}
      </section>
    </>
  );
}

function NumshbReplacePreview({ preview }: { preview: UnitModelNumshbReplacePreview }) {
  const { t } = useTranslation("unit-replace-folder");
  const objects = preview.meshObjects;
  const skeleton = preview.skeleton;
  return (
    <>
      <section className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-2.5">
        <p className="text-[11px] font-medium">{t("preview.inPlace")}</p>
        <p className="font-mono text-[10px] text-muted-foreground">{preview.targetNumshbPath}</p>
        <p className="text-[10px] text-muted-foreground">
          {t("preview.untouched")}
        </p>
      </section>
      <section className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-2.5">
        <p className="flex items-center gap-1.5 text-[11px] font-medium">
          <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          {t("preview.meshObjects")}
        </p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
          <CountRow label={t("counts.objects")} value={preview.stats.sourceObjectCount} />
          <CountRow label={t("counts.vertices")} value={preview.stats.sourceVertexCount} />
          <CountRow label={t("counts.triangles")} value={preview.stats.sourceTriangleCount} />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <p className="text-[10px] text-muted-foreground">{t("lists.kept")}</p>
            <NameList items={objects.kept.map((item) => objectLabel(item.name, item.subindex))} />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">{t("lists.missingInSource")}</p>
            <NameList
              items={objects.missingInSource.map((item) => objectLabel(item.name, item.subindex))}
            />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">{t("lists.newInSource")}</p>
            <NameList
              items={objects.newInSource.map((item) => objectLabel(item.name, item.subindex))}
            />
          </div>
        </div>
      </section>
      <section className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-2.5">
        <p className="text-[11px] font-medium">{t("preview.skinBones")}</p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <CountRow label={t("counts.matchingNames")} value={skeleton.matchingBoneNames} />
          <CountRow
            label={t("counts.missingInSkeleton")}
            value={skeleton.missingInTargetSkeleton.length}
            tone={skeleton.missingInTargetSkeleton.length > 0 ? "warning" : "default"}
          />
        </div>
        <NameList items={skeleton.missingInTargetSkeleton} empty={t("lists.allInfluenceBonesExist")} />
      </section>
    </>
  );
}
