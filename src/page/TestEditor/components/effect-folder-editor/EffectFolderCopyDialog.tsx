import { useCallback, useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  ArrowRight,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  inferEffectFolderStructurePath,
  type EffectFolderCopyResult,
  type EffectFolderSelection,
} from "@/services/effectFolder/effectFolderService";
import {
  buildEffectFolderCopyPlan,
  effectListItemLabel,
  formatEffectFolderHash,
  toEffectFolderSelections,
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

function roleLabel(role: EffectCopyPlanEntry["role"]): string {
  return role === "selected" ? "Selected" : "Dependency";
}

function SummaryChips({ plan }: { plan: EffectFolderCopyPlan }) {
  const chips: Array<{ label: string; value: number; tone?: "warn" | "danger" | "muted" }> = [
    { label: "selected", value: plan.summary.selectedCount },
    { label: "files", value: plan.summary.transferFileCount },
  ];
  if (plan.summary.modelCount > 0) chips.splice(-1, 0, { label: "models", value: plan.summary.modelCount });
  if (plan.summary.textureCount > 0) chips.splice(-1, 0, { label: "textures", value: plan.summary.textureCount });
  if (plan.summary.animationCount > 0) {
    chips.splice(-1, 0, { label: "animations", value: plan.summary.animationCount });
  }
  if (plan.summary.missingCount > 0) {
    chips.push({ label: "missing", value: plan.summary.missingCount, tone: "warn" });
  }
  if (plan.summary.unsupportedCount > 0) {
    chips.push({ label: "unsupported", value: plan.summary.unsupportedCount, tone: "danger" });
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <Badge
          key={chip.label}
          variant="outline"
          className={cn(
            "h-6 gap-1 rounded-sm px-2 font-normal tabular-nums",
            chip.tone === "warn" && "border-amber-500/40 text-amber-700 dark:text-amber-400",
            chip.tone === "danger" && "border-destructive/40 text-destructive",
            chip.tone === "muted" && "text-muted-foreground",
          )}
        >
          <span className="font-semibold">{chip.value}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{chip.label}</span>
        </Badge>
      ))}
    </div>
  );
}

function PathBlock({ label, path, mono = true }: { label: string; path: string; mono?: boolean }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("break-all text-[11px] leading-snug text-foreground", mono && "font-mono")}>
        {path || "—"}
      </div>
    </div>
  );
}

