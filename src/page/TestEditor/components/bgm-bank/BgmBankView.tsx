import { useCallback, useEffect, useRef, useState } from "react";
import { dirname } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { Package } from "lucide-react";
import { toast } from "sonner";
import { useConfigStore } from "@/store/configStore";
import { Button } from "@/components/ui/button";
import {
  resolveWorkspaceContent,
  workspacePackIdentityFromResolved,
  type ResolvedWorkspaceContentPack,
} from "@/services/testEditorWorkspace/contentCatalog";
import { promptAndMigrateWorkspaceContentIfNeeded } from "@/services/testEditorWorkspace/contentMigration";
import type { TestEditorWorkspaceDocument, WorkspacePackIdentity } from "@/services/testEditorWorkspace/types";
import { LegacyWorkspaceMoveNotice } from "../workspace-layout/LegacyWorkspaceMoveNotice";
import {
  SoundTableWorkbench,
  soundTableMissingMessage,
} from "../sound-table/SoundTableWorkbench";
import {
  BGM_BANK_UPDATE_02_PACK_HASH,
  bgmUpdate02AudioPath,
  findNus3bankFile,
} from "../bgm-table/bgmTableDocument";
import {
  buildBgmBankUpdate02SourceFhm2dPath,
  initBgmBankUpdate02Pack,
} from "../bgm-table/initBgmBankUpdate02Pack";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; folderPath: string; message: string }
  | {
      status: "ready";
      pack: ResolvedWorkspaceContentPack;
      sourceLayout: "configured" | "legacy" | "missing";
      writable: boolean;
      bankFilePath: string;
      audioPath: string;
    };

type BgmBankViewProps = {
  folderPath: string;
  isActive: boolean;
  onPackMutated?: (pack: WorkspacePackIdentity) => void;
  onRequestFhm2dRepack?: (pack: WorkspacePackIdentity) => void;
  workspaceDocument: TestEditorWorkspaceDocument;
};

const MISSING_BANK_MESSAGE = "No BGM bank nus3bank. Extract pack 0x0C568109.";

