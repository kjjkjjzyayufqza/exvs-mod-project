import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Copy,
  FileWarning,
  FolderOpen,
  Loader2,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { FilePathInput } from "@/components/ui/filePathInput";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  inferEffectFolderStructurePath,
  type EffectFolderCopyResult,
} from "@/services/effectFolder/effectFolderService";
import {
  buildEffectFolderCopyPlan,
  formatEffectFolderHash,
  type EffectCopyPlanEntry,
  type EffectFolderCopyPlan,
  type EffectListItem,
} from "./effectFolderEditorUtils";
import { cn } from "@/lib/utils";

type EffectFolderCopyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceEffectRoot: string;
  sourceStructureJsonPath: string;
  selectedItems: EffectListItem[];
  allItems: EffectListItem[];
  busy?: boolean;
  onCopy: (destination: {
    effectRoot: string;
    structureJsonPath: string;
  }) => Promise<EffectFolderCopyResult | void>;
};

type DialogPhase = "plan" | "result";

function categoryBadgeVariant(
  category: EffectCopyPlanEntry["category"],
): "default" | "secondary" | "outline" | "destructive" {
  switch (category) {
    case "efxbn":
      return "default";
    case "model":
      return "secondary";
    case "texture":
      return "outline";
    case "animation":
      return "secondary";
    case "other":
      return "destructive";
  }
}

function roleLabel(role: EffectCopyPlanEntry["role"], t: (key: string) => string): string {
  return role === "selected" ? t("copyDialog.selectedRole") : t("copyDialog.dependencyRole");
}

function SummaryChips({ plan }: { plan: EffectFolderCopyPlan }) {
  const { t } = useTranslation("test-effect-folder");
  const chips: Array<{ key: string; value: number; tone?: "warn" | "danger" | "muted" }> = [
    { key: "selected", value: plan.summary.selectedCount },
    { key: "files", value: plan.summary.transferFileCount },
  ];
  if (plan.summary.modelCount > 0) chips.splice(-1, 0, { key: "models", value: plan.summary.modelCount });
  if (plan.summary.textureCount > 0) chips.splice(-1, 0, { key: "textures", value: plan.summary.textureCount });
  if (plan.summary.animationCount > 0) {
    chips.splice(-1, 0, { key: "animations", value: plan.summary.animationCount });
  }
  if (plan.summary.missingCount > 0) {
    chips.push({ key: "missing", value: plan.summary.missingCount, tone: "warn" });
  }
  if (plan.summary.unsupportedCount > 0) {
    chips.push({ key: "unsupported", value: plan.summary.unsupportedCount, tone: "danger" });
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <Badge
          key={chip.key}
          variant="outline"
          className={cn(
            "h-6 gap-1 rounded-sm px-2 font-normal tabular-nums",
            chip.tone === "warn" && "border-amber-500/40 text-amber-700 dark:text-amber-400",
            chip.tone === "danger" && "border-destructive/40 text-destructive",
            chip.tone === "muted" && "text-muted-foreground",
          )}
        >
          <span className="font-semibold">{chip.value}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t(`copyDialog.chips.${chip.key}`)}
          </span>
        </Badge>
      ))}
    </div>
  );
}

function PathBlock({ label, path, mono = true }: { label: string; path: string; mono?: boolean }) {
  const { t } = useTranslation("test-effect-folder");
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("break-all text-[11px] leading-snug text-foreground", mono && "font-mono")} data-i18n-ignore="">
        {path || t("copyDialog.none")}
      </div>
    </div>
  );
}

