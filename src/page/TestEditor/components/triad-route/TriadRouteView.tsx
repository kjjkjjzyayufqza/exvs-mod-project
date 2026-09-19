import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { MoreHorizontal, RefreshCw, Route as RouteIcon, Save, Tags } from "lucide-react";
import { exists } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type {
  TestEditorWorkspaceDocument,
  WorkspacePackIdentity,
} from "@/services/testEditorWorkspace/types";
import {
  createDormantRouteDraft,
  setStageLineup,
  summariseIssues,
  type SquadLineup,
} from "@/services/triadRoute/routeDraft";
import { parseIssueLocation } from "@/services/triadRoute/issueLocation";
import {
  applyTriadRoute,
  loadTriadBriefing,
  loadTriadStageScript,
  loadTriadWorkspace,
  renameTriadBriefings,
  validateTriadRoute,
} from "@/services/triadRoute/triadRouteService";
import {
  categoryLetter,
  TRIAD_ROUTE_SCHEMA,
  type BriefingDraft,
  type CourseRow,
  type DormantSceneGroup,
  type ReferenceList,
  type StageDraft,
  type TriadRouteDocument,
  type TriadWorkspaceSnapshot,
  type ValidationIssue,
} from "@/services/triadRoute/types";
import { CourseEditorPanel } from "./CourseEditorPanel";
import { MissingPacksNotice } from "./MissingPacksNotice";
import { RouteBrowser } from "./RouteBrowser";
import { RouteWizardDialog, type RouteWizardValues } from "./RouteWizardDialog";
import { StageInspector } from "./StageInspector";
import { ValidationPanel } from "./ValidationPanel";
import type { IssueFocusRequest } from "./issueFocus";
import { useConfigStore } from "@/store/configStore";
import {
  buildExpectedStageScriptFolder,
  buildStageScriptFolderCandidates,
  extractStageScriptPackage,
  initTriadPacks,
  loadUnitNames,
  mutatedTriadPacks,
  resolveTriadPacks,
  touchedContentIds,
  type ResolvedTriadPacks,
  type UnitNameMap,
} from "./triadRouteWorkspace";
import { emptyUnitCatalog } from "./characterListUnitCatalog";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "missing"; packs: ResolvedTriadPacks }
  | { status: "error"; message: string }
  | {
      status: "ready";
      packs: ResolvedTriadPacks;
      snapshot: TriadWorkspaceSnapshot;
      units: UnitNameMap;
    };

/** Findings the checker produced, plus what it could not look at. */
interface CheckState {
  issues: ValidationIssue[];
  blocked: boolean;
  notChecked: ReferenceList[];
}

const NO_CHECKS: CheckState = { issues: [], blocked: false, notChecked: [] };

