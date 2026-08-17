import { useEffect, useState } from "react";
import { exists } from "@tauri-apps/plugin-fs";
import { ArchiveRestore, FolderOpen, Loader2, PackageOpen } from "lucide-react";
import { toast } from "sonner";

import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { useConfigStore } from "@/store/configStore";
import {
  extractExvsCommonBundle,
  resolveExvsCommonBundlePaths,
  type ExvsCommonBundlePaths,
} from "../utils/exvsCommonService";

const DIMENSIONS = {
  width: 620,
  height: 460,
  minWidth: 520,
  minHeight: 360,
};

type ExvsCommonBundleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpened: (modelRoot: string) => void | Promise<void>;
};

export function ExvsCommonBundleDialog({
  open,
  onOpenChange,
  onOpened,
}: ExvsCommonBundleDialogProps) {
  const extractOutputPath = useConfigStore((state) => state.extractOutputPath ?? "");
  const obDplCachePath = useConfigStore((state) => state.obDplCachePath ?? "");
  const obModPath = useConfigStore((state) => state.obModPath ?? "");
  const [paths, setPaths] = useState<ExvsCommonBundlePaths | null>(null);
  const [workspaceExists, setWorkspaceExists] = useState(false);
  const [sourceExists, setSourceExists] = useState(false);
  const [checking, setChecking] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setChecking(true);
    setError(null);
    void resolveExvsCommonBundlePaths({ extractOutputPath, obDplCachePath, obModPath })
      .then(async (resolved) => {
        const [hasRoot, hasStructure, hasSource] = await Promise.all([
          exists(resolved.modelRoot),
          exists(resolved.structureJson),
          exists(resolved.sourceFhm2d),
        ]);
        if (cancelled) return;
        setPaths(resolved);
        setWorkspaceExists(hasRoot && hasStructure);
        setSourceExists(hasSource);
      })
      .catch((reason) => {
        if (cancelled) return;
        setPaths(null);
        setWorkspaceExists(false);
        setSourceExists(false);
        setError(String(reason));
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [extractOutputPath, obDplCachePath, obModPath, open]);

  const openExisting = async () => {
    if (!paths || !workspaceExists) return;
    setWorking(true);
    try {
      await onOpened(paths.modelRoot);
      onOpenChange(false);
    } finally {
      setWorking(false);
    }
  };

  const extract = async (overwrite: boolean) => {
    if (!paths) return;
    setWorking(true);
    try {
      const result = await extractExvsCommonBundle({
        extractOutputPath,
        obDplCachePath,
        overwrite,
      });
      toast.success(overwrite ? "EXVS Common re-extracted" : "EXVS Common extracted", {
        description: `${result.uniquePhysicalFiles} physical files, ${result.logicalReferenceCount} logical resources`,
      });
      if (result.backupModelRoot) {
        toast.info("Previous Common workspace backed up", {
          description: result.backupModelRoot,
        });
      }
      await onOpened(result.modelRoot);
      onOpenChange(false);
    } catch (reason) {
      toast.error("EXVS Common extraction failed", { description: String(reason) });
    } finally {
      setWorking(false);
    }
  };

  if (!open) return null;

  return (
    <AppRndModalShell
      titleId="exvs-common-bundle-title"
      title="Open / Extract EXVS Common"
      subtitle="DPLCache source only. Camera, system, model, texture, and SHL stay under 002chara."
      headerIcon={<ArchiveRestore className="h-5 w-5 text-primary" />}
      dimensions={DIMENSIONS}
      storageKey="app.rnd-size.exvs-common-bundle"
      onClose={() => onOpenChange(false)}
      closeDisabled={working}
      footer={
        <div className="flex flex-wrap justify-end gap-2 p-3">
          <Button variant="outline" disabled={working} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {workspaceExists ? (
            <>
              <Button variant="secondary" disabled={working} onClick={() => void openExisting()}>
                <FolderOpen className="mr-1.5 h-4 w-4" /> Open Existing
              </Button>
              <Button disabled={working || !sourceExists} onClick={() => void extract(true)}>
                {working ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <ArchiveRestore className="mr-1.5 h-4 w-4" />
                )}
                Re-extract + Backup
              </Button>
            </>
          ) : (
            <Button disabled={working || !sourceExists} onClick={() => void extract(false)}>
              {working ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <PackageOpen className="mr-1.5 h-4 w-4" />
              )}
              Extract EXVS Common
            </Button>
          )}
        </div>
      }
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-xs">
        {checking ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking configured paths...
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive">
            {error}
          </div>
        ) : paths ? (
          <>
            <div className="rounded-md bg-muted/20 p-3">
              <div className="text-muted-foreground">DPLCache source</div>
              <div className="break-all font-mono text-[11px] tabular-nums">{paths.sourceFhm2d}</div>
              <div className={sourceExists ? "mt-1 text-emerald-600" : "mt-1 text-destructive"}>
                {sourceExists ? "Source found" : "Source missing"}
              </div>
            </div>
            <div className="rounded-md bg-muted/20 p-3">
              <div className="text-muted-foreground">Workspace</div>
              <div className="break-all font-mono text-[11px] tabular-nums">{paths.modelRoot}</div>
              <div className="mt-1 text-muted-foreground">
                {workspaceExists ? "Existing Common workspace found" : "No existing workspace"}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AppRndModalShell>
  );
}
