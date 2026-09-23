import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { MoreHorizontal, PackageCheck, RefreshCw, Route as RouteIcon, Save, Tags } from "lucide-react";
import { exists } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { TestEditorWorkspaceDocument, WorkspacePackIdentity } from "@/services/testEditorWorkspace/types";
import { createClonedRouteDraft, createDormantRouteDraft, setStageLineup, summariseIssues, type SquadLineup } from "@/services/triadRoute/routeDraft";
import { appendClonedStages, canExtendStages } from "./extendStages";
import { ExtendStagesDialog, type ExtendStagesValues } from "./ExtendStagesDialog";
import { parseIssueLocation } from "@/services/triadRoute/issueLocation";
import {
  applyTriadRoute,
  createTriadScenes,
  loadTriadBriefing,
  loadTriadStageScript,
  loadTriadWorkspace,
  planTriadRepack,
  previewTriadRoute,
  renameTriadBriefings,
  renumberTriadCategory,
  validateTriadRoute,
} from "@/services/triadRoute/triadRouteService";
import {
  categoryLetter,
  TRIAD_ROUTE_SCHEMA,
  type AppliedRoute,
  type BriefingDraft,
  type CourseDraft,
  type CourseRow,
  type DormantSceneGroup,
  type NewSceneRequest,
  type ReferenceList,
  type RoutePlan,
  type StageDraft,
  type TriadRepackEntry,
  type TriadRepackPlan,
  type TriadRouteDocument,
  type TriadWorkspaceSnapshot,
  type ValidationIssue,
} from "@/services/triadRoute/types";
import { CategoryOrderDialog } from "./CategoryOrderDialog";
import { CourseEditorPanel } from "./CourseEditorPanel";
import {
  applyCourseNumbers,
  courseSessionKey,
  deleteRouteSession,
  dirtyCourseRowIds,
  getRouteSession,
  mergeStageScript,
  putRouteSession,
  type RouteDraftSession,
} from "./draftSessions";
import { EditorPaneSkeleton } from "./EditorLoading";
import { MissingPacksNotice } from "./MissingPacksNotice";
import { RouteBrowser } from "./RouteBrowser";
import { RouteWizardDialog, type RouteWizardRequest, type RouteWizardValues, type WizardDonorStage } from "./RouteWizardDialog";
import { SavePreviewDialog } from "./SavePreviewDialog";
import { StageInspector } from "./StageInspector";
import { TriadRepackDialog } from "./TriadRepackDialog";
import { ValidationPanel } from "./ValidationPanel";
import { buildWorkspacePathRows } from "./workspacePathRows";
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
  triadPackKeyForRepackEntry,
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
/** Wait out a burst of field edits before asking Rust to re-check. */
const VALIDATION_DEBOUNCE_MS = 300;

