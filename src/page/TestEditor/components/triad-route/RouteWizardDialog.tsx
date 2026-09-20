import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { nextFreeCourseId, nextFreeSceneNumber } from "@/services/triadRoute/routeDraft";
import { hashTriadSceneNames } from "@/services/triadRoute/triadRouteService";
import {
  categoryLetter,
  formatHash,
  MAX_STAGES_PER_COURSE,
  type CourseRow,
  type DormantSceneGroup,
  type GeneratedSceneIdentity,
  type SceneRow,
} from "@/services/triadRoute/types";

/** Custom routes start above the shipped course ids to avoid the used range. */
const FIRST_CUSTOM_COURSE_ID = 250;
/** Scene numbers above the shipped ranges keep results reported separately. */
const FIRST_CUSTOM_SCENE_NUMBER = 900;
/** Shipped courses stop at 21 per category, so a custom one starts past them. */
const FIRST_CUSTOM_NUMBER_IN_CATEGORY = 22;
/** How long to wait after a keystroke before hashing the name again. */
const HASH_DEBOUNCE_MS = 250;
/**
 * Shared empty list for the paths that name no scenes.
 *
 * A fresh `[]` per render is a new dependency identity, which is all it takes
 * for an effect that also sets state to loop forever.
 */
const NO_NAMES: string[] = [];

/** One donor stage a new scene is cloned from. */
export interface WizardDonorStage {
  sceneKey: number;
  packageHash: number;
  sceneName: string | null;
}

/**
 * What the wizard was opened for.
 *
 * `dormant` claims scenes that already ship complete, so nothing is created
 * on disk. `clone` mints brand-new scenes from a course that already works,
 * which is the path that has to name folders and hash them.
 */
export type RouteWizardRequest =
  | { kind: "dormant"; group: DormantSceneGroup }
  | { kind: "clone"; source: CourseRow; donors: WizardDonorStage[] };

export interface RouteWizardValues {
  courseId: number;
  name: string;
  category: number;
  numberInCategory: number;
  firstSceneNumber: number;
  starRating: number;
  goldScore: number;
  initiallyOpen: boolean;
  /** Only for `clone`: the resource name each new scene gets. */
  sceneNames: string[];
}

/** Categories the briefing can draw: `NumA`..`NumF` and nothing else. */
const CATEGORIES = [1, 2, 3, 4, 5, 6];
/** Category 6 is F, the single-stage class. */
const CATEGORY_F = 6;

type RouteWizardDialogProps = {
  request: RouteWizardRequest | null;
  courses: CourseRow[];
  scenes: SceneRow[];
  template: CourseRow | null;
  /** Ids a new scene must not hash onto. */
  existingSceneKeys: number[];
  existingPackageHashes: number[];
  isCreating?: boolean;
  onCancel: () => void;
  onCreate: (values: RouteWizardValues) => void;
};

function categoryFromLetter(letter: string | null): number {
  if (!letter) return 1;
  const index = letter.toUpperCase().charCodeAt(0) - "A".charCodeAt(0) + 1;
  return index >= 1 && index <= 6 ? index : 1;
}

/** The shipped naming rule: `000triad_battle_<cat><NNN>_<MMM>`. */
export function officialSceneName(
  category: number,
  numberInCategory: number,
  stageNumber: number,
): string {
  const letter = (categoryLetter(category) ?? "A").toLowerCase();
  const course = String(Math.max(1, numberInCategory)).padStart(3, "0");
  const stage = String(stageNumber).padStart(3, "0");
  return `000triad_battle_${letter}${course}_${stage}`;
}

/**
 * Creating a route, either way round.
 *
 * Every id the wizard proposes is the first free one, because a clash with a
 * shipped row is silent in game: the binary search simply lands on whichever
 * row sorted first. On the clone path the same applies to the two hashes each
 * scene name produces, which is why they are shown next to the name and
 * re-checked on every keystroke rather than at write time.
 */
