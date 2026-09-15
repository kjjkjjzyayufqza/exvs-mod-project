import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderSearch } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DialogLastPathKey, getDialogDefaultPath, rememberDialogSelection } from "@/utils/dialogLastPath";
import {
  getBlender51PathOverride,
  setBlender51PathOverride,
  subscribeBlenderExecutablePath,
} from "../motionFbxExportService";

type BlenderExecutablePathFieldProps = {
  disabled: boolean;
};

export function BlenderExecutablePathField({ disabled }: BlenderExecutablePathFieldProps) {
  const { t } = useTranslation("ssbh-motion");
  const [blenderPath, setBlenderPath] = useState("");

  useEffect(() => {
    setBlenderPath(getBlender51PathOverride() ?? "");
    return subscribeBlenderExecutablePath((path) => setBlenderPath(path ?? ""));
  }, []);

  const persistBlenderPath = useCallback((value: string) => {
    setBlenderPath(value);
    setBlender51PathOverride(value.trim() || null);
  }, []);

  const pickBlenderPath = useCallback(async () => {
    const picked = await open({
      title: t("fbxExport.chooseBlender"),
      multiple: false,
      filters: [{ name: "Blender", extensions: ["exe"] }],
      defaultPath: blenderPath || getDialogDefaultPath(DialogLastPathKey.ssbhBlender51Exe, undefined),
    });
    if (typeof picked !== "string" || !picked.trim()) return;
    persistBlenderPath(picked.trim());
    rememberDialogSelection(DialogLastPathKey.ssbhBlender51Exe, picked, "file");
  }, [blenderPath, persistBlenderPath, t]);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground">{t("fbxExport.blenderPath")}</span>
      <div className="flex gap-1">
        <Input
          className="h-7 text-[10px]"
          value={blenderPath}
          placeholder={t("fbxExport.autoDetect")}
          onChange={(event) => persistBlenderPath(event.target.value)}
          disabled={disabled}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 shrink-0 text-[10px]"
          disabled={disabled}
          aria-label={t("fbxExport.chooseBlender")}
          onClick={() => void pickBlenderPath()}
        >
          <FolderSearch className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