function PlanEntryRow({ entry }: { entry: EffectCopyPlanEntry }) {
  const { t } = useTranslation("test-effect-folder");
  const [open, setOpen] = useState(false);
  const hasChildren = entry.files.length > 1 || entry.category === "model";

  return (
    <div
      className={cn(
        "rounded-md border bg-card/40 px-2.5 py-2 transition-colors",
        entry.unsupported && "border-destructive/30 bg-destructive/5",
        entry.missing && !entry.unsupported && "border-amber-500/30 bg-amber-500/5",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-xs font-medium">{entry.label}</span>
            <Badge variant={categoryBadgeVariant(entry.category)} className="h-5 rounded-sm px-1.5 text-[10px]" data-i18n-ignore="">
              {entry.category}
            </Badge>
            {entry.unsupported ? (
              <Badge variant="destructive" className="h-5 rounded-sm px-1.5 text-[10px]">
                {t("copyDialog.notCopied")}
              </Badge>
            ) : null}
            {entry.missing ? (
              <Badge
                variant="outline"
                className="h-5 rounded-sm border-amber-500/40 px-1.5 text-[10px] text-amber-700 dark:text-amber-400"
              >
                {t("copyDialog.missing")}
              </Badge>
            ) : null}
          </div>
          {entry.hash ? (
            <div className="font-mono text-[10px] tabular-nums text-muted-foreground" data-i18n-ignore="">
              {formatEffectFolderHash(entry.hash)}
            </div>
          ) : null}
        </div>
        {hasChildren ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 px-2 text-[11px]"
            onClick={() => setOpen((v) => !v)}
          >
            {t("copyDialog.fileCount", { count: entry.files.length })}
            <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </Button>
        ) : null}
      </div>
      {hasChildren && open ? (
        <ul className="mt-2 space-y-1 border-t border-border/60 pt-2">
          {entry.files.map((file) => (
            <li key={file.path + file.name} className="flex items-start justify-between gap-2 text-[10px]">
              <span className="min-w-0 break-all font-mono">
                {file.name}
                <span className="text-muted-foreground"> · {file.actualExt || "ext?"}</span>
              </span>
              {file.missing ? (
                <span className="shrink-0 text-amber-700 dark:text-amber-400">{t("copyDialog.missing")}</span>
              ) : (
                <span className="shrink-0 text-muted-foreground">{t("copyDialog.ok")}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SelectionListPanel({ title, empty, entries }: { title: string; empty: string; entries: EffectCopyPlanEntry[] }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-tight">{title}</h3>
        <span className="text-[10px] tabular-nums text-muted-foreground">{entries.length}</span>
      </div>
      {entries.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-[11px] text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map((entry) => (
            <PlanEntryRow key={entry.key} entry={entry} />
          ))}
        </div>
      )}
    </section>
  );
}

function ResultPanel({ result }: { result: EffectFolderCopyResult }) {
  const { t } = useTranslation("test-effect-folder");
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium">{t("copyDialog.copyFinished")}</p>
          <p className="text-[11px] text-muted-foreground">
            {t("copyDialog.resultSummary", {
              copied: result.copiedFiles.length,
              skipped: result.skipped.length,
              warnings: result.warnings.length,
              total: result.totalFiles,
            })}
          </p>
        </div>
      </div>

      <PathBlock label={t("copyDialog.destinationRoot")} path={result.destinationEffectRoot} />
      <PathBlock label={t("copyDialog.destinationStructure")} path={result.destinationStructureJsonPath} />

      {result.copiedFiles.length > 0 ? (
        <section className="space-y-1.5">
          <h4 className="text-[11px] font-medium">{t("copyDialog.copiedPaths")}</h4>
          <ul className="max-h-40 space-y-1 overflow-auto rounded-md border bg-muted/20 p-2 font-mono text-[10px]" data-i18n-ignore="">
            {result.copiedFiles.map((path) => (
              <li key={path} className="break-all">
                {path}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {result.skipped.length > 0 ? (
        <section className="space-y-1.5">
          <h4 className="flex items-center gap-1.5 text-[11px] font-medium">
            <SkipForward className="h-3.5 w-3.5" />
            {t("copyDialog.skipped")}
          </h4>
          <ul className="max-h-32 space-y-1 overflow-auto rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-[11px]">
            {result.skipped.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {result.warnings.length > 0 ? (
        <section className="space-y-1.5">
          <h4 className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t("copyDialog.backendWarnings")}
          </h4>
          <ul className="max-h-32 space-y-1 overflow-auto rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-[11px]">
            {result.warnings.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function EffectFolderCopyDialog({
  open: dialogOpen,
  onOpenChange,
  selectedItems,
  allItems,
  busy = false,
  onCopy,
}: EffectFolderCopyDialogProps) {
  const { t } = useTranslation("test-effect-folder");
  const [destinationRoot, setDestinationRoot] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<DialogPhase>("plan");
  const [lastResult, setLastResult] = useState<EffectFolderCopyResult | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const plan = useMemo(
    () => buildEffectFolderCopyPlan({ selectedItems, allItems }),
    [allItems, selectedItems],
  );

  const destinationStructurePath = useMemo(() => {
    const trimmed = destinationRoot.trim();
    if (!trimmed) return "";
    try {
      return inferEffectFolderStructurePath(trimmed);
    } catch {
      return "";
    }
  }, [destinationRoot]);

  useEffect(() => {
    if (!dialogOpen) return;
    setDestinationRoot("");
    setError(null);
    setPhase("plan");
    setLastResult(null);
    setActiveTab("overview");
  }, [dialogOpen]);

  const pickDestinationFolder = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      setDestinationRoot(selected);
      setError(null);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = destinationRoot.trim();
    if (!trimmed) {
      setError(t("copyDialog.errors.pickDestination"));
      return;
    }
    if (selectedItems.length === 0) {
      setError(t("copyDialog.errors.noSelection"));
      return;
    }
    if (plan.summary.transferFileCount === 0) {
      setError(t("copyDialog.errors.nothingTransferable"));
      return;
    }

    let structureJsonPath: string;
    try {
      structureJsonPath = inferEffectFolderStructurePath(trimmed);
    } catch (inferError) {
      setError(inferError instanceof Error ? inferError.message : String(inferError));
      return;
    }

    setError(null);
    try {
      const result = await onCopy({ effectRoot: trimmed, structureJsonPath });
      if (result) {
        setLastResult(result);
        setPhase("result");
        setActiveTab("result");
      } else {
        onOpenChange(false);
      }
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : String(copyError));
      setActiveTab("overview");
    }
  }, [destinationRoot, onCopy, onOpenChange, plan.summary.transferFileCount, selectedItems.length, t]);

  const canSubmit =
    !busy &&
    selectedItems.length > 0 &&
    plan.summary.transferFileCount > 0 &&
    destinationRoot.trim().length > 0 &&
    phase === "plan";

  return (
    <Dialog open={dialogOpen} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(88vh,760px)] w-[min(94vw,760px)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-1.5 border-b px-5 pb-3 pt-5 text-left">
          <DialogTitle className="pr-8 text-base">{t("copyDialog.title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("copyDialog.description")}</DialogDescription>
          <SummaryChips plan={plan} />
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-[min(58vh,560px)]">
            <div className="space-y-4 px-5 py-4">
              <section className="space-y-1.5 rounded-lg border bg-muted/15 p-3">
                <Label htmlFor="effect-copy-destination" className="text-[11px]">
                  {t("copyDialog.destinationFolder")}
                </Label>
                <div className="flex gap-2">
                  <FilePathInput
                    id="effect-copy-destination"
                    value={destinationRoot}
                    onChange={(event) => {
                      setDestinationRoot(event.target.value);
                      setError(null);
                    }}
                    placeholder="E:\\workspace\\006effect\\0xDEST"
                    className="font-mono text-xs"
                    disabled={busy || phase === "result"}
                    data-i18n-ignore=""
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => void pickDestinationFolder()}
                    disabled={busy || phase === "result"}
                  >
                    <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                    {t("actions.browse")}
                  </Button>
                </div>
              </section>

              {plan.warnings.length > 0 ? (
                <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
                  <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">{t("copyDialog.planWarnings")}</p>
                    <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-amber-900/90 dark:text-amber-200/90">
                      {plan.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}

              {error ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              ) : null}

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className={cn("grid h-9 w-full grid-cols-2", phase === "result" && "hidden")}>
                  <TabsTrigger value="overview" className="text-xs">
                    {t("copyDialog.overview")}
                  </TabsTrigger>
                  <TabsTrigger value="files" className="text-xs">
                    {t("copyDialog.files")}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-3 space-y-4 focus-visible:outline-none">
                  <SelectionListPanel
                    title={t("copyDialog.selection")}
                    empty={t("copyDialog.errors.noSelection")}
                    entries={plan.selected}
                  />
                  {plan.dependencies.length > 0 ? (
                    <SelectionListPanel
                      title={t("copyDialog.dependencies")}
                      empty=""
                      entries={plan.dependencies}
                    />
                  ) : null}

                </TabsContent>

                <TabsContent value="files" className="mt-3 focus-visible:outline-none">
                  {plan.transferFiles.length === 0 ? (
                    <p className="rounded-md border border-dashed px-3 py-6 text-center text-[11px] text-muted-foreground">
                      {t("copyDialog.noTransferable")}
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="h-8 text-[10px]">{t("copyDialog.role")}</TableHead>
                            <TableHead className="h-8 text-[10px]">{t("copyDialog.kind")}</TableHead>
                            <TableHead className="h-8 text-[10px]">{t("copyDialog.name")}</TableHead>
                            <TableHead className="h-8 text-[10px]">{t("copyDialog.status")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {plan.transferFiles.map((file) => (
                            <TableRow key={`${file.entryKey}:${file.path}`}>
                              <TableCell className="py-1.5 align-top text-[10px] text-muted-foreground">
                                {roleLabel(file.role, t)}
                              </TableCell>
                              <TableCell className="py-1.5 align-top">
                                <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px]">
                                  {file.category}
                                </Badge>
                              </TableCell>
                              <TableCell className="max-w-[8rem] py-1.5 align-top font-mono text-[10px]">
                                {file.name}
                                <div className="text-muted-foreground">{file.actualExt}</div>
                              </TableCell>
                              <TableCell className="py-1.5 align-top text-[10px]">
                                {file.missing ? (
                                  <span className="text-amber-700 dark:text-amber-400">{t("copyDialog.missingOnDisk")}</span>
                                ) : (
                                  <span className="text-muted-foreground">{t("copyDialog.willCopyIfFree")}</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  <p className="hidden">
                    {t("copyDialog.pathHelp")}
                  </p>
                </TabsContent>

                <TabsContent value="result" className="mt-3 focus-visible:outline-none">
                  {lastResult ? (
                    <ResultPanel result={lastResult} />
                  ) : (
                    <p className="rounded-md border border-dashed px-3 py-6 text-center text-[11px] text-muted-foreground">
                      {t("copyDialog.runToSeeResults")}
                    </p>
                  )}
                </TabsContent>

              </Tabs>
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t px-5 py-3 sm:justify-between">
          <div className="mr-auto hidden text-[11px] text-muted-foreground sm:block">
            {phase === "result"
              ? t("copyDialog.filesCopied", { count: lastResult?.copiedFiles.length ?? 0 })
              : t("copyDialog.fileCount", { count: plan.summary.transferFileCount })}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              {phase === "result" ? t("actions.close") : t("actions.cancel")}
            </Button>
            {phase === "plan" ? (
              <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
                {plan.summary.transferFileCount > 0
                  ? t("copyDialog.copyWithCount", { count: plan.summary.transferFileCount })
                  : t("actions.copy")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setPhase("plan");
                  setLastResult(null);
                  setActiveTab("overview");
                }}
                disabled={busy}
              >
                {t("copyDialog.copyAgain")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