export function RouteWizardDialog({
  request,
  courses,
  scenes,
  template,
  existingSceneKeys,
  existingPackageHashes,
  isCreating,
  onCancel,
  onCreate,
}: RouteWizardDialogProps) {
  const { t } = useTranslation("test-triad-route");

  const suggestion = useMemo<RouteWizardValues | null>(() => {
    if (!request || !template) return null;
    const courseId = nextFreeCourseId(
      courses.map((course) => course.courseId),
      FIRST_CUSTOM_COURSE_ID,
    );
    const firstSceneNumber = nextFreeSceneNumber(
      scenes.map((scene) => scene.sceneNo),
      FIRST_CUSTOM_SCENE_NUMBER,
    );

    if (request.kind === "dormant") {
      const category = categoryFromLetter(request.group.category);
      const letter = categoryLetter(category) ?? "A";
      return {
        courseId,
        name: `${letter}-${request.group.courseNumber ?? 1}`,
        category,
        numberInCategory: request.group.courseNumber ?? 1,
        firstSceneNumber,
        starRating: template.starRating,
        goldScore: template.goldScore,
        initiallyOpen: true,
        sceneNames: [],
      };
    }

    const category = request.source.category;
    const letter = categoryLetter(category) ?? "A";
    const numberInCategory = nextFreeNumberInCategory(courses, category);
    return {
      courseId,
      name: `${letter}-${numberInCategory}`,
      category,
      numberInCategory,
      firstSceneNumber,
      starRating: request.source.starRating,
      goldScore: request.source.goldScore,
      initiallyOpen: true,
      sceneNames: request.donors.map((_, index) =>
        officialSceneName(category, numberInCategory, index + 1),
      ),
    };
  }, [request, template, courses, scenes]);

  const [values, setValues] = useState<RouteWizardValues | null>(suggestion);
  const [identities, setIdentities] = useState<GeneratedSceneIdentity[]>([]);
  const [hashError, setHashError] = useState<string | null>(null);
  const [isHashing, setIsHashing] = useState(false);
  /** Names the modder edited by hand stop following the category / number. */
  const [namesPinned, setNamesPinned] = useState(false);

  useEffect(() => {
    setValues(suggestion);
    setIdentities((current) => (current.length === 0 ? current : []));
    setHashError(null);
    setNamesPinned(false);
  }, [suggestion]);

  const patch = useCallback(
    (next: Partial<RouteWizardValues>) =>
      setValues((current) => (current ? { ...current, ...next } : current)),
    [],
  );

  /** Keep the generated names in step until the modder takes them over. */
  const retarget = (next: Partial<RouteWizardValues> & { stageCount?: number }) => {
    setValues((current) => {
      if (!current) return current;
      const { stageCount, ...patched } = next;
      const merged = { ...current, ...patched };
      if (merged.sceneNames.length === 0 && stageCount === undefined) return merged;
      const count = stageCount ?? merged.sceneNames.length;
      // A pinned list keeps the names the modder typed, but still grows or
      // shrinks with the stage count — a stage with no folder name cannot be
      // created at all.
      return {
        ...merged,
        sceneNames: Array.from({ length: count }, (_, index) => {
          const generated = officialSceneName(
            merged.category,
            merged.numberInCategory,
            index + 1,
          );
          if (!namesPinned) return generated;
          return merged.sceneNames[index] ?? generated;
        }),
      };
    });
  };

  const sceneNames = values?.sceneNames ?? NO_NAMES;
  const namesKey = sceneNames.join("\u0000");
  const hashToken = useRef(0);
  /**
   * The taken-id lists, read when the call is actually made.
   *
   * The parent derives them per render, so depending on them here would
   * re-hash on every unrelated parent render. They only change when the
   * workspace is reloaded, which closes the dialog anyway.
   */
  const takenIds = useRef({ scenes: existingSceneKeys, packages: existingPackageHashes });
  takenIds.current = { scenes: existingSceneKeys, packages: existingPackageHashes };

  useEffect(() => {
    if (namesKey.length === 0) {
      // Setting a fresh `[]` here is what made this loop: it is a new
      // identity every pass, so the render it triggers runs the effect again.
      setIdentities((current) => (current.length === 0 ? current : []));
      setHashError(null);
      return;
    }
    const names = namesKey.split("\u0000");
    const token = (hashToken.current += 1);
    setIsHashing(true);
    const timer = setTimeout(() => {
      void hashTriadSceneNames(names, takenIds.current.scenes, takenIds.current.packages)
        .then((result) => {
          if (token !== hashToken.current) return;
          setIdentities(result);
          setHashError(null);
        })
        .catch((error: unknown) => {
          if (token !== hashToken.current) return;
          setIdentities([]);
          setHashError(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          if (token === hashToken.current) setIsHashing(false);
        });
    }, HASH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // The joined names are the whole trigger: a re-render that produces the
    // same list must not be another round trip.
  }, [namesKey]);

  const duplicateNames = useMemo(() => {
    const seen = new Set<string>();
    const repeated = new Set<string>();
    for (const name of sceneNames) {
      const trimmed = name.trim().toLowerCase();
      if (!trimmed) continue;
      if (seen.has(trimmed)) repeated.add(trimmed);
      seen.add(trimmed);
    }
    return repeated;
  }, [sceneNames]);

  const namesUsable =
    sceneNames.length === 0 ||
    (hashError === null &&
      duplicateNames.size === 0 &&
      identities.length === sceneNames.length &&
      identities.every(
        (identity) =>
          identity.sceneKeyCollision === null && identity.packageHashCollision === null,
      ) &&
      sceneNames.every((name) => /^[A-Za-z0-9_-]{1,64}$/.test(name.trim())));

  const canCreate =
    values !== null &&
    !isCreating &&
    !isHashing &&
    values.courseId > 0 &&
    values.name.trim().length > 0 &&
    /^[\x20-\x7e]+$/.test(values.name) &&
    namesUsable;

  const isClone = request?.kind === "clone";
  /**
   * Shapes the checker will complain about, said before the folders exist.
   *
   * F-class courses play one stage and the validator blocks anything else, so
   * finding that out after three folders have been written is three folders
   * too late.
   */
  const shapeWarning = (() => {
    if (!isClone || !values) return null;
    const count = values.sceneNames.length;
    if (values.category === CATEGORY_F && count !== 1) {
      return t("wizard.shapeFClass", { count });
    }
    if (values.category !== CATEGORY_F && count !== MAX_STAGES_PER_COURSE) {
      return t("wizard.shapeNonF", { count, expected: MAX_STAGES_PER_COURSE });
    }
    return null;
  })();

  return (
    <Dialog open={request !== null} onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <DialogContent className="max-h-[88vh] max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isClone ? t("wizard.cloneTitle") : t("wizard.title")}</DialogTitle>
          <DialogDescription>
            {isClone ? t("wizard.cloneDescription") : t("wizard.description")}
          </DialogDescription>
        </DialogHeader>

        {request && values ? (
          <ScrollArea className="max-h-[60vh]">
            <div className="flex flex-col gap-4 pr-3">
              {request.kind === "dormant" ? (
                <DonorList
                  heading={t("wizard.sceneGroup")}
                  rows={request.group.scenes.map((scene) => ({
                    key: scene.sceneKey,
                    name: scene.sceneName,
                  }))}
                />
              ) : (
                <DonorList
                  heading={t("wizard.cloneSource", { name: request.source.name })}
                  rows={request.donors.map((donor) => ({
                    key: donor.sceneKey,
                    name: donor.sceneName,
                  }))}
                />
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">{t("wizard.name")}</Label>
                  <Input
                    value={values.name}
                    onChange={(event) => patch({ name: event.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground">{t("wizard.nameHint")}</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">{t("wizard.courseId")}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={values.courseId}
                    onChange={(event) => patch({ courseId: Number(event.target.value) || 0 })}
                  />
                  <p className="text-[11px] text-muted-foreground">{t("wizard.courseIdHint")}</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">{t("wizard.category")}</Label>
                  <Select
                    value={String(values.category)}
                    onValueChange={(next) => retarget({ category: Number(next) })}
                  >
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((category) => (
                        <SelectItem key={category} value={String(category)}>
                          {categoryLetter(category)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    {t("wizard.categoryHint")}
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">{t("wizard.numberInCategory")}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={values.numberInCategory}
                    onChange={(event) =>
                      retarget({ numberInCategory: Number(event.target.value) || 0 })
                    }
                  />
                </div>

                {isClone ? (
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">{t("wizard.stageCount")}</Label>
                    <Select
                      value={String(values.sceneNames.length)}
                      onValueChange={(next) => retarget({ stageCount: Number(next) })}
                    >
                      <SelectTrigger className="w-full min-w-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: MAX_STAGES_PER_COURSE }, (_, index) => (
                          <SelectItem key={index} value={String(index + 1)}>
                            {t("browser.stages", { count: index + 1 })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      {t("wizard.stageCountHint")}
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">{t("wizard.firstSceneNumber")}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={values.firstSceneNumber}
                    onChange={(event) =>
                      patch({ firstSceneNumber: Number(event.target.value) || 0 })
                    }
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t("wizard.sceneNumberHint")}
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">{t("wizard.starRating")}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    value={values.starRating}
                    onChange={(event) => patch({ starRating: Number(event.target.value) || 1 })}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">{t("wizard.goldScore")}</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1000}
                    value={values.goldScore}
                    onChange={(event) => patch({ goldScore: Number(event.target.value) || 0 })}
                  />
                </div>

                <label className="flex items-center gap-2 text-xs md:col-span-2">
                  <Checkbox
                    checked={values.initiallyOpen}
                    onCheckedChange={(checked) => patch({ initiallyOpen: checked === true })}
                  />
                  {t("wizard.initiallyOpen")}
                </label>
              </div>

              {shapeWarning ? (
                <p
                  className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] text-amber-700 dark:text-amber-400"
                  style={{ textWrap: "pretty" }}
                >
                  <AlertTriangle className="mt-px size-3.5 shrink-0" />
                  {shapeWarning}
                </p>
              ) : null}

              {sceneNames.length > 0 ? (
                <SceneNameTable
                  names={sceneNames}
                  identities={identities}
                  duplicates={duplicateNames}
                  isHashing={isHashing}
                  error={hashError}
                  onChange={(index, next) => {
                    setNamesPinned(true);
                    setValues((current) =>
                      current
                        ? {
                            ...current,
                            sceneNames: current.sceneNames.map((name, at) =>
                              at === index ? next : name,
                            ),
                          }
                        : current,
                    );
                  }}
                />
              ) : null}
            </div>
          </ScrollArea>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={isCreating} onClick={onCancel}>
            {t("wizard.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!canCreate}
            onClick={() => (values ? onCreate(values) : undefined)}
          >
            {isCreating ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            {isCreating ? t("wizard.creating") : t("wizard.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** First number in a category no shipped course already uses. */
function nextFreeNumberInCategory(courses: CourseRow[], category: number): number {
  const used = new Set(
    courses.filter((course) => course.category === category).map((c) => c.numberInCategory),
  );
  let candidate = FIRST_CUSTOM_NUMBER_IN_CATEGORY;
  while (used.has(candidate)) candidate += 1;
  return candidate;
}

function DonorList({
  heading,
  rows,
}: {
  heading: string;
  rows: { key: number; name: string | null }[];
}) {
  return (
    <section className="rounded border bg-muted/40 p-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {heading}
      </p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2 text-xs">
            <span className="font-mono text-muted-foreground">{formatHash(row.key)}</span>
            <span className="truncate">{row.name ?? ""}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The name each new folder gets, and what it hashes to.
 *
 * The name is the only input: both ids are derived from it, so showing them
 * here is the difference between "I typed a name" and "I know which package
 * and scene key the game will look for".
 */
function SceneNameTable({
  names,
  identities,
  duplicates,
  isHashing,
  error,
  onChange,
}: {
  names: string[];
  identities: GeneratedSceneIdentity[];
  duplicates: Set<string>;
  isHashing: boolean;
  error: string | null;
  onChange: (index: number, next: string) => void;
}) {
  const { t } = useTranslation("test-triad-route");

  return (
    <section className="flex flex-col gap-2 rounded border bg-card/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">{t("wizard.sceneNames")}</p>
        {isHashing ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
      </div>
      <p className="text-[11px] text-muted-foreground" style={{ textWrap: "pretty" }}>
        {t("wizard.sceneNamesHint", { max: MAX_STAGES_PER_COURSE })}
      </p>

      {names.map((name, index) => {
        const identity = identities[index];
        const duplicate = duplicates.has(name.trim().toLowerCase());
        const malformed = !/^[A-Za-z0-9_-]{1,64}$/.test(name.trim());
        const clash =
          identity?.sceneKeyCollision ?? identity?.packageHashCollision ?? null;
        const bad = duplicate || malformed || clash !== null;

        return (
          <div key={index} className="flex flex-col gap-1">
            <Label className="text-[11px] text-muted-foreground">
              {t("stages.stage", { index: index + 1 })}
            </Label>
            <Input
              value={name}
              aria-invalid={bad}
              className={cn("h-8 font-mono text-xs", bad && "border-destructive")}
              onChange={(event) => onChange(index, event.target.value)}
            />
            {identity && !bad ? (
              <p className="flex flex-wrap items-center gap-x-3 text-[10px] tabular-nums text-muted-foreground">
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <Check className="size-3" />
                  {t("wizard.hashesFree")}
                </span>
                <span className="font-mono">
                  {t("stages.sceneKey")} {formatHash(identity.sceneKey)}
                </span>
                <span className="font-mono">
                  {t("stages.scriptPackage")} {formatHash(identity.packageHash)}
                </span>
              </p>
            ) : (
              <p className="flex items-start gap-1 text-[10px] text-destructive">
                <AlertTriangle className="mt-px size-3 shrink-0" />
                {malformed
                  ? t("wizard.sceneNameInvalid")
                  : duplicate
                    ? t("wizard.sceneNameDuplicate")
                    : (clash ?? t("wizard.sceneNamePending"))}
              </p>
            )}
          </div>
        );
      })}

      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </section>
  );
}