export default function BgmBankView({
  folderPath,
  isActive,
  onPackMutated,
  onRequestFhm2dRepack,
  workspaceDocument,
}: BgmBankViewProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [isInitializing, setIsInitializing] = useState(false);
  const lastLoadedKeyRef = useRef("");
  const obDplCachePath = useConfigStore((s) => s.obDplCachePath);

  const load = useCallback(async () => {
    if (!folderPath) {
      setLoadState({ status: "error", folderPath: "", message: "Folder path is empty" });
      return;
    }
    setLoadState({ status: "loading" });
    try {
      const content = await promptAndMigrateWorkspaceContentIfNeeded(
        await resolveWorkspaceContent(folderPath, workspaceDocument, "bgm-bank-update-02"),
      );
      const pack = content.existing ?? content.configured;
      if (content.sourceLayout === "missing") {
        throw new Error(MISSING_BANK_MESSAGE);
      }
      const bankFilePath = await findNus3bankFile(pack.folderPath);
      if (!bankFilePath) {
        throw new Error(MISSING_BANK_MESSAGE);
      }
      const audioPath = await bgmUpdate02AudioPath(obDplCachePath ?? "");
      setLoadState({
        status: "ready",
        pack,
        sourceLayout: content.sourceLayout,
        writable: content.writable,
        bankFilePath,
        audioPath,
      });
    } catch (error) {
      setLoadState({
        status: "error",
        folderPath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [folderPath, obDplCachePath, workspaceDocument]);

  useEffect(() => {
    if (!isActive) return;
    const key = `${folderPath}::bgm-bank-update-02`;
    if (lastLoadedKeyRef.current === key) return;
    lastLoadedKeyRef.current = key;
    void load();
  }, [folderPath, isActive, load]);

  const handleInitPack = useCallback(async () => {
    const sourceFhm2dPath = buildBgmBankUpdate02SourceFhm2dPath(obDplCachePath ?? "");
    if (!sourceFhm2dPath) {
      toast.error("Set the OB dplcache folder in FHM2D Init first");
      return;
    }
    setIsInitializing(true);
    try {
      await initBgmBankUpdate02Pack({
        sourceFhm2dPath,
        workspaceRoot: folderPath,
        workspaceDocument,
      });
      lastLoadedKeyRef.current = "";
      toast.success("Unpacked BGM_AC27_UPDATE_02 bank");
      const content = await resolveWorkspaceContent(folderPath, workspaceDocument, "bgm-bank-update-02");
      onPackMutated?.(workspacePackIdentityFromResolved(content.configured, "configured"));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsInitializing(false);
    }
  }, [folderPath, load, obDplCachePath, onPackMutated, workspaceDocument]);

  const handleRepack = useCallback(() => {
    if (loadState.status !== "ready") return;
    if (!loadState.writable) {
      toast.error("Legacy workspace content is read-only");
      return;
    }
    onRequestFhm2dRepack?.(workspacePackIdentityFromResolved(loadState.pack, "configured"));
  }, [loadState, onRequestFhm2dRepack]);

  const workbenchStatus =
    loadState.status === "ready"
      ? "ready"
      : loadState.status === "error" && soundTableMissingMessage(loadState.message)
        ? "missing"
        : loadState.status === "error"
          ? "error"
          : "loading";

  return (
    <SoundTableWorkbench
      isActive={isActive}
      title="BGM bank"
      purpose="Unpack pack 0x0C568109 (group 6 BGM_AC27_UPDATE_02.nus3bank). Add or edit cues in EXVS2 Audio Editor, then Repack. This tab does not rewrite nus3 bytes."
      status={workbenchStatus}
      errorMessage={loadState.status === "error" ? loadState.message : null}
      unpackLabel="Init pack"
      unpacking={isInitializing}
      unpackDisabled={!folderPath}
      onUnpack={() => void handleInitPack()}
      onReload={() => void load()}
      writable={loadState.status === "ready" ? loadState.writable : true}
      metaLines={
        loadState.status === "ready"
          ? [
              {
                label: "Structure",
                value: loadState.pack.structureJsonPath,
                onOpen: () => void dirname(loadState.pack.structureJsonPath).then((target) => openPath(target)),
              },
              {
                label: "Bank",
                value: loadState.bankFilePath,
                onOpen: () => void dirname(loadState.bankFilePath).then((target) => openPath(target)),
              },
              {
                label: "Pack",
                value: `${BGM_BANK_UPDATE_02_PACK_HASH}.fhm2d`,
              },
            ]
          : undefined
      }
      loadedLabel={loadState.status === "ready" ? "Ready for Audio Editor" : undefined}
      notice={
        loadState.status === "ready" ? (
          <LegacyWorkspaceMoveNotice
            workspaceRoot={folderPath}
            workspaceDocument={workspaceDocument}
            contentId="bgm-bank-update-02"
            sourceLayout={loadState.sourceLayout}
            configuredPath={loadState.pack.folderPath}
            onMoved={() => void load()}
            className="mt-2"
          />
        ) : null
      }
      listPanel={
        loadState.status === "ready" ? (
          <div className="space-y-2 rounded-md bg-muted/20 p-3 text-xs">
            <div className="font-medium">BGM_AC27_UPDATE_02.nus3bank</div>
            <div className="break-all text-muted-foreground">{loadState.bankFilePath}</div>
          </div>
        ) : null
      }
      detailPanel={
        loadState.status === "ready" ? (
          <div className="space-y-4 rounded-lg bg-muted/20 p-4">
            <div className="space-y-1 text-xs leading-5 text-muted-foreground">
              <div>1. Open this bank in EXVS2 Audio Editor.</div>
              <div>2. Add the cue name to TONE (same spelling as the .nus3audio TNNM, e.g. COLORS_Flow at index 3).</div>
              <div>3. Save the .nus3bank, then Repack this pack to data/x64/mod/0x0C568109.fhm2d.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => void dirname(loadState.bankFilePath).then((target) => openPath(target))}
              >
                Open bank folder
              </Button>
              {loadState.audioPath ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={async () => {
                    if (await exists(loadState.audioPath)) await openPath(loadState.audioPath);
                    else toast.error("Audio file not found");
                  }}
                >
                  Open audio
                </Button>
              ) : null}
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={!loadState.writable}
                onClick={handleRepack}
              >
                <Package className="mr-1 h-4 w-4" />
                Repack
              </Button>
            </div>
          </div>
        ) : null
      }
    />
  );
}
