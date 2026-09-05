import { useEffect, useState } from "react";
import { dirname } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStageFileNamePaths } from "./stageFileNameRef";
import { useTranslation } from "react-i18next";

interface StageFileNameStatusIconsProps {
  fileNameValue: number;
  obDplCachePath: string;
  obModPath: string;
  stageModelRouteRootPath: string;
  onReveal?: (path: string) => void;
}

function StatusBadge({
  exists: fileExists,
  label,
  tooltip,
  onClick,
}: {
  exists: boolean | null;
  label: string;
  tooltip: string;
  onClick?: () => void;
}) {
  const { t } = useTranslation("test-stage-list-view");
  if (fileExists === null) {
    return (
      <div className="w-3 h-3 animate-pulse bg-muted rounded-full" aria-label={t("fileNameStatus.loadingAria", { label })} />
    );
  }
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 px-1 py-0.5 rounded bg-muted/50 border text-[9px] font-bold transition-colors",
        onClick && "cursor-pointer hover:bg-accent hover:text-accent-foreground active:bg-accent/80"
      )}
      title={tooltip}
      onClick={onClick}
    >
      <span className="text-muted-foreground">{label}</span>
      {fileExists ? (
        <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />
      ) : (
        <XCircle className="h-2.5 w-2.5 text-destructive" />
      )}
    </div>
  );
}

export function StageFileNameStatusIcons({
  fileNameValue,
  obDplCachePath,
  obModPath,
  stageModelRouteRootPath,
  onReveal,
}: StageFileNameStatusIconsProps) {
  const { t } = useTranslation("test-stage-list-view");
  const [paths, setPaths] = useState<{
    obFilePath: string;
    modFilePath: string;
    wsFolderPath: string;
  } | null>(null);
  const [obExists, setObExists] = useState<boolean | null>(null);
  const [modExists, setModExists] = useState<boolean | null>(null);
  const [wsExists, setWsExists] = useState<boolean | null>(null);

  useEffect(() => {
    const run = async () => {
      if (fileNameValue === 0) {
        setPaths(null);
        setObExists(false);
        setModExists(false);
        setWsExists(false);
        return;
      }
      const p = await getStageFileNamePaths(
        fileNameValue,
        obDplCachePath,
        obModPath,
        stageModelRouteRootPath,
      );
      setPaths({ obFilePath: p.obFilePath, modFilePath: p.modFilePath, wsFolderPath: p.wsFolderPath });
      setObExists(p.obFilePath ? await exists(p.obFilePath) : false);
      setModExists(p.modFilePath ? await exists(p.modFilePath) : false);
      setWsExists(p.wsFolderPath ? await exists(p.wsFolderPath) : false);
    };
    void run();
  }, [fileNameValue, obDplCachePath, obModPath, stageModelRouteRootPath]);

  const handleOpenObFolder = async () => {
    if (!paths?.obFilePath) return;
    try {
      const folder = await dirname(paths.obFilePath);
      await openPath(folder);
    } catch (err) {
      console.error("Failed to open OB folder:", err);
      toast.error(t("errors.openSourceFailed"));
    }
  };

  const handleOpenModFolder = async () => {
    if (!paths?.modFilePath) return;
    try {
      const folder = await dirname(paths.modFilePath);
      await openPath(folder);
    } catch (err) {
      console.error("Failed to open MOD folder:", err);
      toast.error(t("errors.openModFailed"));
    }
  };

  if (fileNameValue === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-0.5 ml-auto shrink-0">
      <StatusBadge
        exists={obExists}
        label="OB"
        tooltip={obExists ? t("fileNameStatus.sourceExists") : t("fileNameStatus.sourceMissing")}
        onClick={obExists ? handleOpenObFolder : undefined}
      />
      <StatusBadge
        exists={modExists}
        label="MOD"
        tooltip={modExists ? t("fileNameStatus.modExists") : t("fileNameStatus.modMissing")}
        onClick={modExists ? handleOpenModFolder : undefined}
      />
      <StatusBadge
        exists={wsExists}
        label="WS"
        tooltip={wsExists ? t("fileNameStatus.wsExists") : t("fileNameStatus.wsMissing")}
        onClick={wsExists && paths?.wsFolderPath ? () => onReveal?.(paths.wsFolderPath) : undefined}
      />
    </div>
  );
}
