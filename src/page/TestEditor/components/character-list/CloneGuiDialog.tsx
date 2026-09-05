import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { Copy, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useConfigStore } from "@/store/configStore";
import type { CharacterListData, CharacterListEntry } from "@/models/characterListEntry";
import {
  applyCharacterGuiFieldUpdates,
  clonedGuiPackIdentity,
  CloneGuiSetResult,
  ClonedGuiPack,
  formatGuiHashHex,
  guiCloneFieldLabel,
  isMsGuiCloneKey,
  isNaviGuiCloneKey,
  isPilotGuiCloneKey,
  MIXED_GUI_CLONE_DONOR_ENTRY_ID,
  NAVI_LIST_PACK_HASH_HEX,
  overlayClonedGuiPack,
} from "./guiClonePlan";
import {
  resolveWorkspaceContent,
  workspacePackIdentityFromResolved,
} from "@/services/testEditorWorkspace/contentCatalog";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "@/services/testEditorWorkspace/defaults";
import type { TestEditorWorkspaceDocument, WorkspacePackIdentity } from "@/services/testEditorWorkspace/types";

interface CloneGuiDialogProps {
  open: boolean;
  targetEntry: CharacterListEntry | null;
  characterList: CharacterListData;
  writable: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: (nextList: CharacterListData, result: CloneGuiSetResult) => void;
  onPackMutated?: (pack: WorkspacePackIdentity) => void;
  onRevealTreeFolder?: (path: string) => void;
  onJumpToNaviList?: (uniqueId: number) => void;
  workspaceDocument?: TestEditorWorkspaceDocument;
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function packFileName(hash: number): string {
  return `${formatGuiHashHex(hash)}.fhm2d`;
}

function groupCheckedState(keys: string[], selected: Set<string>): boolean | "indeterminate" {
  const selectedCount = keys.filter((key) => selected.has(key)).length;
  if (keys.length === 0 || selectedCount === 0) return false;
  if (selectedCount === keys.length) return true;
  return "indeterminate";
}

export function CloneGuiDialog({
  open,
  targetEntry,
  characterList,
  writable,
  onOpenChange,
  onApplied,
  onPackMutated,
  onRevealTreeFolder,
  onJumpToNaviList,
  workspaceDocument = DEFAULT_TEST_EDITOR_WORKSPACE,
}: CloneGuiDialogProps) {
  const { t } = useTranslation("test-clone-gui");
  const obDplCachePath = useConfigStore((s) => s.obDplCachePath);
  const testEditorFolder = useConfigStore((s) => s.testEditorFolder);
  const obModPath = useConfigStore((s) => s.obModPath);

  const [donorEntryId, setDonorEntryId] = useState("");
  const [copyToObMod, setCopyToObMod] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [structureNames, setStructureNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<CloneGuiSetResult | null>(null);
  const [completed, setCompleted] = useState<CloneGuiSetResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const targetEntryId = targetEntry?.entryId ?? 0;
  const mixedDonor = Number(donorEntryId) === MIXED_GUI_CLONE_DONOR_ENTRY_ID;
  const donorEntry = useMemo(() => {
    const id = Number(donorEntryId);
    if (!id) return null;
    return characterList.entries.find((entry) => entry.entryId === id) ?? null;
  }, [characterList.entries, donorEntryId]);
  const workspaceGuiRoot = `${(testEditorFolder ?? "").trim().replace(/[\\/]+$/, "")}\\009gui`;

  const previewRequest = useMemo(
    () => ({
      dplCachePath: (obDplCachePath ?? "").trim(),
      workspaceRoot: (testEditorFolder ?? "").trim(),
      obModPath: (obModPath ?? "").trim() || null,
      copyToObMod: false,
      targetEntryId,
      donorEntryId: Number(donorEntryId) || 0,
      clonePilot: true,
      cloneNavi: true,
      characterList: { entries: characterList.entries },
    }),
    [
      characterList.entries,
      donorEntryId,
      obDplCachePath,
      obModPath,
      targetEntryId,
      testEditorFolder,
    ],
  );

  useEffect(() => {
    if (!open) return;
    setDonorEntryId("");
    setCopyToObMod(false);
    setSelectedKeys(new Set());
    setStructureNames({});
    setPreview(null);
    setCompleted(null);
    setError(null);
  }, [open, targetEntryId]);

  const loadPreview = useCallback(async () => {
    if (!writable) {
      throw new Error(t("errors.readOnly"));
    }
    if (!previewRequest.dplCachePath) {
      throw new Error(t("errors.dplcachePath"));
    }
    if (!previewRequest.workspaceRoot) {
      throw new Error(t("errors.workspaceFolder"));
    }
    if (!previewRequest.targetEntryId) {
      throw new Error(t("errors.selectCharacter"));
    }
    if (!previewRequest.donorEntryId) {
      throw new Error(t("errors.donorId"));
    }
    return invoke<CloneGuiSetResult>("clone_character_gui_set", {
      request: {
        ...previewRequest,
        preview: true,
      },
    });
  }, [previewRequest, writable]);

  useEffect(() => {
    if (!open || !targetEntryId) return;
    if (!previewRequest.donorEntryId) {
      setBusy(false);
      setError(null);
      setPreview(null);
      setSelectedKeys(new Set());
      return;
    }
    let cancelled = false;
    setBusy(true);
    setError(null);
    void loadPreview()
      .then((result) => {
        if (cancelled) return;
        setPreview(result);
        setSelectedKeys(new Set(result.packs.map((pack) => pack.fieldKey)));
        setStructureNames(
          Object.fromEntries(
            result.packs.map((pack) => [pack.fieldKey, pack.structureName || pack.donorName]),
          ),
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPreview(null);
        setSelectedKeys(new Set());
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadPreview, open, targetEntryId]);

  const pilotPacks = useMemo(
    () => (preview?.packs ?? []).filter((pack) => isPilotGuiCloneKey(pack.fieldKey)),
    [preview],
  );
  const naviPacks = useMemo(
    () => (preview?.packs ?? []).filter((pack) => isNaviGuiCloneKey(pack.fieldKey)),
    [preview],
  );
  const msPacks = useMemo(
    () => (preview?.packs ?? []).filter((pack) => isMsGuiCloneKey(pack.fieldKey)),
    [preview],
  );
  const selectedCount = selectedKeys.size;
  const selectedPilotCount = pilotPacks.filter((pack) => selectedKeys.has(pack.fieldKey)).length;
  const selectedMsCount = msPacks.filter((pack) => selectedKeys.has(pack.fieldKey)).length;
  const selectedNaviCount = naviPacks.filter((pack) => selectedKeys.has(pack.fieldKey)).length;

  function setGroupSelected(packs: ClonedGuiPack[], checked: boolean) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const pack of packs) {
        if (checked) next.add(pack.fieldKey);
        else next.delete(pack.fieldKey);
      }
      return next;
    });
  }

  function toggleRow(fieldKey: string, checked: boolean) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(fieldKey);
      else next.delete(fieldKey);
      return next;
    });
  }

  async function handleConfirm() {
    if (selectedCount === 0) {
      setError(t("errors.selectRow"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const selectedFieldKeys = [...selectedKeys];
      const result = await invoke<CloneGuiSetResult>("clone_character_gui_set", {
        request: {
          ...previewRequest,
          copyToObMod,
          clonePilot: selectedPilotCount + selectedMsCount > 0,
          cloneNavi: selectedNaviCount > 0,
          selectedFieldKeys,
          structureNames: Object.fromEntries(
            selectedFieldKeys.map((key) => [key, structureNames[key] || ""]),
          ),
          preview: false,
        },
      });
      if (!targetEntry) {
        throw new Error(t("errors.selectCharacter"));
      }
      const nextEntries = characterList.entries.map((entry) =>
        entry.entryId === targetEntry.entryId
          ? applyCharacterGuiFieldUpdates(entry, result.characterFieldUpdates)
          : entry,
      );
      onApplied({ ...characterList, entries: nextEntries }, result);
      setCompleted(result);
      for (const pack of result.packs) {
        onPackMutated?.(clonedGuiPackIdentity(pack));
      }
      if (result.navi) {
        try {
          const naviContent = await resolveWorkspaceContent(
            previewRequest.workspaceRoot,
            workspaceDocument,
            "navi-list",
          );
          onPackMutated?.(
            workspacePackIdentityFromResolved(
              naviContent.existing ?? naviContent.configured,
              naviContent.sourceLayout === "legacy" ? "legacy" : "configured",
            ),
          );
        } catch {
          // Navi bind still succeeded; Repack list remains a manual follow-up.
        }
      }
      const firstFolder = result.packs[0]?.outputPath;
      if (firstFolder) onRevealTreeFolder?.(firstFolder);
      const naviLine = result.navi
        ? ` ${t("success.naviLine", { uniqueId: result.navi.newCharacterUniqueId, hash: NAVI_LIST_PACK_HASH_HEX })}`
        : "";
      toast.success(t("success.cloned", { count: result.packs.length }), {
        description: t("success.clonedDescription", { workspace: workspaceGuiRoot, naviLine }),
        action: firstFolder
          ? {
              label: t("actions.openFolder"),
              onClick: () => {
                void openPath(firstFolder);
              },
            }
          : undefined,
      });
      if (result.navi && onJumpToNaviList) {
        const uniqueId = result.navi.newCharacterUniqueId;
        toast.success(t("success.naviUpdated"), {
          description: t("success.naviUpdatedDescription", { count: result.navi.appendedEntryIds.length, hash: NAVI_LIST_PACK_HASH_HEX }),
          action: {
            label: t("actions.openNaviList"),
            onClick: () => onJumpToNaviList(uniqueId),
          },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error(t("errors.cloneFailed", { message }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-5xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("help.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t("fields.targetId")}</Label>
              <Input value={targetEntryId || ""} readOnly />
            </div>
            <div className="space-y-1">
              <Label>{t("fields.donorId")}</Label>
              <Input
                value={donorEntryId}
                onChange={(event) => setDonorEntryId(event.target.value)}
                placeholder={t("placeholders.donorId")}
              />
              {donorEntry ? (
                <div className="text-xs text-muted-foreground">
                  {donorEntry.characterName || t("status.unnamed")} · {t("status.unique")} {donorEntry.characterUniqueId}
                </div>
              ) : Number(donorEntryId) ? (
                <div className="text-xs text-destructive">{t("errors.donorNotFound")}</div>
              ) : null}
            </div>
          </div>

          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <div>{t("fields.workspaceOutput")}: {workspaceGuiRoot || t("status.workspaceUnset")}</div>
            <div>{t("help.unpack")}</div>
            {copyToObMod && obModPath ? (
              <div>{t("help.repackTo")}: {obModPath}\0xNEW.fhm2d</div>
            ) : null}
          </div>

          {mixedDonor ? (
            <p className="text-sm text-amber-600">
              {t("warnings.mixedDonor")}
            </p>
          ) : null}

          <label className="inline-flex items-center gap-2 text-sm">
            <Checkbox
              checked={copyToObMod}
              onCheckedChange={(value) => setCopyToObMod(value === true)}
              disabled={!obModPath}
            />
            {t("actions.copyToObMod")}
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setSelectedKeys(new Set((preview?.packs ?? []).map((pack) => pack.fieldKey)))}
              disabled={!preview}
            >
              {t("actions.selectAll")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setSelectedKeys(new Set())}
              disabled={!preview}
            >
              {t("actions.selectNone")}
            </Button>
            <span className="text-xs text-muted-foreground">{t("status.selected", { count: selectedCount })}</span>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {(preview?.warnings ?? []).map((warning) => (
            <p key={warning} className="text-sm text-amber-600">
              {t("warnings.backend", { message: warning })}
            </p>
          ))}

          <PackGroup
            title={t("groups.pilot.title")}
            hint={t("groups.pilot.hint")}
            packs={pilotPacks}
            selectedKeys={selectedKeys}
            copyToObMod={copyToObMod}
            groupState={groupCheckedState(
              pilotPacks.map((pack) => pack.fieldKey),
              selectedKeys,
            )}
            onToggleGroup={(checked) => setGroupSelected(pilotPacks, checked)}
            onToggleRow={toggleRow}
            structureNames={structureNames}
            targetEntryId={targetEntryId}
            workspaceGuiRoot={workspaceGuiRoot}
            onStructureNameChange={(fieldKey, value) =>
              setStructureNames((prev) => ({ ...prev, [fieldKey]: value }))
            }
            disabled={busy || Boolean(completed)}
          />
          <PackGroup
            title={t("groups.ms.title")}
            hint={t("groups.ms.hint")}
            packs={msPacks}
            selectedKeys={selectedKeys}
            copyToObMod={copyToObMod}
            groupState={groupCheckedState(
              msPacks.map((pack) => pack.fieldKey),
              selectedKeys,
            )}
            onToggleGroup={(checked) => setGroupSelected(msPacks, checked)}
            onToggleRow={toggleRow}
            structureNames={structureNames}
            targetEntryId={targetEntryId}
            workspaceGuiRoot={workspaceGuiRoot}
            onStructureNameChange={(fieldKey, value) =>
              setStructureNames((prev) => ({ ...prev, [fieldKey]: value }))
            }
            disabled={busy || Boolean(completed)}
          />
          <PackGroup
            title={t("groups.navi.title")}
            hint={t("groups.navi.hint", { hash: NAVI_LIST_PACK_HASH_HEX })}
            packs={naviPacks}
            selectedKeys={selectedKeys}
            copyToObMod={copyToObMod}
            groupState={groupCheckedState(
              naviPacks.map((pack) => pack.fieldKey),
              selectedKeys,
            )}
            onToggleGroup={(checked) => setGroupSelected(naviPacks, checked)}
            onToggleRow={toggleRow}
            structureNames={structureNames}
            targetEntryId={targetEntryId}
            workspaceGuiRoot={workspaceGuiRoot}
            onStructureNameChange={(fieldKey, value) =>
              setStructureNames((prev) => ({ ...prev, [fieldKey]: value }))
            }
            disabled={busy || Boolean(completed)}
          />

          {!preview && !busy ? (
            <p className="text-sm text-muted-foreground">{t("status.previewEmpty")}</p>
          ) : null}

          {completed ? (
            <section className="space-y-2 rounded-md border border-emerald-700/40 bg-emerald-950/20 p-3">
              <div className="text-sm font-medium">{t("status.finished")}</div>
              <div className="text-xs text-muted-foreground">
                {t("help.finished")}
              </div>
              {completed.navi ? (
                <div className="text-xs">
                  navi_list: unique id {completed.navi.newCharacterUniqueId}, appended{" "}
                  {completed.navi.appendedEntryIds.join(", ") || "(none)"}, file{" "}
                  <span className="font-mono">{completed.navi.naviListPath}</span>
                </div>
              ) : null}
              <div className="space-y-2">
                {completed.packs.map((pack) => (
                  <div key={pack.fieldKey} className="rounded border bg-background/60 p-2 font-mono text-[11px]">
                  <div>{t("labels.field")}={pack.fieldKey}</div>
                  <div>{t("labels.name")}={pack.structureName || pack.donorName}</div>
                  <div>{t("labels.hashName")}={pack.newFileName.replace(/\.fhm2d$/i, "")}</div>
                  <div>{t("labels.innerFiles")}={pack.innerFileCount} {t("labels.bytes")}={pack.byteLen}</div>
                  <div className="break-all">{t("labels.extract")}={pack.outputPath}</div>
                  <div className="break-all">{t("labels.structureJson")}={pack.structureJsonPath}</div>
                  <div>{t("labels.bind")}={pack.bindTarget}</div>
                    {pack.outputPath ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-1 h-7"
                        onClick={() => {
                          onRevealTreeFolder?.(pack.outputPath);
                          void openPath(pack.outputPath);
                        }}
                      >
                        <FolderOpen className="mr-1 h-3.5 w-3.5" />
                        {t("actions.openFolder")}
                      </Button>
                    ) : null}
                    {pack.obModOutputPath ? (
                      <div className="break-all">{t("labels.obMod")}={pack.obModOutputPath}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {completed ? t("actions.close") : t("actions.cancel")}
          </Button>
          <Button
            onClick={() => void handleConfirm()}
            disabled={busy || !writable || !preview || selectedCount === 0 || Boolean(completed)}
          >
            <Copy className="mr-1.5 h-4 w-4" />
            {busy ? t("status.working") : t("actions.clone", { count: selectedCount })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PackGroup({
  title,
  hint,
  packs,
  selectedKeys,
  copyToObMod,
  groupState,
  onToggleGroup,
  onToggleRow,
  structureNames,
  targetEntryId,
  workspaceGuiRoot,
  onStructureNameChange,
  disabled,
}: {
  title: string;
  hint: string;
  packs: ClonedGuiPack[];
  selectedKeys: Set<string>;
  copyToObMod: boolean;
  groupState: boolean | "indeterminate";
  onToggleGroup: (checked: boolean) => void;
  onToggleRow: (fieldKey: string, checked: boolean) => void;
  structureNames: Record<string, string>;
  targetEntryId: number;
  workspaceGuiRoot: string;
  onStructureNameChange: (fieldKey: string, value: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation("test-clone-gui");
  if (packs.length === 0) return null;
  return (
    <section className="space-y-2">
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          className="mt-0.5"
          checked={groupState}
          onCheckedChange={(value) => onToggleGroup(value === true)}
        />
        <span>
          <span className="font-medium">{title}</span>
          <span className="ml-2 text-xs text-muted-foreground">{hint}</span>
        </span>
      </label>
      <div className="space-y-2">
        {packs.map((pack) => {
          const displayed = overlayClonedGuiPack(
            pack,
            structureNames[pack.fieldKey] ?? pack.donorName,
            targetEntryId,
            workspaceGuiRoot,
          );
          const donorFile = displayed.donorFileName || packFileName(displayed.donorHash);
          const newFile = displayed.newFileName || packFileName(displayed.newHash);
          const checked = selectedKeys.has(pack.fieldKey);
          const renamed = displayed.structureName !== pack.donorName;
          return (
            <div
              key={pack.fieldKey}
              className="flex gap-3 rounded-md border p-3 text-xs has-[[data-state=unchecked]]:opacity-60"
            >
              <Checkbox
                className="mt-0.5"
                checked={checked}
                onCheckedChange={(value) => onToggleRow(pack.fieldKey, value === true)}
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-medium text-sm text-foreground">
                    {guiCloneFieldLabel(pack.fieldKey)}
                  </span>
                  <span className="font-mono text-muted-foreground">{pack.fieldKey}</span>
                  <span className="text-muted-foreground">{formatByteSize(pack.byteLen)}</span>
                </div>
                <div className="text-muted-foreground">
                  {t("labels.bind")}: <span className="font-mono text-foreground">{pack.bindTarget || pack.fieldKey}</span>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">{t("labels.structureName")}</div>
                  <Input
                    value={structureNames[pack.fieldKey] ?? pack.donorName}
                    onChange={(event) => onStructureNameChange(pack.fieldKey, event.target.value)}
                    disabled={disabled || !checked}
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div>
                  {t("labels.hashName")}:{" "}
                  <span className="font-mono">{donorFile}</span>
                  <span className="px-1 text-muted-foreground">→</span>
                  <span className="font-mono">{newFile}</span>
                </div>
                <div className="text-muted-foreground">
                  {t("help.hashName", { suffix: renamed ? t("help.renamedSuffix") : t("help.sameNameSuffix") })}
                </div>
                {displayed.outputPath ? (
                  <div className="break-all">
                    {t("labels.modWorkspace")}: <span className="font-mono">{displayed.outputPath}</span>
                  </div>
                ) : null}
                <div className="break-all">
                  {t("labels.unpackFrom")}: <span className="font-mono">{pack.sourcePath}</span>
                </div>
                {displayed.structureJsonPath ? (
                  <div className="break-all">
                    {t("labels.structure")}: <span className="font-mono">{displayed.structureJsonPath}</span>
                  </div>
                ) : null}
                {copyToObMod && pack.obModOutputPath ? (
                  <div className="break-all">
                    {t("labels.repackObMod")}: <span className="font-mono">{pack.obModOutputPath}</span>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