function PlanEntryRow({ entry }: { entry: EffectCopyPlanEntry }) {
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
            <Badge variant={categoryBadgeVariant(entry.category)} className="h-5 rounded-sm px-1.5 text-[10px]">
              {entry.category}
            </Badge>
            <Badge variant="outline" className="h-5 rounded-sm px-1.5 text-[10px] text-muted-foreground">
              {roleLabel(entry.role)}
            </Badge>
            {entry.unsupported ? (
              <Badge variant="destructive" className="h-5 rounded-sm px-1.5 text-[10px]">
                not copied
              </Badge>
            ) : null}
            {entry.missing ? (
              <Badge
                variant="outline"
                className="h-5 rounded-sm border-amber-500/40 px-1.5 text-[10px] text-amber-700 dark:text-amber-400"
              >
                missing
              </Badge>
            ) : null}
          </div>
          {entry.hash ? (
            <div className="font-mono text-[10px] tabular-nums text-muted-foreground">
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
            {entry.files.length} file{entry.files.length === 1 ? "" : "s"}
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
                <span className="shrink-0 text-amber-700 dark:text-amber-400">missing</span>
              ) : (
                <span className="shrink-0 text-muted-foreground">ok</span>
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

function DebugJsonBlock({ title, value }: { title: string; value: unknown }) {
  const text = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);

  const copyJson = useCallback(() => {
    void navigator.clipboard.writeText(text);
  }, [text]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[11px] font-medium text-muted-foreground">{title}</h4>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={copyJson}>
          <Copy className="mr-1 h-3 w-3" />
          Copy JSON
        </Button>
      </div>
      <pre className="custom-scrollbar-thin max-h-56 overflow-auto rounded-md border bg-muted/30 p-2.5 font-mono text-[10px] leading-relaxed">
        {text}
      </pre>
    </div>
  );
}

function ResultPanel({ result }: { result: EffectFolderCopyResult }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium">Copy finished</p>
          <p className="text-[11px] text-muted-foreground">
            Wrote {result.copiedFiles.length} file(s). Destination pack now lists {result.totalFiles} total
            structure file record(s).
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-md border px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Copied</div>
          <div className="text-lg font-semibold tabular-nums">{result.copiedFiles.length}</div>
        </div>
        <div className="rounded-md border px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Skipped</div>
          <div className="text-lg font-semibold tabular-nums">{result.skipped.length}</div>
        </div>
        <div className="rounded-md border px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Warnings</div>
          <div className="text-lg font-semibold tabular-nums">{result.warnings.length}</div>
        </div>
      </div>

      <PathBlock label="Destination root" path={result.destinationEffectRoot} />
      <PathBlock label="Destination structure JSON" path={result.destinationStructureJsonPath} />

      {result.copiedFiles.length > 0 ? (
        <section className="space-y-1.5">
          <h4 className="text-[11px] font-medium">Copied paths</h4>
          <ul className="max-h-40 space-y-1 overflow-auto rounded-md border bg-muted/20 p-2 font-mono text-[10px]">
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
            Skipped
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
            Backend warnings
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
  sourceEffectRoot,
  sourceStructureJsonPath,
  selectedItems,
  allItems,
  busy = false,
  onCopy,
}: EffectFolderCopyDialogProps) {
  const [destinationRoot, setDestinationRoot] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<DialogPhase>("plan");
  const [lastResult, setLastResult] = useState<EffectFolderCopyResult | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  const plan = useMemo(
    () => buildEffectFolderCopyPlan({ selectedItems, allItems }),
    [allItems, selectedItems],
  );

  const selections: EffectFolderSelection[] = useMemo(
    () => toEffectFolderSelections(selectedItems),
    [selectedItems],
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

  const debugRequest = useMemo(
    () => ({
      command: "copy_effect_folder_selection",
      sourceEffectRoot,
      sourceStructureJsonPath,
      destinationEffectRoot: destinationRoot.trim() || null,
      destinationStructureJsonPath: destinationStructurePath || null,
      selections,
      selectedLabels: selectedItems.map((item) => ({
        key: item.category,
        label: effectListItemLabel(item),
      })),
      planSummary: plan.summary,
    }),
    [
      destinationRoot,
      destinationStructurePath,
      plan.summary,
      selectedItems,
      selections,
      sourceEffectRoot,
      sourceStructureJsonPath,
    ],
  );

  useEffect(() => {
    if (!dialogOpen) return;
    setDestinationRoot("");
    setError(null);
    setPhase("plan");
    setLastResult(null);
    setActiveTab("overview");
    setHowItWorksOpen(false);
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
      setError("Pick a destination effect pack folder.");
      return;
    }
    if (selectedItems.length === 0) {
      setError("No entries selected.");
      return;
    }
    if (plan.summary.transferFileCount === 0) {
      setError("Nothing transferable in the current selection (check unsupported entries).");
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
  }, [destinationRoot, onCopy, onOpenChange, plan.summary.transferFileCount, selectedItems.length]);

  const canSubmit =
    !busy &&
    selectedItems.length > 0 &&
    plan.summary.transferFileCount > 0 &&
    destinationRoot.trim().length > 0 &&
    phase === "plan";

  return (
    <Dialog open={dialogOpen} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,880px)] w-[min(96vw,920px)] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-2 border-b px-5 pb-3 pt-5 text-left">
          <DialogTitle className="pr-8 text-base">Copy effect entries</DialogTitle>
          <DialogDescription className="text-[12px] leading-relaxed">
            Copy selection and matching source-local dependencies. Source remains unchanged.
          </DialogDescription>
          <SummaryChips plan={plan} />
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-[min(58vh,560px)]">
            <div className="space-y-4 px-5 py-4">
              {/* Source → Destination */}
              <section className="rounded-lg border bg-muted/15 p-3">
                <div className="hidden">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Source pack
                  </div>
                  <PathBlock label="Effect root" path={sourceEffectRoot} />
                  <PathBlock label="Structure JSON" path={sourceStructureJsonPath} />
                  <PathBlock
                    label="Selection"
                    path={`${selectedItems.length} entr${selectedItems.length === 1 ? "y" : "ies"}`}
                    mono={false}
                  />
                </div>

                <div className="hidden">
                  <ArrowRight className="hidden h-4 w-4 md:block" aria-hidden />
                  <span className="text-[10px] uppercase tracking-wide md:hidden">to</span>
                </div>

                <div className="space-y-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Destination pack
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="effect-copy-destination" className="text-[11px]">
                      Effect pack folder
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
                        Browse
                      </Button>
                    </div>
                  </div>
                  <p className="hidden">
                    Destination must already be an extracted effect pack with a sibling{" "}
                    <span className="font-mono">*_structure.json</span>. Existing entries with the same
                    extension + hash are skipped, not overwritten.
                  </p>
                </div>
              </section>

              {plan.warnings.length > 0 ? (
                <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
                  <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Plan warnings</p>
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
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="files" className="text-xs">
                    Files
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-3 space-y-4 focus-visible:outline-none">
                  <SelectionListPanel
                    title="What you selected"
                    empty="No entries selected."
                    entries={plan.selected}
                  />
                  {plan.dependencies.length > 0 ? (
                    <SelectionListPanel
                      title="Included dependencies"
                      empty=""
                      entries={plan.dependencies}
                    />
                  ) : null}

                  <Collapsible className="hidden" open={howItWorksOpen} onOpenChange={setHowItWorksOpen}>
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 w-full justify-between px-2 text-xs font-medium"
                      >
                        How this copy works
                        <ChevronDown
                          className={cn("h-3.5 w-3.5 transition-transform", howItWorksOpen && "rotate-180")}
                        />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 px-1 pb-1">
                      <ol className="list-decimal space-y-1.5 pl-5 text-[11px] leading-relaxed text-muted-foreground">
                        {plan.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                      <div className="rounded-md border bg-muted/20 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                        <p className="font-medium text-foreground">Behavior notes</p>
                        <ul className="mt-1 list-disc space-y-1 pl-4">
                          <li>
                            Selecting an <span className="font-mono">.efxbn</span> includes matching source
                            assets identified by filename-stem CRC32: <span className="font-mono">modelId</span>,{" "}
                            <span className="font-mono">animationId</span>, texture-parameter IDs, and textures
                            referenced by copied model NUMATB files.
                          </li>
                          <li>
                            Legacy <span className="font-mono">idTable</span> pairs are control-curve references,
                            not structure <span className="font-mono">fileIndex</span> values. They never add files.
                            Referenced assets absent from the source pack are treated as global and ignored.
                          </li>
                          <li>
                            Destination collisions (same <span className="font-mono">ext + hash</span>) are
                            skipped and reported; files already present are not overwritten.
                          </li>
                          <li>
                            Manually selected “other” files are listed but not transferred. Source NUANMB files
                            referenced by EFXBN <span className="font-mono">animationId</span> are included
                            automatically.
                          </li>
                          <li>
                            After copy, repack the <em>destination</em> pack if you need a new{" "}
                            <span className="font-mono">.fhm2d</span> for the game.
                          </li>
                        </ul>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </TabsContent>

                <TabsContent value="files" className="mt-3 focus-visible:outline-none">
                  {plan.transferFiles.length === 0 ? (
                    <p className="rounded-md border border-dashed px-3 py-6 text-center text-[11px] text-muted-foreground">
                      No transferable files in this plan.
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="h-8 text-[10px]">Role</TableHead>
                            <TableHead className="h-8 text-[10px]">Kind</TableHead>
                            <TableHead className="h-8 text-[10px]">Name</TableHead>
                            <TableHead className="h-8 text-[10px]">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {plan.transferFiles.map((file) => (
                            <TableRow key={`${file.entryKey}:${file.path}`}>
                              <TableCell className="py-1.5 align-top text-[10px] text-muted-foreground">
                                {roleLabel(file.role)}
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
                                  <span className="text-amber-700 dark:text-amber-400">missing on disk</span>
                                ) : (
                                  <span className="text-muted-foreground">will copy if dest free</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  <p className="hidden">
                    Paths are from the source pack. Destination filenames keep the source base name when
                    free; collisions get a unique sibling name. Structure indices are reassigned on the
                    destination side.
                  </p>
                </TabsContent>

                <TabsContent value="result" className="mt-3 focus-visible:outline-none">
                  {lastResult ? (
                    <ResultPanel result={lastResult} />
                  ) : (
                    <p className="rounded-md border border-dashed px-3 py-6 text-center text-[11px] text-muted-foreground">
                      Run the copy to see backend results here.
                    </p>
                  )}
                </TabsContent>

                <TabsContent value="debug" className="mt-3 space-y-4 focus-visible:outline-none">
                  <div className="rounded-md border bg-muted/15 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                    Debug payload mirrors the Tauri command{" "}
                    <span className="font-mono text-foreground">copy_effect_folder_selection</span> and the
                    frontend plan computed from inventory (aligned with{" "}
                    <span className="font-mono text-foreground">build_copy_closure</span>). Use this when
                    reporting skipped items or incomplete dependency pull-in.
                  </div>
                  <DebugJsonBlock title="Request payload" value={debugRequest} />
                  <DebugJsonBlock
                    title="Copy plan"
                    value={{
                      summary: plan.summary,
                      warnings: plan.warnings,
                      steps: plan.steps,
                      selected: plan.selected,
                      dependencies: plan.dependencies,
                      transferFiles: plan.transferFiles,
                    }}
                  />
                  {lastResult ? <DebugJsonBlock title="Last result" value={lastResult} /> : null}
                  {error ? <DebugJsonBlock title="Last error" value={{ message: error }} /> : null}
                </TabsContent>
              </Tabs>
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t px-5 py-3 sm:justify-between">
          <div className="mr-auto hidden text-[11px] text-muted-foreground sm:block">
            {phase === "result"
              ? "Review the Result / Debug tabs, then close."
              : `${plan.summary.transferFileCount} file(s) planned · source unchanged`}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              {phase === "result" ? "Close" : "Cancel"}
            </Button>
            {phase === "plan" ? (
              <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
                Copy {plan.summary.transferFileCount > 0 ? `${plan.summary.transferFileCount} file(s)` : ""}
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
                Copy again
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
