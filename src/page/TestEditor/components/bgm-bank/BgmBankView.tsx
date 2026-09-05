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
import { useTranslation } from "react-i18next";

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

export default function BgmBankView({
  folderPath,
  isActive,
  onPackMutated,
  onRequestFhm2dRepack,
  workspaceDocument,
}: BgmBankViewProps) {
  const { t } = useTranslation("test-lists");
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [isInitializing, setIsInitializing] = useState(false);
  const lastLoadedKeyRef = useRef("");
  const obDplCachePath = useConfigStore((s) => s.obDplCachePath);

  const load = useCallback(async () => {
    if (!folderPath) {
      setLoadState({ status: "error", folderPath: "", message: t("common.folderPathEmpty") });
      return;
    }
    setLoadState({ status: "loading" });
    try {
      const content = await promptAndMigrateWorkspaceContentIfNeeded(
        await resolveWorkspaceContent(folderPath, workspaceDocument, "bgm-bank-update-02"),
      );
      const pack = content.existing ?? content.configured;
      if (content.sourceLayout === "missing") {
        throw new Error(t("bgmBank.missingBank"));
      }
      const bankFilePath = await findNus3bankFile(pack.folderPath);
      if (!bankFilePath) {
        throw new Error(t("bgmBank.missingBank"));
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
      toast.error(t("common.setObDplcacheInit"));
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
      toast.success(t("bgmBank.unpacked"));
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
      toast.error(t("common.legacyReadOnlyShort"));
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
      title={t("bgmBank.title")}
      purpose={t("bgmBank.purpose")}
      status={workbenchStatus}
      errorMessage={loadState.status === "error" ? loadState.message : null}
      unpackLabel={t("common.initPack")}
      unpacking={isInitializing}
      unpackDisabled={!folderPath}
      onUnpack={() => void handleInitPack()}
      onReload={() => void load()}
      writable={loadState.status === "ready" ? loadState.writable : true}
      metaLines={
        loadState.status === "ready"
          ? [
              {
                label: t("common.structure"),
                value: loadState.pack.structureJsonPath,
                onOpen: () => void dirname(loadState.pack.structureJsonPath).then((target) => openPath(target)),
              },
              {
                label: t("common.bank"),
                value: loadState.bankFilePath,
                onOpen: () => void dirname(loadState.bankFilePath).then((target) => openPath(target)),
              },
              {
                label: t("common.pack"),
                value: `${BGM_BANK_UPDATE_02_PACK_HASH}.fhm2d`,
              },
            ]
          : undefined
      }
      loadedLabel={loadState.status === "ready" ? t("bgmBank.ready") : undefined}
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
            <div className="font-medium" data-i18n-ignore="">
              {t("bgmBank.fileName")}
            </div>
            <div className="break-all text-muted-foreground">{loadState.bankFilePath}</div>
          </div>
        ) : null
      }
      detailPanel={
        loadState.status === "ready" ? (
          <div className="space-y-4 rounded-lg bg-muted/20 p-4">
            <div className="space-y-1 text-xs leading-5 text-muted-foreground">
              <div>{t("bgmBank.step1")}</div>
              <div>{t("bgmBank.step2")}</div>
              <div>{t("bgmBank.step3")}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => void dirname(loadState.bankFilePath).then((target) => openPath(target))}
              >
                {t("common.openBankFolder")}
              </Button>
              {loadState.audioPath ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={async () => {
                    if (await exists(loadState.audioPath)) await openPath(loadState.audioPath);
                    else toast.error(t("common.audioNotFound"));
                  }}
                >
                  {t("common.openAudio")}
                </Button>
              ) : null}
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={!loadState.writable}
                onClick={handleRepack}
              >
                <Package className="mr-1 h-4 w-4" />
                {t("common.repack")}
              </Button>
            </div>
          </div>
        ) : null
      }
    />
  );
}
