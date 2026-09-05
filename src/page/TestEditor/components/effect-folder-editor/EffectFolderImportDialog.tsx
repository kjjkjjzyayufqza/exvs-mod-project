import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { FilePathInput } from "@/components/ui/filePathInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseHashInput } from "./effectFolderEditorUtils";

type ImportKind = "efxbn" | "texture" | "model";

type EffectFolderImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultKind?: ImportKind;
  busy?: boolean;
  onImportFile: (params: {
    kind: "efxbn" | "texture" | "nutexb";
    hashId: number;
    sourcePath?: string | null;
    targetFilename?: string | null;
  }) => Promise<void>;
  onImportModel: (params: {
    modelHashId: number;
    sourceDir?: string | null;
    targetFolderName?: string | null;
  }) => Promise<void>;
};

export function EffectFolderImportDialog({
  open: dialogOpen,
  onOpenChange,
  defaultKind = "efxbn",
  busy = false,
  onImportFile,
  onImportModel,
}: EffectFolderImportDialogProps) {
  const { t } = useTranslation("test-effect-folder");
  const [kind, setKind] = useState<ImportKind>(defaultKind);
  const [hashInput, setHashInput] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [targetName, setTargetName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const sourceIsEmpty = sourcePath.trim().length === 0;

  useEffect(() => {
    if (!dialogOpen) return;
    setKind(defaultKind);
    setHashInput("");
    setSourcePath("");
    setTargetName("");
    setError(null);
  }, [defaultKind, dialogOpen]);

  const pickSourceFile = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters:
        kind === "efxbn"
          ? [{ name: "EFXBN", extensions: ["efxbn"] }]
          : [{ name: "Nutexb", extensions: ["nutexb"] }],
    });
    if (typeof selected === "string") {
      setSourcePath(selected);
    }
  }, [kind]);

  const pickSourceDir = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      setSourcePath(selected);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    const hashId = parseHashInput(hashInput);
    if (hashId == null) {
      setError(t("importDialog.invalidHash"));
      return;
    }
    setError(null);
    if (kind === "model") {
      await onImportModel({
        modelHashId: hashId,
        sourceDir: sourcePath.trim() || null,
        targetFolderName: targetName.trim() || null,
      });
    } else {
      await onImportFile({
        kind: kind === "texture" ? "nutexb" : "efxbn",
        hashId,
        sourcePath: sourcePath.trim() || null,
        targetFilename: targetName.trim() || null,
      });
    }
    onOpenChange(false);
  }, [hashInput, kind, onImportFile, onImportModel, onOpenChange, sourcePath, t, targetName]);

  return (
    <Dialog open={dialogOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("importDialog.title")}</DialogTitle>
          <DialogDescription>{t("importDialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="grid gap-2">
            <Label htmlFor="effect-import-kind">{t("importDialog.assetKind")}</Label>
            <Select value={kind} onValueChange={(value) => setKind(value as ImportKind)}>
              <SelectTrigger id="effect-import-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="efxbn">EFXBN</SelectItem>
                <SelectItem value="texture">{t("importDialog.textureNutexb")}</SelectItem>
                <SelectItem value="model">{t("importDialog.modelFolder")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="effect-import-hash">{t("importDialog.hashId")}</Label>
            <Input
              id="effect-import-hash"
              value={hashInput}
              onChange={(event) => setHashInput(event.target.value)}
              placeholder={t("importDialog.hashPlaceholder")}
              className="font-mono"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="effect-import-source">
              {kind === "model" ? t("importDialog.sourceFolder") : t("importDialog.sourceFile")}
            </Label>
            <div className="flex gap-2">
              <FilePathInput
                id="effect-import-source"
                value={sourcePath}
                onChange={(event) => setSourcePath(event.target.value)}
                placeholder={kind === "model" ? t("importDialog.pickFolder") : t("importDialog.pickFile")}
              />
              <Button type="button" variant="outline" onClick={() => void (kind === "model" ? pickSourceDir() : pickSourceFile())}>
                {t("actions.browse")}
              </Button>
            </div>
            {sourceIsEmpty ? (
              <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-800 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{t("importDialog.noSource")}</span>
              </div>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="effect-import-target">
              {kind === "model" ? t("importDialog.targetFolder") : t("importDialog.targetFile")}
            </Label>
            <Input
              id="effect-import-target"
              value={targetName}
              onChange={(event) => setTargetName(event.target.value)}
              placeholder={kind === "model" ? "model_folder" : "effect_name"}
              data-i18n-ignore=""
            />
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("actions.cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {sourceIsEmpty ? t("importDialog.createPlaceholder") : t("actions.import")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
