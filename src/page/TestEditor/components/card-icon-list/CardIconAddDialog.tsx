import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { basename, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2, X } from "lucide-react";

import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilePathInput } from "@/components/ui/filePathInput";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DDS_FORMATS } from "@/lib/ddsFormats";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { appendCardIconToStructureJson } from "./cardIconStructure";
import { useTranslation } from "react-i18next";

type ReplaceSummary = {
  outputNutexbPath: string;
  previewPngPath: string;
  nutexbName: string;
};

type BatchItemStatus = "pending" | "processing" | "success" | "error" | "skipped" | "cancelled";

type BatchItem = {
  id: string;
  pngPath: string;
  sourceFileName: string;
  nameInput: string;
  status: BatchItemStatus;
  progress: number;
  message?: string;
  result?: ReplaceSummary;
};

const BATCH_ADD_ROW_ESTIMATE_SIZE = 152;
const CARD_ICON_ADD_MODAL_DIMENSIONS = {
  width: 1020,
  height: 820,
  minWidth: 760,
  minHeight: 600,
};

interface CardIconAddDialogProps {
  packFolderPath: string;
  hash: string;
  convertDirPath: string;
  structurePath: string;
  nextIndex: number;
  onAdded: () => Promise<void> | void;
  disabled?: boolean;
}

function containsInvalidFileChars(name: string): boolean {
  return /[\\/:*?"<>|]/.test(name);
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, "");
}

function isPngPath(filePath: string): boolean {
  return /\.png$/i.test(filePath);
}

function buildExistingNameSet(structJson: unknown): Set<string> {
  const json = structJson as any;
  const existing = Array.isArray(json?.SubFileData) ? json.SubFileData : [];
  const set = new Set<string>();
  for (const item of existing) {
    const url = typeof item?.fileUrl === "string" ? item.fileUrl : "";
    if (!url) continue;
    const lower = url.toLowerCase();
    if (!lower.endsWith(".nutexb")) continue;
    const sepIndex = Math.max(lower.lastIndexOf("/"), lower.lastIndexOf("\\"));
    const base = sepIndex >= 0 ? lower.slice(sepIndex + 1) : lower;
    const name = base.replace(/\.nutexb$/i, "");
    if (name) set.add(name);
  }
  return set;
}

function makeUniqueName(base: string, usedLower: Set<string>): string {
  const trimmed = base.trim();
  const safeBase = trimmed || "texture";
  const lower = safeBase.toLowerCase();
  if (!usedLower.has(lower)) {
    usedLower.add(lower);
    return safeBase;
  }
  for (let i = 1; i < 10000; i++) {
    const candidate = `${safeBase}_${i}`;
    const cLower = candidate.toLowerCase();
    if (!usedLower.has(cLower)) {
      usedLower.add(cLower);
      return candidate;
    }
  }
  usedLower.add(`${safeBase}_${Date.now()}`.toLowerCase());
  return `${safeBase}_${Date.now()}`;
}

function validateName(name: string, emptyMsg: string, forbiddenMsg: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return emptyMsg;
  if (containsInvalidFileChars(trimmed)) return forbiddenMsg;
  return null;
}