export type TriadRouteViewProps = {
  folderPath: string;
  workspaceDocument: TestEditorWorkspaceDocument;
  /** Accepted for parity with the sibling tabs; MainView passes a constant. */
  isActive?: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  onPackMutated?: (pack: WorkspacePackIdentity) => void;
  /** Clears the workspace's "this pack changed" marker after a repack. */
  onPackRepacked?: (packKey: string) => void;
  onRevealTreeFolder?: (path: string) => void;
  onOpenMscFolder?: (path: string) => void;
  /** OB mod folder from Config; where a repack writes its `.fhm2d`. */
  modFolderPath?: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * What a save actually did.
 *
 * A save rebuilds every briefing and script of the route, so most of them
 * usually come out identical and are left on disk untouched. Reporting only
 * the write count would read as if the rest had failed.
 */
function saveSummary(t: TFunction, applied: AppliedRoute): string {
  const written = applied.written.length;
  const unchanged = applied.unchanged.length;
  if (written === 0) {
    return t("save.doneUnchanged", { count: unchanged });
  }
  if (unchanged === 0) {
    return t("save.done", { count: written });
  }
  return t("save.donePartial", { count: written, unchanged });
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
export function TriadRouteView({ folderPath, workspaceDocument, onUnsavedChanges, onPackMutated, onPackRepacked, onRevealTreeFolder, onOpenMscFolder, modFolderPath }: TriadRouteViewProps) {
  const { t } = useTranslation("test-triad-route");
  const obDplCachePath = useConfigStore((store) => store.obDplCachePath);
  const obModPath = useConfigStore((store) => store.obModPath);
  /** The prop wins so the tab agrees with the workspace page it lives in. */
  const modFolder = (modFolderPath ?? obModPath ?? "").trim();
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [draft, setDraft] = useState<TriadRouteDocument | null>(null);
  /** True after a field edit; reading a script is not an edit. */
  const [dirty, setDirty] = useState(false);
  const [activeStage, setActiveStage] = useState(1);
  const [checks, setChecks] = useState<CheckState>(NO_CHECKS);
  const [focus, setFocus] = useState<IssueFocusRequest | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  /** Course row currently being read from disk; null when idle or restoring a cache hit. */
  const [openingRowId, setOpeningRowId] = useState<number | null>(null);
  const [cachedDirtyRowIds, setCachedDirtyRowIds] = useState<number[]>([]);
  const [pendingUnsaved, setPendingUnsaved] = useState<{
    name: string;
    courseId: number;
    category: number;
    stages: number;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [wizardRequest, setWizardRequest] = useState<RouteWizardRequest | null>(null);
  const [isCreatingScenes, setIsCreatingScenes] = useState(false);
  /** Category whose reorder dialog is open, or null. */
  const [reorderCategory, setReorderCategory] = useState<number | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [scriptErrors, setScriptErrors] = useState<Record<number, string>>({});
  const [readingStage, setReadingStage] = useState<number | null>(null);
  const [scriptFolderState, setScriptFolderState] = useState<{
    path: string | null;
    exists: boolean;
  }>({ path: null, exists: false });
  const [isInitialising, setIsInitialising] = useState(false);
  const [isRepackOpen, setIsRepackOpen] = useState(false);
  const [repackPlan, setRepackPlan] = useState<TriadRepackPlan | null>(null);
  const [isRepackPlanning, setIsRepackPlanning] = useState(false);
  const [repackPlanError, setRepackPlanError] = useState<string | null>(null);
  /** Probe result per path row id, filled by the effect below. */
  const [pathPresence, setPathPresence] = useState<Record<string, boolean>>({});
  const loadTokenRef = useRef(0);
  const openTokenRef = useRef(0);
  const readTokenRef = useRef(0);
  const validationTokenRef = useRef(0);
  const validationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Newest snapshot, readable before a `setState` has been applied. */
  const snapshotRef = useRef<TriadWorkspaceSnapshot | null>(null);
  const draftRef = useRef<TriadRouteDocument | null>(null);
  const sessionsRef = useRef(new Map<string, RouteDraftSession>());
  draftRef.current = draft;

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
      const [snapshot, units] = await Promise.all([loadTriadWorkspace(packs.paths), loadUnitNames(folderPath, workspaceDocument).catch(() => emptyUnitCatalog())]);
      if (token !== loadTokenRef.current) return;
      snapshotRef.current = snapshot;
      setState({ status: "ready", packs, snapshot, units });
    } catch (error) {
      if (token !== loadTokenRef.current) return;
      setState({ status: "error", message: errorMessage(error) });
    }
  }, [folderPath, workspaceDocument]);

  /**
   * Re-read the tables without tearing the page down.
   *
   * Creating a scene puts a briefing and a package on disk that the snapshot
   * loaded at open time knows nothing about, and the checker reads the
   * snapshot: without this the brand-new stage is reported as having no
   * briefing. The fresh snapshot is returned as well as stored, because the
   * caller needs it before React has re-rendered.
   */
  const refreshSnapshot = useCallback(async (packs: ResolvedTriadPacks): Promise<TriadWorkspaceSnapshot> => {
    const snapshot = await loadTriadWorkspace(packs.paths);
    snapshotRef.current = snapshot;
    setState((current) => (current.status === "ready" ? { ...current, snapshot } : current));
    return snapshot;
  }, []);

  // MainView only mounts the active tab's content, so being rendered is what
  // "visible" means here; the `isActive` prop it passes is a legacy constant.
  useEffect(() => {
    if (!folderPath || state.status !== "idle") return;
    void load();
  }, [folderPath, state.status, load]);

  const hasChanges = dirty;

  useEffect(() => {
    onUnsavedChanges?.(hasChanges);
  }, [hasChanges, onUnsavedChanges]);

  /** Route prefix the mission scripts are unpacked under, e.g. `051mission`. */
  const missionScriptPrefix = useMemo(
    () => workspaceDocument.assetRoutes["mission.script"]?.prefix ?? "051mission",
    [workspaceDocument],
  );

  /**
   * Course rows with unsaved edits, the one on screen included.
   *
   * The open draft is only in the cached list once it has been stashed, so
   * it is folded in here rather than at each call site.
   */
  const unsavedRowIds = useMemo(() => {
    const openRowId = draft?.course.rowId;
    if (!dirty || openRowId == null || cachedDirtyRowIds.includes(openRowId)) {
      return cachedDirtyRowIds;
    }
    return [...cachedDirtyRowIds, openRowId];
  }, [cachedDirtyRowIds, dirty, draft]);

  const syncSessionFlags = useCallback((currentDirty: boolean, currentDraft: TriadRouteDocument | null) => {
    setCachedDirtyRowIds(
      dirtyCourseRowIds(sessionsRef.current.values(), {
        dirty: currentDirty,
        rowId: currentDraft?.course.rowId ?? null,
      }),
    );
    const pending = getRouteSession(sessionsRef.current, null);
    const source = currentDraft?.course.rowId == null ? currentDraft : pending?.draft;
    setPendingUnsaved(
      source
        ? {
            name: source.course.name,
            courseId: source.course.courseId,
            category: source.course.category,
            stages: source.stages.length,
          }
        : null,
    );
  }, []);

  const stashOpenDraft = useCallback(
    (currentDirty: boolean, currentChecks: CheckState, currentErrors: Record<number, string>, currentStage: number) => {
      const current = draftRef.current;
      if (!current) return;
      putRouteSession(sessionsRef.current, {
        draft: current,
        dirty: currentDirty,
        checks: currentChecks,
        scriptErrors: currentErrors,
        activeStage: currentStage,
      });
      syncSessionFlags(currentDirty, current);
    },
    [syncSessionFlags],
  );

  const restoreSession = useCallback(
    (session: RouteDraftSession) => {
      draftRef.current = session.draft;
      setDraft(session.draft);
      setDirty(session.dirty);
      setChecks(session.checks);
      setScriptErrors(session.scriptErrors);
      setActiveStage(session.activeStage);
      setFocus(null);
      syncSessionFlags(session.dirty, session.draft);
    },
    [syncSessionFlags],
  );

  const scheduleValidation = useCallback((document: TriadRouteDocument, delayMs: number) => {
    const snapshot = snapshotRef.current;
    if (!snapshot) return;
    if (validationTimerRef.current != null) {
      clearTimeout(validationTimerRef.current);
      validationTimerRef.current = null;
    }
    const token = (validationTokenRef.current += 1);
    const context = snapshot.validationContext;
    const run = () => {
      validationTimerRef.current = null;
      setIsChecking(true);
      void validateTriadRoute(document, context)
        .then((result) => {
          if (token !== validationTokenRef.current) return;
          setChecks({
            issues: result.issues,
            blocked: result.blocked,
            notChecked: result.notChecked,
          });
        })
        .catch((error) => {
          if (token !== validationTokenRef.current) return;
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
          });
        })
        .finally(() => {
          if (token === validationTokenRef.current) setIsChecking(false);
        });
    };
    if (delayMs <= 0) {
      run();
      return;
    }
    validationTimerRef.current = setTimeout(run, delayMs);
  }, []);

  useEffect(() => {
    return () => {
      if (validationTimerRef.current != null) clearTimeout(validationTimerRef.current);
    };
  }, []);

  /** Replace the draft with an edited version; reading a script does not go through here. */
  const editDraft = useCallback(
    (next: TriadRouteDocument) => {
      draftRef.current = next;
      setDraft(next);
      setDirty(true);
      scheduleValidation(next, VALIDATION_DEBOUNCE_MS);
    },
    [scheduleValidation],
  );

  const editCourse = useCallback(
    (course: CourseDraft) => {
      const current = draftRef.current;
      if (!current) return;
      editDraft({ ...current, course });
    },
    [editDraft],
  );

  const editStage = useCallback(
    (next: StageDraft) => {
      const current = draftRef.current;
      if (!current) return;
      editDraft({
        ...current,
        stages: current.stages.map((entry) => (entry.index === next.index ? next : entry)),
      });
    },
    [editDraft],
  );

  /**
   * Replace the draft wholesale.
   *
   * Opening a route or reading data back from disk is not an edit, so those
   * start clean. A route claimed from unused scenes exists nowhere on disk yet,
   * so it is `dirty` from the first frame.
   */
  const adoptDraft = useCallback(
    (next: TriadRouteDocument | null, options: { dirty?: boolean } = {}) => {
      draftRef.current = next;
      setDraft(next);
      setDirty(Boolean(next && options.dirty));
      setFocus(null);
      if (next) {
        scheduleValidation(next, 0);
      } else {
        validationTokenRef.current += 1;
        setChecks(NO_CHECKS);
        setIsChecking(false);
      }
      syncSessionFlags(Boolean(next && options.dirty), next);
    },
    [scheduleValidation, syncSessionFlags],
  );

  /** Put the modder in front of the section a finding is about. */
  const focusIssue = useCallback((location: string) => {
    const target = parseIssueLocation(location);
    if (target.stage !== null) setActiveStage(target.stage);
    setFocus({ location, token: Date.now() });
  }, []);

  const discard = useCallback(() => {
    deleteRouteSession(sessionsRef.current, draftRef.current?.course.rowId ?? null);
    adoptDraft(null);
    setScriptErrors({});
    setActiveStage(1);
    syncSessionFlags(false, null);
  }, [adoptDraft, syncSessionFlags]);

  const openCourse = useCallback(
    async (course: CourseRow) => {
      if (state.status !== "ready") return;
      if (draftRef.current?.course.rowId === course.rowId) return;

      stashOpenDraft(dirty, checks, scriptErrors, activeStage);

      const cached = getRouteSession(sessionsRef.current, course.rowId);
      if (cached) {
        openTokenRef.current += 1;
        readTokenRef.current += 1;
        setOpeningRowId(null);
        restoreSession(cached);
        return;
      }

      const token = (openTokenRef.current += 1);
      readTokenRef.current += 1;
      setOpeningRowId(course.rowId);
      try {
        const keys = course.stageSceneKeys.filter((key) => key !== 0);
        const briefings = await Promise.all(keys.map((key) => loadTriadBriefing(state.packs.paths.outmissionDir, key)));
        if (token !== openTokenRef.current) return;
        const sceneNumbers = new Map(state.snapshot.scenes.map((scene) => [scene.sceneKey, scene.sceneNo]));
        const packages = new Map(state.snapshot.sceneIdRows.map((row) => [row.sceneKey, row.packageHash]));
        const sceneNames = new Map(state.snapshot.sceneIdRows.map((row) => [row.sceneKey, row.sceneName]));
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
        if (token !== openTokenRef.current) return;
        toast.error(errorMessage(error));
      } finally {
        if (token === openTokenRef.current) setOpeningRowId(null);
      }
    },
    [state, dirty, checks, scriptErrors, activeStage, adoptDraft, stashOpenDraft, restoreSession],
  );

  const openPendingDraft = useCallback(() => {
    const cached = getRouteSession(sessionsRef.current, null);
    if (!cached) return;
    if (draftRef.current?.course.rowId == null) return;
    stashOpenDraft(dirty, checks, scriptErrors, activeStage);
    openTokenRef.current += 1;
    readTokenRef.current += 1;
    setOpeningRowId(null);
    restoreSession(cached);
  }, [dirty, checks, scriptErrors, activeStage, stashOpenDraft, restoreSession]);

  const createFromDormant = useCallback(
    async (group: DormantSceneGroup, values: RouteWizardValues) => {
      if (state.status !== "ready") return;
      stashOpenDraft(dirty, checks, scriptErrors, activeStage);
      const template = state.snapshot.courses.find((course) => course.category === values.category) ?? state.snapshot.courses[0];
      if (!template) {
        toast.error(t("load.emptyCourseTable"));
        return;
      }
      try {
        const briefings: BriefingDraft[] = await Promise.all(group.scenes.map((scene) => loadTriadBriefing(state.packs.paths.outmissionDir, scene.sceneKey)));
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
        setWizardRequest(null);
        setScriptErrors({});
        setActiveStage(1);
        adoptDraft(next, { dirty: true });
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },
    [state, t, adoptDraft, stashOpenDraft, dirty, checks, scriptErrors, activeStage],
  );

  /**
   * Mint a course's worth of brand-new scenes from a donor course.
   *
   * Each scene is a folder the game has never seen, so the files come first:
   * the backend clones the donor's script package under the new name, derives
   * both hashes from that name and registers the briefing in the outmission
   * package. Only once they exist is a draft built, because the route tables
   * are written against files, not intentions.
   */
  const createFromClone = useCallback(
    async (source: CourseRow, donors: WizardDonorStage[], values: RouteWizardValues) => {
      if (state.status !== "ready") return;
      if (values.sceneNames.length < 1 || donors.length < 1) {
        toast.error(t("wizard.sceneNameCountMismatch"));
        return;
      }
      const dplCacheDir = obDplCachePath?.trim() ?? "";
      if (!dplCacheDir) {
        toast.error(t("load.sourceMissing"));
        return;
      }
      // The stage count is chosen in the wizard, so it can ask for more stages
      // than the donor course has. Donors then repeat: stage 4 of a one-stage
      // donor is another copy of that stage, which is a usable starting point
      // rather than a reason to refuse.
      const requests: NewSceneRequest[] = values.sceneNames.map((sceneName, index) => {
        const donor = donors[index % donors.length];
        return {
          dplCacheDir,
          workspaceRoot: folderPath,
          scriptPrefix: missionScriptPrefix,
          outmissionDir: state.packs.paths.outmissionDir,
          donorSceneKey: donor.sceneKey,
          donorPackageHash: donor.packageHash,
          sceneName: sceneName.trim(),
        };
      });

      setIsCreatingScenes(true);
      stashOpenDraft(dirty, checks, scriptErrors, activeStage);
      try {
        const created = await createTriadScenes(
          requests,
          state.snapshot.sceneIdRows.map((row) => row.sceneKey),
          state.snapshot.validationContext.availablePackageHashes,
        );
        // The new briefing and package only exist now, so the tables have to
        // be re-read before the draft is checked against them.
        await refreshSnapshot(state.packs);
        const briefings: BriefingDraft[] = await Promise.all(created.map((scene) => loadTriadBriefing(state.packs.paths.outmissionDir, scene.sceneKey)));
        const next = createClonedRouteDraft({
          source,
          created,
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
        setWizardRequest(null);
        setScriptErrors({});
        setActiveStage(1);
        adoptDraft(next, { dirty: true });
        toast.success(t("wizard.created", { count: created.length }));
      } catch (error) {
        toast.error(t("wizard.createFailed", { message: errorMessage(error) }));
      } finally {
        setIsCreatingScenes(false);
      }
    },
    [state, t, adoptDraft, obDplCachePath, folderPath, workspaceDocument, missionScriptPrefix, refreshSnapshot, stashOpenDraft, dirty, checks, scriptErrors, activeStage],
  );

  const extendStages = useCallback(
    async (values: ExtendStagesValues) => {
      if (state.status !== "ready" || !draftRef.current) return;
      if (values.slots.length < 1) return;
      const current = draftRef.current;
      const requests: NewSceneRequest[] = [];
      for (const slot of values.slots) {
        const donor = current.stages.find((stage) => stage.index === slot.donorStageIndex);
        if (!donor) {
          toast.error(t("extend.failed", { message: t("extend.needScriptFolder") }));
          return;
        }
        const donorFolder = buildExpectedStageScriptFolder(folderPath, workspaceDocument, donor.sceneName);
        if (!donorFolder || !(await exists(donorFolder))) {
          toast.error(t("extend.needScriptFolder"));
          return;
        }
        requests.push({
          workspaceRoot: folderPath,
          scriptPrefix: missionScriptPrefix,
          outmissionDir: state.packs.paths.outmissionDir,
          donorSceneKey: donor.sceneKey,
          donorPackageHash: donor.scriptPackageHash,
          sceneName: slot.sceneName.trim(),
          donorKind: "workspace-folder",
          donorScriptFolder: donorFolder,
          replaceExisting: values.replaceExisting,
        });
      }

      setIsCreatingScenes(true);
      try {
        const created = await createTriadScenes(
          requests,
          state.snapshot.sceneIdRows.map((row) => row.sceneKey),
          state.snapshot.validationContext.availablePackageHashes,
        );
        await refreshSnapshot(state.packs);
        const briefings: BriefingDraft[] = await Promise.all(
          created.map((scene) => loadTriadBriefing(state.packs.paths.outmissionDir, scene.sceneKey)),
        );
        const latest = draftRef.current;
        if (!latest) return;
        const next = appendClonedStages(
          latest,
          created.map((scene, index) => ({
            index: values.slots[index].index,
            created: scene,
            briefing: briefings[index],
            sceneNo: values.slots[index].sceneNo,
          })),
        );
        setExtendOpen(false);
        editDraft(next);
        setActiveStage(values.slots[0].index);
        toast.success(t("extend.created", { count: created.length }));
      } catch (error) {
        toast.error(t("extend.failed", { message: errorMessage(error) }));
      } finally {
        setIsCreatingScenes(false);
      }
    },
    [state, t, folderPath, workspaceDocument, missionScriptPrefix, refreshSnapshot, editDraft],
  );

  /** Scene keys already spoken for, stable so the wizard does not re-hash. */
  const takenSceneKeys = useMemo(() => (state.status === "ready" ? state.snapshot.sceneIdRows.map((row) => row.sceneKey) : []), [state]);
  const usedSceneNumbers = useMemo(
    () => (state.status === "ready" ? state.snapshot.scenes.map((scene) => scene.sceneNo) : []),
    [state],
  );

  /** Donor stages for a course, resolved through the sceneidtable rows. */
  const donorStagesFor = useCallback(
    (course: CourseRow): WizardDonorStage[] => {
      if (state.status !== "ready") return [];
      const byKey = new Map(state.snapshot.sceneIdRows.map((row) => [row.sceneKey, row]));
      return course.stageSceneKeys
        .filter((key) => key !== 0)
        .map((key) => {
          const row = byKey.get(key);
          return {
            sceneKey: key,
            packageHash: row?.packageHash ?? 0,
            sceneName: row?.sceneName ?? null,
          };
        });
    },
    [state],
  );

  /**
   * Read a stage's mission script so its slots become editable.
   *
   * Attempted once per stage; a stage whose script package is not unpacked, or
   * whose script this build will not rewrite, keeps its reason on screen
   * instead of silently looking like a stage with no units. Reading is not an
   * edit: the dirty flag stays put, and any name the modder typed while this
   * was in flight is merged rather than overwritten.
   */
  const readStageScript = useCallback(
    async (stageIndex: number, options?: { reload?: boolean }) => {
      if (state.status !== "ready") return;
      const opened = draftRef.current;
      if (!opened) return;
      const stage = opened.stages.find((entry) => entry.index === stageIndex);
      if (!stage) return;
      if (stage.script && !options?.reload) return;
      const sceneKey = stage.sceneKey;
      const token = (readTokenRef.current += 1);
      setReadingStage(stageIndex);
      try {
        const script = await loadTriadStageScript(state.packs.paths.scriptDirs, sceneKey, stage.sceneName);
        if (token !== readTokenRef.current) return;
        const latest = draftRef.current;
        if (!latest) return;
        const merged = mergeStageScript(latest, stageIndex, sceneKey, script);
        if (!merged) return;
        draftRef.current = merged;
        setDraft(merged);
        setScriptErrors((current) => {
          if (!(stageIndex in current)) return current;
          const next = { ...current };
          delete next[stageIndex];
          return next;
        });
        scheduleValidation(merged, 0);
      } catch (error) {
        if (token !== readTokenRef.current) return;
        setScriptErrors((current) => ({ ...current, [stageIndex]: errorMessage(error) }));
      } finally {
        if (token === readTokenRef.current) setReadingStage(null);
      }
    },
    [state, scheduleValidation],
  );

  const activeStageNeedsScript = draft?.stages.find((entry) => entry.index === activeStage)?.script === null && scriptErrors[activeStage] === undefined && readingStage === null;

  useEffect(() => {
    if (state.status !== "ready" || openingRowId != null || !activeStageNeedsScript) return;
    void readStageScript(activeStage);
  }, [state.status, openingRowId, activeStageNeedsScript, activeStage, readStageScript]);

  /** Unpack this stage's script package, then read it. */
  const extractStageScript = useCallback(
    async (stageIndex: number) => {
      if (state.status !== "ready") return;
      const stage = draftRef.current?.stages.find((entry) => entry.index === stageIndex);
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
    [state, obDplCachePath, folderPath, workspaceDocument, t, readStageScript],
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

  /**
   * Work out what saving would write, and show it before writing it.
   *
   * A save touches up to five packages at once, so the modder gets the list
   * first rather than a toast afterwards saying a number of files changed.
   */
  const requestSave = useCallback(async () => {
    if (state.status !== "ready" || !draft) return;
    if (checks.blocked) {
      toast.error(t("save.blocked"));
      return;
    }
    setPlanError(null);
    setPlan(null);
    setIsPlanning(true);
    try {
      setPlan(await previewTriadRoute(draft, state.packs.paths));
    } catch (error) {
      setPlanError(errorMessage(error));
    } finally {
      setIsPlanning(false);
    }
  }, [state, draft, checks.blocked, t]);

  const closePlan = useCallback(() => {
    setPlan(null);
    setPlanError(null);
    setIsPlanning(false);
  }, []);

  const save = useCallback(async () => {
    if (state.status !== "ready" || !draft) return;
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
      toast.success(saveSummary(t, applied));
      closePlan();
      const snapshot = await refreshSnapshot(state.packs);
      const saved = draftRef.current;
      if (saved?.course.rowId != null) {
        setDirty(false);
        putRouteSession(sessionsRef.current, {
          draft: saved,
          dirty: false,
          checks,
          scriptErrors,
          activeStage,
        });
        syncSessionFlags(false, saved);
      } else {
        deleteRouteSession(sessionsRef.current, null);
        const match = snapshot.courses.find(
          (row) => row.courseId === saved?.course.courseId && row.variant === saved.course.variant,
        );
        setScriptErrors({});
        if (match) {
          adoptDraft(null);
          await openCourse(match);
        } else {
          adoptDraft(null);
        }
      }
    } catch (error) {
      toast.error(t("save.failed", { message: errorMessage(error) }));
    } finally {
      setIsSaving(false);
    }
  }, [state, draft, onPackMutated, t, adoptDraft, closePlan, refreshSnapshot, openCourse, checks, scriptErrors, activeStage, syncSessionFlags]);

  /**
   * Reorder one category on the course select screen.
   *
   * This writes the course table straight from the reordered list instead of
   * going through a route document, because the numbers of a whole category
   * move together while a route save only owns the one row it has open. Any
   * draft already in memory still carries the old number, so the sessions and
   * the open draft are corrected here — otherwise the next ordinary save
   * would put that course back where it was.
   */
  const applyCategoryOrder = useCallback(
    async (courseIdOrder: number[]) => {
      if (state.status !== "ready" || reorderCategory === null) return;
      setIsReordering(true);
      try {
        const applied = await renumberTriadCategory(
          state.packs.paths,
          reorderCategory,
          courseIdOrder,
        );
        const touched = touchedContentIds(
          state.packs,
          applied.written.map((file) => file.path),
        );
        for (const pack of mutatedTriadPacks(state.packs, touched)) {
          onPackMutated?.(pack);
        }

        const numbers = new Map(applied.courses.map((entry) => [entry.courseId, entry.number]));
        applyCourseNumbers(sessionsRef.current, numbers);
        const open = draftRef.current;
        const openNumber = open ? numbers.get(open.course.courseId) : undefined;
        if (open && openNumber !== undefined && open.course.numberInCategory !== openNumber) {
          adoptDraft(
            { ...open, course: { ...open.course, numberInCategory: openNumber } },
            { dirty: false },
          );
        }

        const moved = applied.courses.filter(
          (entry) => entry.previousNumber !== entry.number,
        ).length;
        toast.success(t("order.done", { count: moved }));
        setReorderCategory(null);
        await refreshSnapshot(state.packs);
      } catch (error) {
        toast.error(t("order.failed", { message: errorMessage(error) }));
      } finally {
        setIsReordering(false);
      }
    },
    [state, reorderCategory, onPackMutated, adoptDraft, refreshSnapshot, t],
  );

  const packs = state.status === "ready" || state.status === "missing" ? state.packs : null;

  /**
   * Work out which mission packages the game is still missing.
   *
   * Saving writes workspace folders; the game reads `.fhm2d`. A route that
   * only reached the folders is invisible in game, and nothing in the editor
   * used to say so — hence a plan computed from the mod folder rather than
   * from what this session happens to have touched.
   */
  const refreshRepackPlan = useCallback(async () => {
    if (state.status !== "ready") return;
    setRepackPlanError(null);
    setIsRepackPlanning(true);
    try {
      const sceneNames = (draft?.stages ?? [])
        .map((entry) => entry.sceneName)
        .filter((name): name is string => Boolean(name));
      setRepackPlan(await planTriadRepack(state.packs.paths, modFolder, sceneNames));
    } catch (error) {
      setRepackPlan(null);
      setRepackPlanError(errorMessage(error));
    } finally {
      setIsRepackPlanning(false);
    }
  }, [state, draft, modFolder]);

  const openRepack = useCallback(() => {
    setIsRepackOpen(true);
    void refreshRepackPlan();
  }, [refreshRepackPlan]);

  const closeRepack = useCallback(() => {
    setIsRepackOpen(false);
    setRepackPlan(null);
    setRepackPlanError(null);
  }, []);

  const handleRepacked = useCallback(
    (entry: TriadRepackEntry) => {
      if (!packs || !onPackRepacked) return;
      const packKey = triadPackKeyForRepackEntry(packs, entry.id);
      if (packKey) onPackRepacked(packKey);
    },
    [packs, onPackRepacked],
  );

  const pathRows = useMemo(
    () =>
      buildWorkspacePathRows({
        workspaceRoot: folderPath,
        dplCacheDir: obDplCachePath ?? "",
        modFolder,
        packs,
      }),
    [folderPath, obDplCachePath, modFolder, packs],
  );

  // Probe every resolved path so the debug list says which ones are really
  // there. A probe that throws leaves its row out of the map, so the row reads
  // as "not probed" instead of claiming the path is missing.
  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      const results = await Promise.all(
        pathRows.map(async (row) => {
          if (!row.path) return null;
          try {
            return [row.id, await exists(row.path)] as const;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      setPathPresence(
        Object.fromEntries(
          results.filter((entry): entry is readonly [string, boolean] => entry !== null),
        ),
      );
    };
    void probe();
    return () => {
      cancelled = true;
    };
  }, [pathRows]);

  const stage = useMemo(() => draft?.stages.find((entry) => entry.index === activeStage) ?? draft?.stages[0] ?? null, [draft, activeStage]);
  const summary = useMemo(() => summariseIssues(checks.issues), [checks.issues]);

  useEffect(() => {
    let cancelled = false;
    const expected = stage ? buildExpectedStageScriptFolder(folderPath, workspaceDocument, stage.sceneName) : null;
    const candidates = [expected, ...buildStageScriptFolderCandidates(state.status === "ready" ? state.packs.paths.scriptDirs : [], stage?.sceneName ?? null)].filter((path): path is string =>
      Boolean(path),
    );

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
    return <MissingPacksNotice packs={packs} dplCacheDir={obDplCachePath ?? ""} isInitialising={isInitialising} onInitialise={() => void initialiseMissingPacks(packs)} onReload={() => void load()} />;
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
              {letter ? <span className="flex size-5 shrink-0 items-center justify-center rounded bg-background font-semibold">{letter}</span> : null}
              <span className="truncate font-medium">{draft.course.name || "—"}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {t("browser.courseId", { id: draft.course.courseId })}
                {draft.course.variant > 0 ? ` · ${t("browser.variant", { number: draft.course.variant })}` : ""}
              </span>
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          {hasChanges ? <span className="px-1.5 text-[11px] font-medium tabular-nums text-amber-600 dark:text-amber-400">{t("common.unsaved")}</span> : null}
          {draft ? (
            <Button type="button" variant="ghost" size="sm" onClick={discard}>
              {t("common.discard")}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={!draft || checks.blocked || isSaving}
            onClick={() => void requestSave()}
            title={checks.blocked ? t("save.blockedBy", { count: summary.error }) : undefined}
          >
            <Save className={cn("mr-1.5 size-4", isSaving && "animate-pulse")} />
            {isSaving ? t("save.saving") : checks.blocked ? t("save.blockedBy", { count: summary.error }) : t("save.action")}
          </Button>
          {/*
            Saving is only half the job: the game reads packages, not folders.
            The button sits next to Save because that is where a modder is
            standing when they assume the route is now in the game.
          */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={openRepack}
            title={t("repack.buttonHint")}
          >
            <PackageCheck className="mr-1.5 size-4" />
            {t("repack.button")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="icon" variant="ghost" className="size-9" aria-label={t("save.more")} title={t("save.more")}>
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
        onRecheck={() => (draft ? scheduleValidation(draft, 0) : undefined)}
        onFocusIssue={focusIssue}
        pathRows={pathRows}
        pathPresence={pathPresence}
      />

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[16.5rem_minmax(0,1fr)]">
        <RouteBrowser
          courses={state.snapshot.courses}
          dormantScenes={state.snapshot.dormantScenes}
          selectedCourseRowId={openingRowId ?? draft?.course.rowId ?? null}
          onSelectCourse={(course) => void openCourse(course)}
          onClaimDormantGroup={(group) => setWizardRequest({ kind: "dormant", group })}
          dirtyRowIds={unsavedRowIds}
          onReorderCategory={setReorderCategory}
          loadingRowId={openingRowId}
          unsavedCourse={
            draft && draft.course.rowId == null
              ? {
                  name: draft.course.name,
                  courseId: draft.course.courseId,
                  category: draft.course.category,
                  stages: draft.stages.length,
                }
              : pendingUnsaved
          }
          onSelectUnsaved={openPendingDraft}
          onCloneCourse={(course) =>
            setWizardRequest({
              kind: "clone",
              source: course,
              donors: donorStagesFor(course),
            })
          }
        />

        {openingRowId != null ? (
          <EditorPaneSkeleton label={t("editor.opening")} />
        ) : draft && stage ? (
          <ScrollArea className="min-h-0 min-w-0">
            <div
              key={courseSessionKey(draft.course.rowId)}
              className="flex flex-col gap-3 pr-2.5 pb-3 duration-200 ease-out animate-in fade-in-0 slide-in-from-bottom-1"
            >
              <CourseEditorPanel course={draft.course} stages={draft.stages} units={state.units} issues={checks.issues} focus={focus} onChange={editCourse} />
              <StageInspector
                stage={stage}
                stages={draft.stages}
                units={state.units}
                pilots={state.snapshot.pilotNames}
                issues={checks.issues}
                focus={focus}
                onSelectStage={setActiveStage}
                onChangeStage={editStage}
                onGenerateLineup={(lineup: SquadLineup) => {
                  const current = draftRef.current;
                  if (!current) return;
                  editDraft(setStageLineup(current, stage.index, lineup));
                }}
                scriptFolder={scriptFolderState.path}
                scriptFolderExists={scriptFolderState.exists}
                onOpenScriptFolder={(path) => void openScriptFolder(path)}
                onRevealScriptFolder={onRevealTreeFolder}
                onOpenScriptInMsc={onOpenMscFolder}
                scriptError={scriptErrors[stage.index] ?? null}
                isReadingScript={readingStage === stage.index}
                onReadScript={() => void readStageScript(stage.index)}
                onExtractScript={() => void extractStageScript(stage.index)}
                canAddStage={canExtendStages(draft.course.category, draft.stages.length)}
                isAddingStage={isCreatingScenes}
                onAddStage={() => setExtendOpen(true)}
              />
            </div>
          </ScrollArea>
        ) : (
          <EmptyEditor hint={t("editor.emptyBody")} />
        )}
      </div>

      <SavePreviewDialog
        plan={plan}
        isPlanning={isPlanning}
        planError={planError}
        isSaving={isSaving}
        onCancel={closePlan}
        onConfirm={() => void save()}
      />

      <CategoryOrderDialog
        category={reorderCategory}
        courses={state.snapshot.courses}
        dirtyRowIds={unsavedRowIds}
        isApplying={isReordering}
        onCancel={() => setReorderCategory(null)}
        onConfirm={(courseIdOrder) => void applyCategoryOrder(courseIdOrder)}
      />

      <TriadRepackDialog
        open={isRepackOpen}
        plan={repackPlan}
        isPlanning={isRepackPlanning}
        planError={repackPlanError}
        modFolder={modFolder}
        onClose={closeRepack}
        onRefresh={() => void refreshRepackPlan()}
        onRepacked={handleRepacked}
      />

      <ExtendStagesDialog
        open={extendOpen}
        draft={draft}
        usedSceneNumbers={usedSceneNumbers}
        existingSceneKeys={takenSceneKeys}
        existingPackageHashes={state.snapshot.validationContext.availablePackageHashes}
        outmissionDir={state.packs.paths.outmissionDir}
        workspaceRoot={folderPath}
        scriptPrefix={missionScriptPrefix}
        isCreating={isCreatingScenes}
        onCancel={() => setExtendOpen(false)}
        onConfirm={(values) => void extendStages(values)}
      />

      <RouteWizardDialog
        request={wizardRequest}
        courses={state.snapshot.courses}
        scenes={state.snapshot.scenes}
        template={state.snapshot.courses[0] ?? null}
        existingSceneKeys={takenSceneKeys}
        existingPackageHashes={state.snapshot.validationContext.availablePackageHashes}
        outmissionDir={state.packs.paths.outmissionDir}
        workspaceRoot={folderPath}
        scriptPrefix={missionScriptPrefix}
        isCreating={isCreatingScenes}
        onCancel={() => setWizardRequest(null)}
        onCreate={(values) => {
          if (!wizardRequest) return;
          if (wizardRequest.kind === "dormant") {
            void createFromDormant(wizardRequest.group, values);
            return;
          }
          void createFromClone(wizardRequest.source, wizardRequest.donors, values);
        }}
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
      <p className="max-w-md text-xs text-muted-foreground" style={{ textWrap: "pretty" }}>
        {hint}
      </p>
    </div>
  );
}
