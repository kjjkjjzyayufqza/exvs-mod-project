import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppUpdateDialog } from "@/components/AppUpdateDialog";
import {
  accumulateDownloadProgress,
  installAppUpdate,
  loadAppUpdatePrompt,
  type AppUpdatePrompt,
} from "@/lib/appUpdater";

type AppUpdatePromptHostProps = {
  enabled?: boolean;
};

export function AppUpdatePromptHost({ enabled = true }: AppUpdatePromptHostProps) {
  const { t } = useTranslation("shared");
  const [prompt, setPrompt] = useState<AppUpdatePrompt | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const nextPrompt = await loadAppUpdatePrompt();
      if (!cancelled && nextPrompt) {
        setPrompt(nextPrompt);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!prompt) {
    return null;
  }

  const handleUpdate = () => {
    setInstalling(true);
    setErrorMessage(null);
    let progress = { received: 0, total: 0 };
    void installAppUpdate(prompt.update, (event) => {
      const next = accumulateDownloadProgress(progress, event);
      progress = { received: next.received, total: next.total };
      setProgressPercent(next.percent);
    }).catch(() => {
      setInstalling(false);
      setProgressPercent(null);
      setErrorMessage(t("updater.failed"));
    });
  };

  return (
    <AppUpdateDialog
      currentVersion={prompt.currentVersion}
      latestVersion={prompt.latestVersion}
      changelog={prompt.changelog}
      installing={installing}
      progressPercent={progressPercent}
      errorMessage={errorMessage}
      onSkip={() => {
        if (!installing) {
          setPrompt(null);
        }
      }}
      onUpdate={handleUpdate}
    />
  );
}