export function CardIconAddDialog({
  packFolderPath,
  hash,
  convertDirPath,
  structurePath,
  nextIndex,
  onAdded,
  disabled = false,
}: CardIconAddDialogProps) {
  const { t } = useTranslation("test-lists");
  const [openState, setOpenState] = useState(false);
  const [mode, setMode] = useState<"single" | "batch">("single");

  const [pngPath, setPngPath] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [ddsFormat, setDdsFormat] = useState<string>("BC7RgbaUnormSrgb");
  const [isCreating, setIsCreating] = useState(false);

  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [existingNamesLower, setExistingNamesLower] = useState<Set<string>>(() => new Set());
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const stopBatchRef = useRef(false);
  const batchListRef = useRef<HTMLDivElement | null>(null);

  const trimmedName = nameInput.trim();
  const isNameValid = Boolean(trimmedName) && !containsInvalidFileChars(trimmedName);

  const selectedBatchItem = useMemo(
    () => batchItems.find((it) => it.id === selectedBatchId) ?? null,
    [batchItems, selectedBatchId]
  );

  const activePreviewSrc = useMemo(() => {
    if (mode === "batch") {
      const p = selectedBatchItem?.pngPath ?? "";
      return p ? convertFileSrc(p) : null;
    }
    if (!pngPath) return null;
    return convertFileSrc(pngPath);
  }, [mode, pngPath, selectedBatchItem?.pngPath]);

  const handlePngPicked = useCallback((picked: string | string[]) => {
    if (Array.isArray(picked)) {
      setPngPath(picked[0] ?? "");
      return;
    }
    setPngPath(picked);
  }, []);

  const loadExistingNameSet = useCallback(async (): Promise<Set<string>> => {
    const raw = await readTextFile(structurePath);
    const json = JSON.parse(raw);
    return buildExistingNameSet(json);
  }, [structurePath]);

  const batchNameIssues = useMemo(() => {
    const issues = new Map<string, string>();
    const usedLower = new Set<string>();
    for (const it of batchItems) {
      if (it.status === "skipped") continue;
      const trimmed = it.nameInput.trim();
      const baseIssue = validateName(trimmed, t("cardIcon.nameEmpty"), t("cardIcon.nameForbidden"));
      if (baseIssue) {
        issues.set(it.id, baseIssue);
        continue;
      }
      const lower = trimmed.toLowerCase();
      if (usedLower.has(lower)) {
        issues.set(it.id, t("cardIcon.duplicateInBatch"));
        continue;
      }
      if (existingNamesLower.has(lower)) {
        issues.set(it.id, t("cardIcon.nameExistsJson"));
        continue;
      }
      usedLower.add(lower);
    }
    return issues;
  }, [batchItems, existingNamesLower, t]);

  const batchSummary = useMemo(() => {
    const total = batchItems.length;
    const success = batchItems.filter((e) => e.status === "success").length;
    const failed = batchItems.filter((e) => e.status === "error").length;
    const skipped = batchItems.filter((e) => e.status === "skipped").length;
    const cancelled = batchItems.filter((e) => e.status === "cancelled").length;
    const running = batchItems.filter((e) => e.status === "processing").length;
    return { total, success, failed, skipped, cancelled, running };
  }, [batchItems]);
  const getBatchListScrollElement = useCallback(() => batchListRef.current, []);
  const batchRowVirtualizer = useVirtualizer({
    count: batchItems.length,
    getScrollElement: getBatchListScrollElement,
    getItemKey: (index) => batchItems[index]?.id ?? index,
    estimateSize: () => BATCH_ADD_ROW_ESTIMATE_SIZE,
    overscan: 6,
  });

  const canStartBatch = useMemo(() => {
    if (isBatchRunning || isCreating) return false;
    if (!packFolderPath || !convertDirPath || !structurePath) return false;
    if (batchItems.length === 0) return false;
    return batchNameIssues.size === 0;
  }, [batchItems.length, batchNameIssues.size, convertDirPath, isBatchRunning, isCreating, packFolderPath, structurePath]);

  const handleApply = useCallback(async () => {
    if (!packFolderPath) {
      toast.error(t("cardIcon.folderEmpty"));
      return;
    }
    if (!pngPath) {
      toast.error(t("cardIcon.selectPng"));
      return;
    }
    if (!isNameValid) {
      toast.error(t("cardIcon.invalidName"));
      return;
    }

    setIsCreating(true);
    try {
      const raw = await readTextFile(structurePath);
      const json = JSON.parse(raw);

      const existing = Array.isArray(json?.SubFileData) ? json.SubFileData : [];
      const lower = trimmedName.toLowerCase();
      const hasDuplicate = existing.some((item: any) => {
        const url = typeof item?.fileUrl === "string" ? item.fileUrl : "";
        return url.toLowerCase().endsWith(`/${lower}.nutexb`) || url.toLowerCase().endsWith(`\\${lower}.nutexb`);
      });
      if (hasDuplicate) {
        toast.error(t("cardIcon.nameExistsJson"));
        return;
      }

      const defaultFileUrlPrefix = hash.endsWith("/") || hash.endsWith("\\") ? hash : `${hash}/`;
      const { nextStructJson } = appendCardIconToStructureJson(json, {
        name: trimmedName,
        defaultFileUrlPrefix,
      });

      const nutexbPath = await join(packFolderPath, `${trimmedName}.nutexb`);
      if (!nutexbPath) {
        toast.error(t("cardIcon.resolveFailed"));
        return;
      }

      const result = await invoke<ReplaceSummary>("card_icon_replace_from_png_with_dds_format", {
        nutexbPath,
        convertDir: convertDirPath,
        pngPath,
        ddsFormat,
      });

      await writeTextFile(structurePath, JSON.stringify(nextStructJson, null, 2));
      toast.success(t("cardIcon.createdOne", { name: result.nutexbName }));
      setOpenState(false);
      setPngPath("");
      setNameInput("");
      await onAdded();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : t("cardIcon.createFailed");
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  }, [convertDirPath, ddsFormat, isNameValid, onAdded, packFolderPath, pngPath, structurePath, t, trimmedName]);

  const canApply = Boolean(pngPath) && isNameValid && !isCreating;

  useEffect(() => {
    if (!openState) return;
    stopBatchRef.current = false;
  }, [openState]);

  const handlePickBatchPngs = useCallback(async () => {
    if (isBatchRunning || isCreating) return;
    if (!packFolderPath) {
      toast.error(t("cardIcon.folderEmpty"));
      return;
    }
    try {
      const selected = await open({
        multiple: true,
        title: t("common.selectPngFiles"),
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      if (paths.length === 0) return;

      const existing = await loadExistingNameSet();
      setExistingNamesLower(existing);

      const usedLower = new Set<string>(existing);
      const nextItems: BatchItem[] = [];
      for (let i = 0; i < paths.length; i++) {
        const p = paths[i];
        if (!p) continue;
        let fileName = "";
        try {
          fileName = await basename(p);
        } catch {
          fileName = p.split(/[/\\]/).pop() ?? "";
        }
        const base = makeUniqueName(stripExtension(fileName), usedLower);
        const id = `${Date.now()}-${i}-${Math.random().toString(16).slice(2)}`;
        nextItems.push({
          id,
          pngPath: p,
          sourceFileName: fileName || p,
          nameInput: base,
          status: isPngPath(p) ? "pending" : "skipped",
          progress: 0,
          message: isPngPath(p) ? undefined : t("cardIcon.onlyPng"),
        });
      }

      setBatchItems((prev) => {
        const merged = [...prev, ...nextItems];
        if (!selectedBatchId && merged.length > 0) {
          setSelectedBatchId(merged[0].id);
        }
        return merged;
      });
    } catch (error) {
      console.error(error);
      toast.error(t("cardIcon.selectFilesFailed"));
    }
  }, [isBatchRunning, isCreating, loadExistingNameSet, packFolderPath, selectedBatchId, t]);

  const handleUpdateBatchName = useCallback(
    (id: string, value: string) => {
      if (isBatchRunning) return;
      setBatchItems((prev) => prev.map((e) => (e.id === id ? { ...e, nameInput: value } : e)));
    },
    [isBatchRunning]
  );

  const handleRemoveBatchItem = useCallback(
    (id: string) => {
      if (isBatchRunning) return;
      setBatchItems((prev) => {
        const next = prev.filter((e) => e.id !== id);
        if (selectedBatchId === id) {
          setSelectedBatchId(next[0]?.id ?? "");
        }
        return next;
      });
    },
    [isBatchRunning, selectedBatchId]
  );

  const handleClearBatch = useCallback(() => {
    if (isBatchRunning) return;
    setBatchItems([]);
    setSelectedBatchId("");
  }, [isBatchRunning]);

  const handleStopBatch = useCallback(() => {
    if (!isBatchRunning) return;
    stopBatchRef.current = true;
  }, [isBatchRunning]);

  const handleStartBatch = useCallback(async () => {
    if (!canStartBatch) return;
    stopBatchRef.current = false;
    setIsBatchRunning(true);

    try {
      const raw = await readTextFile(structurePath);
      const originalJson = JSON.parse(raw);
      const existing = buildExistingNameSet(originalJson);
      setExistingNamesLower(existing);

      const existingLower = new Set<string>(existing);
      const successNamesLower = new Set<string>();
      let nextStructJson = originalJson;
      let createdCount = 0;

      for (const it of batchItems) {
        if (stopBatchRef.current) break;
        if (it.status === "skipped") continue;

        const trimmed = it.nameInput.trim();
        const issue = validateName(trimmed, t("cardIcon.nameEmpty"), t("cardIcon.nameForbidden"));
        if (issue) {
          setBatchItems((prev) => prev.map((e) => (e.id === it.id ? { ...e, status: "error", progress: 100, message: issue } : e)));
          continue;
        }

        if (!isPngPath(it.pngPath)) {
          setBatchItems((prev) =>
            prev.map((e) => (e.id === it.id ? { ...e, status: "skipped", progress: 100, message: t("cardIcon.onlyPng") } : e))
          );
          continue;
        }

        const lower = trimmed.toLowerCase();
        if (existingLower.has(lower) || successNamesLower.has(lower)) {
          setBatchItems((prev) =>
            prev.map((e) => (e.id === it.id ? { ...e, status: "error", progress: 100, message: t("cardIcon.nameExists") } : e))
          );
          continue;
        }

        setBatchItems((prev) => prev.map((e) => (e.id === it.id ? { ...e, status: "processing", progress: 10, message: undefined } : e)));

        const nutexbPath = await join(packFolderPath, `${trimmed}.nutexb`);
        if (!nutexbPath) {
          setBatchItems((prev) =>
            prev.map((e) =>
              e.id === it.id ? { ...e, status: "error", progress: 100, message: t("cardIcon.resolveFailed") } : e
            )
          );
          continue;
        }

        setBatchItems((prev) => prev.map((e) => (e.id === it.id ? { ...e, progress: 60 } : e)));

        try {
          const result = await invoke<ReplaceSummary>("card_icon_replace_from_png_with_dds_format", {
            nutexbPath,
            convertDir: convertDirPath,
            pngPath: it.pngPath,
            ddsFormat,
          });

          setBatchItems((prev) => prev.map((e) => (e.id === it.id ? { ...e, progress: 90, result } : e)));

          const defaultFileUrlPrefix = hash.endsWith("/") || hash.endsWith("\\") ? hash : `${hash}/`;
          const appended = appendCardIconToStructureJson(nextStructJson, {
            name: trimmed,
            defaultFileUrlPrefix,
          });
          nextStructJson = appended.nextStructJson;
          existingLower.add(lower);
          successNamesLower.add(lower);
          createdCount += 1;

          setBatchItems((prev) =>
            prev.map((e) => (e.id === it.id ? { ...e, status: "success", progress: 100, message: t("cardIcon.createdStatus") } : e))
          );
        } catch (error) {
          console.error(error);
          const message = error instanceof Error ? error.message : t("cardIcon.createFailed");
          setBatchItems((prev) => prev.map((e) => (e.id === it.id ? { ...e, status: "error", progress: 100, message } : e)));
        }
      }

      if (stopBatchRef.current) {
        setBatchItems((prev) => prev.map((e) => (e.status === "pending" ? { ...e, status: "cancelled", message: t("cardIcon.stoppedStatus"), progress: 0 } : e)));
      }

      if (createdCount > 0) {
        await writeTextFile(structurePath, JSON.stringify(nextStructJson, null, 2));
        toast.success(t("cardIcon.createdCount", { count: createdCount }));
        await onAdded();
      } else if (!stopBatchRef.current) {
        toast.error(t("cardIcon.noneCreated"));
      }
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : t("cardIcon.batchFailed");
      toast.error(message);
    } finally {
      setIsBatchRunning(false);
    }
  }, [batchItems, canStartBatch, convertDirPath, ddsFormat, hash, onAdded, packFolderPath, structurePath, t]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && (isCreating || isBatchRunning)) {
        toast.error(t("cardIcon.waitOrStop"));
        setOpenState(true);
        return;
      }
      setOpenState(next);
      if (!next) {
        setMode("single");
        setPngPath("");
        setNameInput("");
        setIsCreating(false);
        setBatchItems([]);
        setSelectedBatchId("");
        setExistingNamesLower(new Set());
        setIsBatchRunning(false);
        stopBatchRef.current = false;
      }
    },
    [isBatchRunning, isCreating, t]
  );

  return (
    <>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => handleOpenChange(true)}>
        {t("common.add")}
      </Button>
      {openState ? (
        <AppRndModalShell
          titleId="card-icon-add-title"
          title={t("cardIcon.addTitle")}
          subtitle={t("cardIcon.addSubtitle", { hash })}
          headerIcon={<ImagePlus className="h-5 w-5 text-primary" />}
          dimensions={CARD_ICON_ADD_MODAL_DIMENSIONS}
          storageKey="app.rnd-size.card-icon-add"
          onClose={() => handleOpenChange(false)}
          closeDisabled={isCreating || isBatchRunning}
        >
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <Tabs value={mode} onValueChange={(v) => setMode(v as "single" | "batch")} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="single" disabled={isBatchRunning}>
              {t("cardIcon.single")}
            </TabsTrigger>
            <TabsTrigger value="batch" disabled={isCreating}>
              {t("cardIcon.batch")}
            </TabsTrigger>
          </TabsList>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <Label>{t("common.preview")}</Label>
            <Card className="overflow-hidden min-h-[360px]">
              <AspectRatio ratio={1} className="bg-black flex items-center justify-center">
                {activePreviewSrc ? (
                  <img
                    src={activePreviewSrc}
                    alt={t("cardIcon.previewAlt")}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full w-full bg-black">
                    <span className="text-sm text-muted-foreground">{t("common.noPreview")}</span>
                  </div>
                )}
              </AspectRatio>
            </Card>
            <div className="text-xs text-muted-foreground min-h-8 leading-snug">
              {mode === "batch"
                ? selectedBatchItem
                  ? t("cardIcon.selectedFile", { name: selectedBatchItem.sourceFileName })
                  : t("cardIcon.selectBatchPreview")
                : t("cardIcon.previewSelected")}
            </div>
          </div>

          <div className="space-y-4">
            <TabsContent value="single" className="space-y-4 mt-0">
              <div className="space-y-2">
                <Label htmlFor="card-icon-name">{t("cardIcon.nameAlsoFile")}</Label>
                <Input
                  id="card-icon-name"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder={t("cardIcon.enterName")}
                  disabled={isCreating || isBatchRunning}
                />
                <div className="text-xs text-muted-foreground min-h-8 leading-snug">
                  {t("cardIcon.appendIndex", { index: nextIndex })}
                </div>
                {trimmedName && (
                  <div className="text-xs text-muted-foreground break-all">
                    {t("cardIcon.targetNutexb", { name: `${trimmedName}.nutexb` })}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>{t("common.ddsFormat")}</Label>
                <Select value={ddsFormat} onValueChange={setDdsFormat} disabled={isCreating || isBatchRunning}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("common.selectDdsFormat")} />
                  </SelectTrigger>
                  <SelectContent>
                    {DDS_FORMATS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground min-h-8 leading-snug">
                  {t("cardIcon.ddsHelp")}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="card-icon-add-png">{t("common.sourcePng")}</Label>
                <FilePathInput
                  id="card-icon-add-png"
                  value={pngPath}
                  placeholder={t("common.selectPng")}
                  picker={{
                    kind: "file",
                    multiple: false,
                    title: t("common.selectPngTitle"),
                    filters: [{ name: "PNG", extensions: ["png"] }],
                  }}
                  onPickedValue={handlePngPicked}
                  disabled={isCreating || isBatchRunning}
                />
                <div className="text-xs text-muted-foreground min-h-8 leading-snug">
                  {t("cardIcon.pngRust")}
                </div>
              </div>

              {!isNameValid && trimmedName && <div className="text-sm text-destructive">{t("cardIcon.invalidNameChars")}</div>}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isCreating || isBatchRunning}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={() => void handleApply()} disabled={!canApply || isBatchRunning}>
                  {isCreating ? t("cardIcon.creating") : t("cardIcon.confirm")}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="batch" className="space-y-4 mt-0">
              <div className="space-y-2">
                <Label>{t("common.ddsFormat")}</Label>
                <Select value={ddsFormat} onValueChange={setDdsFormat} disabled={isBatchRunning}>
                  <SelectTrigger className="w-full max-w-[280px]">
                    <SelectValue placeholder={t("common.selectDdsFormat")} />
                  </SelectTrigger>
                  <SelectContent>
                    {DDS_FORMATS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  {t("cardIcon.totalSuccessFailed", {
                    total: batchSummary.total,
                    success: batchSummary.success,
                    failed: batchSummary.failed,
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => void handlePickBatchPngs()} disabled={isBatchRunning}>
                    {t("cardIcon.selectPngs")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleClearBatch} disabled={isBatchRunning || batchItems.length === 0}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    {t("common.clear")}
                  </Button>
                </div>
              </div>

              <div className="border rounded-md">
                <div ref={batchListRef} className="h-[360px] overflow-auto">
                  <div className="relative w-full p-2" style={{ height: batchRowVirtualizer.getTotalSize() }}>
                    {batchItems.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground">{t("cardIcon.noFiles")}</div>
                    ) : (
                      batchRowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const it = batchItems[virtualRow.index];
                        if (!it) return null;
                        const idx = virtualRow.index;
                        const issue = batchNameIssues.get(it.id);
                        const isSelected = it.id === selectedBatchId;
                        const target = `${it.nameInput.trim() || t("cardIcon.emptyParen")}.nutexb`;
                        return (
                          <div
                            key={it.id}
                            ref={batchRowVirtualizer.measureElement}
                            data-index={virtualRow.index}
                            className={[
                              "absolute left-2 top-0 w-[calc(100%-1rem)] rounded-md border p-3 cursor-pointer transition-colors",
                              isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                            ].join(" ")}
                            style={{ transform: `translateY(${virtualRow.start}px)` }}
                            onClick={() => setSelectedBatchId(it.id)}
                            role="button"
                            tabIndex={0}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium truncate">{it.sourceFileName || it.pngPath}</div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  {t("cardIcon.rowTarget", { n: idx + 1, target })}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveBatchItem(it.id);
                                }}
                                disabled={isBatchRunning}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>

                            <div className="mt-3 grid grid-cols-3 gap-2 items-center">
                              <div className="col-span-2">
                                <Input
                                  value={it.nameInput}
                                  onChange={(e) => handleUpdateBatchName(it.id, e.target.value)}
                                  disabled={isBatchRunning}
                                  placeholder={t("cardIcon.enterName")}
                                />
                                <div className="min-h-5 text-xs mt-1">
                                  {issue ? (
                                    <span className="text-destructive">{issue}</span>
                                  ) : it.message ? (
                                    <span className="text-muted-foreground">{it.message}</span>
                                  ) : (
                                    <span className="text-muted-foreground">{"\u00a0"}</span>
                                  )}
                                </div>
                              </div>
                              <div className="col-span-1 space-y-2">
                                <div className="text-xs text-muted-foreground flex items-center justify-between">
                                  <span>{it.status}</span>
                                  {it.status === "processing" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                </div>
                                <Progress value={it.progress} className="w-full" />
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                {isBatchRunning ? (
                  <Button variant="outline" onClick={handleStopBatch}>
                    {t("common.stop")}
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => handleOpenChange(false)}>
                    {t("common.close")}
                  </Button>
                )}
                <Button onClick={() => void handleStartBatch()} disabled={!canStartBatch}>
                  {isBatchRunning ? t("cardIcon.running") : t("cardIcon.startBatch")}
                </Button>
              </div>
            </TabsContent>
          </div>
        </div>
            </Tabs>
          </div>
        </AppRndModalShell>
      ) : null}
    </>
  );
}
