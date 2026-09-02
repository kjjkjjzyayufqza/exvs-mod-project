import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  checkForAppUpdate,
  installAppUpdate,
  loadGithubUpdateToken,
  readAppVersion,
  saveGithubUpdateToken,
} from "@/lib/appUpdater";
import type { Update } from "@tauri-apps/plugin-updater";

import { AboutModule } from "./AboutModule";
import { AboutSpecRow } from "./AboutSpecRow";

export function AboutUpdateModule() {
  const [version, setVersion] = useState("...");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("Idle");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [available, setAvailable] = useState<Update | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [appVersion, storedToken] = await Promise.all([
          readAppVersion(),
          loadGithubUpdateToken(),
        ]);
        if (cancelled) {
          return;
        }
        setVersion(appVersion);
        if (storedToken) {
          setToken(storedToken);
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : String(error));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistToken = useCallback(async () => {
    await saveGithubUpdateToken(token);
  }, [token]);

  const onCheck = useCallback(async () => {
    setBusy(true);
    setStatus("Checking");
    setAvailable(null);
    try {
      await persistToken();
      const update = await checkForAppUpdate();
      if (!update) {
        setStatus("Up to date");
        toast.success("Already on the latest version");
        return;
      }
      setAvailable(update);
      setStatus(`Update ${update.version} available`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }, [persistToken]);

  const onInstall = useCallback(async () => {
    if (!available) {
      throw new Error("No update is available to install");
    }
    setBusy(true);
    setProgress(0);
    setStatus(`Downloading ${available.version}`);
    try {
      await persistToken();
      let received = 0;
      let total = 0;
      await installAppUpdate(available, (event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
          received = 0;
          setProgress(total > 0 ? 0 : null);
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
          if (total > 0) {
            setProgress(Math.min(100, Math.round((received / total) * 100)));
          }
        } else if (event.event === "Finished") {
          setProgress(100);
        }
      });
      setStatus("Installer launched");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message);
      toast.error(message);
      setBusy(false);
    }
  }, [available, persistToken]);

  return (
    <AboutModule index="05" kicker="Release" title="Auto-update" className="mt-4">
      <dl>
        <AboutSpecRow label="Installed">{version}</AboutSpecRow>
        <AboutSpecRow label="Status">
          <span className="font-mono text-xs">
            {status}
            {progress !== null ? ` · ${progress}%` : ""}
          </span>
        </AboutSpecRow>
        <AboutSpecRow label="GitHub token">
          <Input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            onBlur={() => {
              void persistToken();
            }}
            placeholder="Fine-grained PAT with Contents: Read"
            disabled={busy}
          />
        </AboutSpecRow>
      </dl>
      <p className="mt-3 text-xs leading-relaxed">
        Push to the <span className="font-mono">release</span> branch to publish.
        This repository is private, so auto-update needs a GitHub token that can
        read Releases. Optional if <span className="font-mono">EXVS_UPDATER_GITHUB_TOKEN</span>{" "}
        is already set in the environment.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void onCheck()}>
          Check for updates
        </Button>
        <Button
          type="button"
          disabled={busy || !available}
          onClick={() => void onInstall()}
        >
          Install update
        </Button>
      </div>
    </AboutModule>
  );
}
