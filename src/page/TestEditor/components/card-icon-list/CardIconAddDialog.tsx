import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { basename, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { Loader2, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FilePathInput } from "@/components/ui/filePathInput";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { appendCardIconToStructureJson } from "./cardIconStructure";

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

interface CardIconAddDialogProps {
  folderPath: string;
  convertDirPath: string;
  structurePath: string;
  nextIndex: number;
  onAdded: () => Promise<void> | void;
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

function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Name is empty";
  if (containsInvalidFileChars(trimmed)) return "Name contains forbidden characters";
  return null;
}

export function CardIconAddDialog({
  folderPath,
  convertDirPath,
  structurePath,
  nextIndex,
  onAdded,
}: CardIconAddDialogProps) {
  const [openState, setOpenState] = useState(false);
  const [mode, setMode] = useState<"single" | "batch">("single");

  const [pngPath, setPngPath] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [existingNamesLower, setExistingNamesLower] = useState<Set<string>>(() => new Set());
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const stopBatchRef = useRef(false);

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
      const baseIssue = validateName(trimmed);
      if (baseIssue) {
        issues.set(it.id, baseIssue);
        continue;
      }
      const lower = trimmed.toLowerCase();
      if (usedLower.has(lower)) {
        issues.set(it.id, "Duplicate name in batch");
        continue;
      }
      if (existingNamesLower.has(lower)) {
        issues.set(it.id, "Name already exists in structure JSON");
        continue;
      }
      usedLower.add(lower);
    }
    return issues;
  }, [batchItems, existingNamesLower]);

  const batchSummary = useMemo(() => {
    const total = batchItems.length;
    const success = batchItems.filter((e) => e.status === "success").length;
    const failed = batchItems.filter((e) => e.status === "error").length;
    const skipped = batchItems.filter((e) => e.status === "skipped").length;
    const cancelled = batchItems.filter((e) => e.status === "cancelled").length;
    const running = batchItems.filter((e) => e.status === "processing").length;
    return { total, success, failed, skipped, cancelled, running };
  }, [batchItems]);

  const canStartBatch = useMemo(() => {
    if (isBatchRunning || isCreating) return false;
    if (!folderPath || !convertDirPath || !structurePath) return false;
    if (batchItems.length === 0) return false;
    return batchNameIssues.size === 0;
  }, [batchItems.length, batchNameIssues.size, convertDirPath, folderPath, isBatchRunning, isCreating, structurePath]);

  const handleApply = useCallback(async () => {
    if (!folderPath) {
      toast.error("Folder path is empty");
      return;
    }
    if (!pngPath) {
      toast.error("Please select a PNG file");
      return;
    }
    if (!isNameValid) {
      toast.error("Invalid name (empty or contains forbidden characters)");
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
        toast.error("The name already exists in structure JSON");
        return;
      }

      const { nextStructJson } = appendCardIconToStructureJson(json, { name: trimmedName });

      const nutexbPath = await join(folderPath, "0x49235031", `${trimmedName}.nutexb`);
      if (!nutexbPath) {
        toast.error("Failed to resolve target nutexb path");
        return;
      }

      const result = await invoke<ReplaceSummary>("card_icon_replace_from_png", {
        nutexbPath,
        convertDir: convertDirPath,
        pngPath,
      });

      await writeTextFile(structurePath, JSON.stringify(nextStructJson, null, 2));
      toast.success(`Created card icon: ${result.nutexbName}`);
      setOpenState(false);
      setPngPath("");
      setNameInput("");
      await onAdded();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Failed to create card icon";
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  }, [convertDirPath, folderPath, isNameValid, onAdded, pngPath, structurePath, trimmedName]);

  const canApply = Boolean(pngPath) && isNameValid && !isCreating;

  useEffect(() => {
    if (!openState) return;
    stopBatchRef.current = false;
  }, [openState]);

  const handlePickBatchPngs = useCallback(async () => {
    if (isBatchRunning || isCreating) return;
    if (!folderPath) {
      toast.error("Folder path is empty");
      return;
    }
    try {
      const selected = await open({
        multiple: true,
        title: "Select PNG files",
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
          message: isPngPath(p) ? undefined : "Only PNG is supported for card icons",
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
      toast.error("Failed to select files");
    }
  }, [folderPath, isBatchRunning, isCreating, loadExistingNameSet, selectedBatchId]);

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
        const issue = validateName(trimmed);
        if (issue) {
          setBatchItems((prev) => prev.map((e) => (e.id === it.id ? { ...e, status: "error", progress: 100, message: issue } : e)));
          continue;
        }

        if (!isPngPath(it.pngPath)) {
          setBatchItems((prev) =>
            prev.map((e) => (e.id === it.id ? { ...e, status: "skipped", progress: 100, message: "Only PNG is supported for card icons" } : e))
          );
          continue;
        }

        const lower = trimmed.toLowerCase();
        if (existingLower.has(lower) || successNamesLower.has(lower)) {
          setBatchItems((prev) =>
            prev.map((e) => (e.id === it.id ? { ...e, status: "error", progress: 100, message: "Name already exists (duplicate)" } : e))
          );
          continue;
        }

        setBatchItems((prev) => prev.map((e) => (e.id === it.id ? { ...e, status: "processing", progress: 10, message: undefined } : e)));

        const nutexbPath = await join(folderPath, "0x49235031", `${trimmed}.nutexb`);
        if (!nutexbPath) {
          setBatchItems((prev) =>
            prev.map((e) =>
              e.id === it.id ? { ...e, status: "error", progress: 100, message: "Failed to resolve target nutexb path" } : e
            )
          );
          continue;
        }

        setBatchItems((prev) => prev.map((e) => (e.id === it.id ? { ...e, progress: 60 } : e)));

        try {
          const result = await invoke<ReplaceSummary>("card_icon_replace_from_png", {
            nutexbPath,
            convertDir: convertDirPath,
            pngPath: it.pngPath,
          });

          setBatchItems((prev) => prev.map((e) => (e.id === it.id ? { ...e, progress: 90, result } : e)));

          const appended = appendCardIconToStructureJson(nextStructJson, { name: trimmed });
          nextStructJson = appended.nextStructJson;
          existingLower.add(lower);
          successNamesLower.add(lower);
          createdCount += 1;

          setBatchItems((prev) =>
            prev.map((e) => (e.id === it.id ? { ...e, status: "success", progress: 100, message: "Created" } : e))
          );
        } catch (error) {
          console.error(error);
          const message = error instanceof Error ? error.message : "Failed to create card icon";
          setBatchItems((prev) => prev.map((e) => (e.id === it.id ? { ...e, status: "error", progress: 100, message } : e)));
        }
      }

      if (stopBatchRef.current) {
        setBatchItems((prev) => prev.map((e) => (e.status === "pending" ? { ...e, status: "cancelled", message: "Stopped", progress: 0 } : e)));
      }

      if (createdCount > 0) {
        await writeTextFile(structurePath, JSON.stringify(nextStructJson, null, 2));
        toast.success(`Created ${createdCount} card icon(s)`);
        await onAdded();
      } else if (!stopBatchRef.current) {
        toast.error("No card icons were created");
      }
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Batch create failed";
      toast.error(message);
    } finally {
      setIsBatchRunning(false);
    }
  }, [batchItems, canStartBatch, convertDirPath, folderPath, onAdded, structurePath]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && (isCreating || isBatchRunning)) {
        toast.error("Please wait for the current task to finish, or stop the batch before closing");
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
    [isBatchRunning, isCreating]
  );

  return (
    <Dialog open={openState} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Add
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[980px]">
        <DialogHeader>
          <DialogTitle>Add Card Icon</DialogTitle>
          <DialogDescription>
            Creates nutexb from PNG and appends items to <span className="font-mono">0x49235031_structure.json</span>.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "single" | "batch")} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="single" disabled={isBatchRunning}>
              Single
            </TabsTrigger>
            <TabsTrigger value="batch" disabled={isCreating}>
              Batch
            </TabsTrigger>
          </TabsList>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <Label>Preview</Label>
            <Card className="overflow-hidden min-h-[360px]">
              <AspectRatio ratio={1} className="bg-black flex items-center justify-center">
                {activePreviewSrc ? (
                  <img
                    src={activePreviewSrc}
                    alt="Card icon preview"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full w-full bg-black">
                    <span className="text-sm text-muted-foreground">No preview available</span>
                  </div>
                )}
              </AspectRatio>
            </Card>
            <div className="text-xs text-muted-foreground min-h-8 leading-snug">
              {mode === "batch"
                ? selectedBatchItem
                  ? `Selected: ${selectedBatchItem.sourceFileName}`
                  : "Select a batch item to preview."
                : "Previewing the selected PNG (will be applied)."}
            </div>
          </div>

          <div className="space-y-4">
            <TabsContent value="single" className="space-y-4 mt-0">
              <div className="space-y-2">
                <Label htmlFor="card-icon-name">Name (also file name)</Label>
                <Input
                  id="card-icon-name"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Enter a name..."
                  disabled={isCreating || isBatchRunning}
                />
                <div className="text-xs text-muted-foreground min-h-8 leading-snug">
                  The item will be appended at index <span className="font-mono">{nextIndex}</span>.
                </div>
                {trimmedName && (
                  <div className="text-xs text-muted-foreground break-all">
                    Target nutexb: <span className="font-mono">{`${trimmedName}.nutexb`}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="card-icon-add-png">Source PNG</Label>
                <FilePathInput
                  id="card-icon-add-png"
                  value={pngPath}
                  placeholder="Select a PNG file..."
                  picker={{
                    kind: "file",
                    multiple: false,
                    title: "Select PNG file",
                    filters: [{ name: "PNG", extensions: ["png"] }],
                  }}
                  onPickedValue={handlePngPicked}
                  disabled={isCreating || isBatchRunning}
                />
                <div className="text-xs text-muted-foreground min-h-8 leading-snug">
                  The PNG will be converted in Rust (no external executables).
                </div>
              </div>

              {!isNameValid && trimmedName && <div className="text-sm text-destructive">Name contains invalid characters.</div>}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setOpenState(false)} disabled={isCreating || isBatchRunning}>
                  Cancel
                </Button>
                <Button onClick={() => void handleApply()} disabled={!canApply || isBatchRunning}>
                  {isCreating ? "Creating..." : "Confirm"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="batch" className="space-y-4 mt-0">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  Total: <span className="font-mono">{batchSummary.total}</span> · Success:{" "}
                  <span className="font-mono">{batchSummary.success}</span> · Failed:{" "}
                  <span className="font-mono">{batchSummary.failed}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => void handlePickBatchPngs()} disabled={isBatchRunning}>
                    Select PNGs
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleClearBatch} disabled={isBatchRunning || batchItems.length === 0}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear
                  </Button>
                </div>
              </div>

              <div className="border rounded-md">
                <ScrollArea className="h-[360px]">
                  <div className="p-2 space-y-2">
                    {batchItems.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground">No files selected.</div>
                    ) : (
                      batchItems.map((it, idx) => {
                        const issue = batchNameIssues.get(it.id);
                        const isSelected = it.id === selectedBatchId;
                        const target = `${it.nameInput.trim() || "(empty)"}.nutexb`;
                        return (
                          <div
                            key={it.id}
                            className={[
                              "rounded-md border p-3 cursor-pointer transition-colors",
                              isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                            ].join(" ")}
                            onClick={() => setSelectedBatchId(it.id)}
                            role="button"
                            tabIndex={0}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium truncate">{it.sourceFileName || it.pngPath}</div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  #{idx + 1} · Target: <span className="font-mono">{target}</span>
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
                                  placeholder="Enter a name..."
                                />
                                <div className="min-h-5 text-xs mt-1">
                                  {issue ? (
                                    <span className="text-destructive">{issue}</span>
                                  ) : it.message ? (
                                    <span className="text-muted-foreground">{it.message}</span>
                                  ) : (
                                    <span className="text-muted-foreground">&nbsp;</span>
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
                </ScrollArea>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                {isBatchRunning ? (
                  <Button variant="outline" onClick={handleStopBatch}>
                    Stop
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setOpenState(false)}>
                    Close
                  </Button>
                )}
                <Button onClick={() => void handleStartBatch()} disabled={!canStartBatch}>
                  {isBatchRunning ? "Running..." : "Start Batch"}
                </Button>
              </div>
            </TabsContent>
          </div>
        </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