export type TriadRouteViewProps = {
  folderPath: string;
  workspaceDocument: TestEditorWorkspaceDocument;
  /** Accepted for parity with the sibling tabs; MainView passes a constant. */
  isActive?: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  onPackMutated?: (pack: WorkspacePackIdentity) => void;
  onRevealTreeFolder?: (path: string) => void;
  onOpenMscFolder?: (path: string) => void;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The arcade route editor.
 *
 * Checks sit in a folded strip at the top so a clean route does not spend a
 * column on an empty list. Below that: pick a route on the left, and edit
 * the course row plus every stage field in one wide scroller. Settings stay
 * open; the page scrolls instead of nesting drawers. Saving writes the
 * workspace folders only; putting the route in the game is the existing
 * repack step.
 */
export function TriadRouteView({
  folderPath,
  workspaceDocument,
  onUnsavedChanges,
  onPackMutated,
  onRevealTreeFolder,
  onOpenMscFolder,
}: TriadRouteViewProps) {
  const { t } = useTranslation("test-triad-route");
  const obDplCachePath = useConfigStore((store) => store.obDplCachePath);
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [draft, setDraft] = useState<TriadRouteDocument | null>(null);
  /**
   * The draft as it was opened, serialised. Reading a stage's script rewrites
   * the draft without editing the route, so "has unsaved changes" is a
   * comparison against this rather than "a draft exists".
   */
  const [baseline, setBaseline] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState(1);
  const [checks, setChecks] = useState<CheckState>(NO_CHECKS);
  const [focus, setFocus] = useState<IssueFocusRequest | null>(null);
  const [isChecking, startChecking] = useTransition();
  const [isSaving, setIsSaving] = useState(false);
  const [wizardGroup, setWizardGroup] = useState<DormantSceneGroup | null>(null);
  const [scriptErrors, setScriptErrors] = useState<Record<number, string>>({});
  const [readingStage, setReadingStage] = useState<number | null>(null);
  const [scriptFolderState, setScriptFolderState] = useState<{
    path: string | null;
    exists: boolean;
  }>({ path: null, exists: false });
  const [isInitialising, setIsInitialising] = useState(false);
  const loadTokenRef = useRef(0);

  const load = useCallback(async () => {
    const token = (loadTokenRef.current += 1);
    setState({ status: "loading" });
    try {
      const packs = await resolveTriadPacks(folderPath, workspaceDocument);
      if (packs.missing.length > 0) {
        if (token === loadTokenRef.current) {
          setState({ status: "missing", packs });
        }
        return;
      }
      const [snapshot, units] = await Promise.all([
        loadTriadWorkspace(packs.paths),
        loadUnitNames(folderPath, workspaceDocument).catch(() => emptyUnitCatalog()),
      ]);
      if (token !== loadTokenRef.current) return;
      setState({ status: "ready", packs, snapshot, units });
    } catch (error) {
      if (token !== loadTokenRef.current) return;
      setState({ status: "error", message: errorMessage(error) });
    }
  }, [folderPath, workspaceDocument]);

  // MainView only mounts the active tab's content, so being rendered is what
  // "visible" means here; the `isActive` prop it passes is a legacy constant.
  useEffect(() => {
    if (!folderPath || state.status !== "idle") return;
    void load();
  }, [folderPath, state.status, load]);

  const hasChanges = useMemo(
    () => draft !== null && JSON.stringify(draft) !== baseline,
    [draft, baseline],
  );

  useEffect(() => {
    onUnsavedChanges?.(hasChanges);
  }, [hasChanges, onUnsavedChanges]);

  const runValidation = useCallback(
    (document: TriadRouteDocument) => {
      if (state.status !== "ready") return;
      const context = state.snapshot.validationContext;
      startChecking(() => {
        void validateTriadRoute(document, context)
          .then((result) =>
            setChecks({
              issues: result.issues,
              blocked: result.blocked,
              notChecked: result.notChecked,
            }),
          )
          .catch((error) =>
            setChecks({
              issues: [
                {
                  code: "validator-failed",
                  severity: "error",
                  message: errorMessage(error),
                  location: "document",
                },
              ],
              blocked: true,
              notChecked: [],
            }),
          );
      });
    },
    [state],
  );

  /** Replace the draft with an edited version; the baseline stays put. */
  const editDraft = useCallback(
    (next: TriadRouteDocument) => {
      setDraft(next);
      runValidation(next);
    },
    [runValidation],
  );

  /**
   * Replace the draft wholesale.
   *
   * Opening a route or reading data back from disk is not an edit, so those
   * adopt the new document as the saved state. A route claimed from unused
   * scenes exists nowhere on disk yet, so it is `dirty` from the first frame.
   */
  const adoptDraft = useCallback(
    (next: TriadRouteDocument | null, options: { dirty?: boolean } = {}) => {
      setDraft(next);
      setBaseline(next && !options.dirty ? JSON.stringify(next) : null);
      setFocus(null);
      if (next) {
        runValidation(next);
      } else {
        setChecks(NO_CHECKS);
      }
    },
    [runValidation],
  );

  /** Put the modder in front of the section a finding is about. */
  const focusIssue = useCallback((location: string) => {
    const target = parseIssueLocation(location);
    if (target.stage !== null) setActiveStage(target.stage);
    setFocus({ location, token: Date.now() });
  }, []);

  const discard = useCallback(() => {
    adoptDraft(null);
    setScriptErrors({});
    setActiveStage(1);
  }, [adoptDraft]);

  const openCourse = useCallback(
    async (course: CourseRow) => {
      if (state.status !== "ready") return;
      try {
        const keys = course.stageSceneKeys.filter((key) => key !== 0);
        const briefings = await Promise.all(
          keys.map((key) => loadTriadBriefing(state.packs.paths.outmissionDir, key)),
        );
        const sceneNumbers = new Map(
          state.snapshot.scenes.map((scene) => [scene.sceneKey, scene.sceneNo]),
        );
        const packages = new Map(
          state.snapshot.sceneIdRows.map((row) => [row.sceneKey, row.packageHash]),
        );
        const sceneNames = new Map(
          state.snapshot.sceneIdRows.map((row) => [row.sceneKey, row.sceneName]),
        );
        const stages: StageDraft[] = keys.map((key, index) => ({
          index: index + 1,
          sceneKey: key,
          sceneName: sceneNames.get(key) ?? null,
          sceneNo: sceneNumbers.get(key) ?? 0,
          scriptPackageHash: packages.get(key) ?? 0,
          briefing: briefings[index],
          script: null,
        }));
        const next: TriadRouteDocument = {
          schema: TRIAD_ROUTE_SCHEMA,
          mode: "rewrite-existing",
          course: {
            rowId: course.rowId,
            templateRowId: course.rowId,
            courseId: course.courseId,
            name: course.name,
            category: course.category,
            numberInCategory: course.numberInCategory,
            initiallyOpen: course.initiallyOpen === 1,
            unlockType: course.unlockType,
            unlockArg0: course.unlockArg0,
            unlockArg1: course.unlockArg1,
            variant: course.variant,
            goldScore: course.goldScore,
            starRating: course.starRating,
            displayUnitIds: [...course.displayUnitIds],
          },
          stages,
          ribbons: [],
        };
        setScriptErrors({});
        setActiveStage(1);
        adoptDraft(next);
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },
    [state, adoptDraft],
  );

  const createFromDormant = useCallback(
    async (group: DormantSceneGroup, values: RouteWizardValues) => {
      if (state.status !== "ready") return;
      const template = state.snapshot.courses.find(
        (course) => course.category === values.category,
      ) ?? state.snapshot.courses[0];
      if (!template) {
        toast.error(t("load.emptyCourseTable"));
        return;
      }
      try {
        const briefings: BriefingDraft[] = await Promise.all(
          group.scenes.map((scene) =>
            loadTriadBriefing(state.packs.paths.outmissionDir, scene.sceneKey),
          ),
        );
        const next = createDormantRouteDraft({
          template,
          scenes: group.scenes,
          briefings,
          courseId: values.courseId,
          name: values.name,
          category: values.category,
          numberInCategory: values.numberInCategory,
          firstSceneNumber: values.firstSceneNumber,
          initiallyOpen: values.initiallyOpen,
          starRating: values.starRating,
          goldScore: values.goldScore,
        });
        setWizardGroup(null);
        setScriptErrors({});
        setActiveStage(1);
        adoptDraft(next, { dirty: true });
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },
    [state, t, adoptDraft],
  );

  /**
   * Read a stage's mission script so its slots become editable.
   *
   * Attempted once per stage; a stage whose script package is not unpacked, or
   * whose script this build will not rewrite, keeps its reason on screen
   * instead of silently looking like a stage with no units. Reading is not an
   * edit, so the baseline moves with it.
   */
  const readStageScript = useCallback(
    async (stageIndex: number, options?: { reload?: boolean }) => {
      if (state.status !== "ready" || !draft) return;
      const stage = draft.stages.find((entry) => entry.index === stageIndex);
      if (!stage) return;
      if (stage.script && !options?.reload) return;
      setReadingStage(stageIndex);
      try {
        const script = await loadTriadStageScript(
          state.packs.paths.scriptDirs,
          stage.sceneKey,
          stage.sceneName,
        );
        setScriptErrors((current) => {
          const next = { ...current };
          delete next[stageIndex];
          return next;
        });
        const next: TriadRouteDocument = {
          ...draft,
          stages: draft.stages.map((entry) =>
            entry.index === stageIndex ? { ...entry, script } : entry,
          ),
        };
        setDraft(next);
        setBaseline((current) =>
          current === null ? null : JSON.stringify(next),
        );
        runValidation(next);
      } catch (error) {
        setScriptErrors((current) => ({ ...current, [stageIndex]: errorMessage(error) }));
      } finally {
        setReadingStage(null);
      }
    },
    [state, draft, runValidation],
  );

  const activeStageNeedsScript =
    draft?.stages.find((entry) => entry.index === activeStage)?.script === null &&
    scriptErrors[activeStage] === undefined &&
    readingStage === null;

  useEffect(() => {
    if (state.status !== "ready" || !activeStageNeedsScript) return;
    void readStageScript(activeStage);
  }, [state.status, activeStageNeedsScript, activeStage, readStageScript]);

  /** Unpack this stage's script package, then read it. */
  const extractStageScript = useCallback(
    async (stageIndex: number) => {
      if (state.status !== "ready" || !draft) return;
      const stage = draft.stages.find((entry) => entry.index === stageIndex);
      if (!stage) return;
      const sceneName = stage.sceneName;
      if (!sceneName) {
        toast.error(t("stages.scriptLoadFailed", { message: t("stages.scriptNotRead") }));
        return;
      }
      setReadingStage(stageIndex);
      try {
        const target = await extractStageScriptPackage({
          dplCacheDir: obDplCachePath ?? "",
          workspaceRoot: folderPath,
          document: workspaceDocument,
          packageHash: stage.scriptPackageHash,
          sceneName,
        });
        toast.success(t("stages.extractScriptDone", { path: target }));
        setScriptFolderState({ path: target, exists: true });
        setScriptErrors((current) => {
          const next = { ...current };
          delete next[stageIndex];
          return next;
        });
        await readStageScript(stageIndex, { reload: true });
      } catch (error) {
        toast.error(t("stages.scriptLoadFailed", { message: errorMessage(error) }));
      } finally {
        setReadingStage(null);
      }
    },
    [state, draft, obDplCachePath, folderPath, workspaceDocument, t, readStageScript],
  );

  /** Unpack the route packages the editor is missing, then reload. */
  const initialiseMissingPacks = useCallback(
    async (packs: ResolvedTriadPacks) => {
      setIsInitialising(true);
      try {
        const done = await initTriadPacks({
          ids: packs.notUnpacked,
          dplCacheDir: obDplCachePath ?? "",
          workspaceRoot: folderPath,
          document: workspaceDocument,
        });
        toast.success(t("load.initialised", { packs: done.join(", ") }));
        setState({ status: "idle" });
      } catch (error) {
        toast.error(t("load.initialiseFailed", { message: errorMessage(error) }));
      } finally {
        setIsInitialising(false);
      }
    },
    [obDplCachePath, folderPath, workspaceDocument, t],
  );

  const renameBriefings = useCallback(async () => {
    if (state.status !== "ready") return;
    try {
      const report = await renameTriadBriefings(state.packs.paths.outmissionDir);
      toast.success(
        t("browser.renameDone", {
          count: report.renamed.length,
          unchanged: report.unchanged,
        }),
      );
    } catch (error) {
      toast.error(t("browser.renameFailed", { message: errorMessage(error) }));
    }
  }, [state, t]);

  const save = useCallback(async () => {
    if (state.status !== "ready" || !draft) return;
    if (checks.blocked) {
      toast.error(t("save.blocked"));
      return;
    }
    setIsSaving(true);
    try {
      const applied = await applyTriadRoute(draft, state.packs.paths);
      const touched = touchedContentIds(
        state.packs,
        applied.written.map((file) => file.path),
      );
      for (const pack of mutatedTriadPacks(state.packs, touched)) {
        onPackMutated?.(pack);
      }
      toast.success(t("save.done", { count: applied.written.length }));
      adoptDraft(null);
      setScriptErrors({});
      await load();
    } catch (error) {
      toast.error(t("save.failed", { message: errorMessage(error) }));
    } finally {
      setIsSaving(false);
    }
  }, [state, draft, checks.blocked, onPackMutated, t, load, adoptDraft]);

  const stage = useMemo(
    () => draft?.stages.find((entry) => entry.index === activeStage) ?? draft?.stages[0] ?? null,
    [draft, activeStage],
  );
  const summary = useMemo(() => summariseIssues(checks.issues), [checks.issues]);

  useEffect(() => {
    let cancelled = false;
    const expected = stage
      ? buildExpectedStageScriptFolder(folderPath, workspaceDocument, stage.sceneName)
      : null;
    const candidates = [
      expected,
      ...buildStageScriptFolderCandidates(
        state.status === "ready" ? state.packs.paths.scriptDirs : [],
        stage?.sceneName ?? null,
      ),
    ].filter((path): path is string => Boolean(path));

    const probe = async () => {
      for (const path of candidates) {
        if (await exists(path)) {
          if (!cancelled) setScriptFolderState({ path, exists: true });
          return;
        }
      }
      if (!cancelled) setScriptFolderState({ path: expected, exists: false });
    };
    void probe();
    return () => {
      cancelled = true;
    };
  }, [folderPath, workspaceDocument, stage, state, readingStage]);

  const openScriptFolder = useCallback(async (path: string) => {
    try {
      await openPath(path);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, []);

  if (!folderPath) {
    return <p className="p-4 text-sm text-muted-foreground">{t("load.noWorkspace")}</p>;
  }

  if (state.status === "loading" || state.status === "idle") {
    return <RouteViewSkeleton label={t("load.loading")} />;
  }

  if (state.status === "missing") {
    const packs = state.packs;
    return (
      <MissingPacksNotice
        packs={packs}
        dplCacheDir={obDplCachePath ?? ""}
        isInitialising={isInitialising}
        onInitialise={() => void initialiseMissingPacks(packs)}
        onReload={() => void load()}
      />
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col items-start gap-3 p-4">
        <p className="text-sm text-destructive" style={{ textWrap: "pretty" }}>
          {t("load.failed", { message: state.message })}
        </p>
        <p className="font-mono text-[11px] text-muted-foreground">{folderPath}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-1.5 size-4" />
          {t("load.reload")}
        </Button>
      </div>
    );
  }

  const letter = draft ? categoryLetter(draft.course.category) : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <RouteIcon className="size-4 shrink-0 text-muted-foreground" />
              {t("title")}
            </h2>
            <p className="truncate text-[11px] text-muted-foreground">{t("subtitle")}</p>
          </div>
          {draft ? (
            <span className="flex min-w-0 items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1 text-xs">
              {letter ? (
                <span className="flex size-5 shrink-0 items-center justify-center rounded bg-background font-semibold">
                  {letter}
                </span>
              ) : null}
              <span className="truncate font-medium">{draft.course.name || "—"}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {t("browser.courseId", { id: draft.course.courseId })}
                {draft.course.variant > 0
                  ? ` · ${t("browser.variant", { number: draft.course.variant })}`
                  : ""}
              </span>
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          {hasChanges ? (
            <span className="px-1.5 text-[11px] font-medium tabular-nums text-amber-600 dark:text-amber-400">
              {t("common.unsaved")}
            </span>
          ) : null}
          {draft ? (
            <Button type="button" variant="ghost" size="sm" onClick={discard}>
              {t("common.discard")}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={!draft || checks.blocked || isSaving}
            onClick={() => void save()}
            title={checks.blocked ? t("save.blockedBy", { count: summary.error }) : undefined}
          >
            <Save className={cn("mr-1.5 size-4", isSaving && "animate-pulse")} />
            {isSaving
              ? t("save.saving")
              : checks.blocked
                ? t("save.blockedBy", { count: summary.error })
                : t("save.action")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-9"
                aria-label={t("save.more")}
                title={t("save.more")}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void renameBriefings()}>
                <Tags className="mr-2 size-4" />
                {t("browser.renameBriefings")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void load()}>
                <RefreshCw className="mr-2 size-4" />
                {t("load.reload")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <ValidationPanel
        issues={checks.issues}
        notChecked={checks.notChecked}
        hasRoute={draft !== null}
        isChecking={isChecking}
        onRecheck={() => (draft ? runValidation(draft) : undefined)}
        onFocusIssue={focusIssue}
      />

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[16.5rem_minmax(0,1fr)]">
        <RouteBrowser
          courses={state.snapshot.courses}
          dormantScenes={state.snapshot.dormantScenes}
          selectedCourseRowId={draft?.course.rowId ?? null}
          onSelectCourse={(course) => void openCourse(course)}
          onClaimDormantGroup={setWizardGroup}
        />

        {draft && stage ? (
          <ScrollArea className="min-h-0 min-w-0">
            <div className="flex flex-col gap-3 pr-2.5 pb-3">
              <CourseEditorPanel
                course={draft.course}
                units={state.units}
                issues={checks.issues}
                focus={focus}
                onChange={(course) => editDraft({ ...draft, course })}
              />
              <StageInspector
                stage={stage}
                stages={draft.stages}
                units={state.units}
                pilots={state.snapshot.pilotNames}
                issues={checks.issues}
                focus={focus}
                onSelectStage={setActiveStage}
                onChangeStage={(next) =>
                  editDraft({
                    ...draft,
                    stages: draft.stages.map((entry) =>
                      entry.index === next.index ? next : entry,
                    ),
                  })
                }
                onGenerateLineup={(lineup: SquadLineup) =>
                  editDraft(setStageLineup(draft, stage.index, lineup))
                }
                scriptFolder={scriptFolderState.path}
                scriptFolderExists={scriptFolderState.exists}
                onOpenScriptFolder={(path) => void openScriptFolder(path)}
                onRevealScriptFolder={onRevealTreeFolder}
                onOpenScriptInMsc={onOpenMscFolder}
                scriptError={scriptErrors[stage.index] ?? null}
                isReadingScript={readingStage === stage.index}
                onReadScript={() => void readStageScript(stage.index)}
                onExtractScript={() => void extractStageScript(stage.index)}
              />
            </div>
          </ScrollArea>
        ) : (
          <EmptyEditor hint={t("editor.emptyBody")} />
        )}
      </div>

      <RouteWizardDialog
        group={wizardGroup}
        courses={state.snapshot.courses}
        scenes={state.snapshot.scenes}
        template={state.snapshot.courses[0] ?? null}
        onCancel={() => setWizardGroup(null)}
        onCreate={(values) =>
          wizardGroup ? void createFromDormant(wizardGroup, values) : undefined
        }
      />
    </div>
  );
}

/** Loading placeholders shaped like the columns they replace. */
function RouteViewSkeleton({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3" aria-busy="true" aria-label={label}>
      <div className="h-9 w-56 animate-pulse rounded-md bg-muted" />
      <div className="h-10 animate-pulse rounded-lg bg-muted/60" />
      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[16.5rem_minmax(0,1fr)]">
        <div className="h-full animate-pulse rounded-lg bg-muted/60" />
        <div className="flex min-h-0 flex-col gap-3">
          <div className="h-48 animate-pulse rounded-lg bg-muted/60" />
          <div className="h-full animate-pulse rounded-lg bg-muted/40" />
        </div>
      </div>
    </div>
  );
}

function EmptyEditor({ hint }: { hint: string }) {
  const { t } = useTranslation("test-triad-route");
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-card/20 p-8 text-center">
      <RouteIcon className="size-6 text-muted-foreground/60" />
      <p className="text-sm font-medium" style={{ textWrap: "balance" }}>
        {t("editor.emptyTitle")}
      </p>
      <p
        className="max-w-md text-xs text-muted-foreground"
        style={{ textWrap: "pretty" }}
      >
        {hint}
      </p>
    </div>
  );
}
