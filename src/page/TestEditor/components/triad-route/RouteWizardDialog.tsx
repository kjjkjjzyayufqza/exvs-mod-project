import { useEffect, useMemo, useState } from "react";
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
import { nextFreeCourseId, nextFreeSceneNumber } from "@/services/triadRoute/routeDraft";
import {
  categoryLetter,
  formatHash,
  type CourseRow,
  type DormantSceneGroup,
  type SceneRow,
} from "@/services/triadRoute/types";

/** Custom routes start above the shipped course ids to avoid the used range. */
const FIRST_CUSTOM_COURSE_ID = 250;
/** Scene numbers above the shipped ranges keep results reported separately. */
const FIRST_CUSTOM_SCENE_NUMBER = 900;

export interface RouteWizardValues {
  courseId: number;
  name: string;
  category: number;
  numberInCategory: number;
  firstSceneNumber: number;
  starRating: number;
  goldScore: number;
  initiallyOpen: boolean;
}

type RouteWizardDialogProps = {
  group: DormantSceneGroup | null;
  courses: CourseRow[];
  scenes: SceneRow[];
  template: CourseRow | null;
  onCancel: () => void;
  onCreate: (values: RouteWizardValues) => void;
};

function categoryFromLetter(letter: string | null): number {
  if (!letter) return 1;
  const index = letter.toUpperCase().charCodeAt(0) - "A".charCodeAt(0) + 1;
  return index >= 1 && index <= 6 ? index : 1;
}

/**
 * Claiming an unused scene group.
 *
 * Every id the wizard proposes is the first free one, because a clash with a
 * shipped row is silent in game: the binary search simply lands on whichever
 * row sorted first.
 */
export function RouteWizardDialog({
  group,
  courses,
  scenes,
  template,
  onCancel,
  onCreate,
}: RouteWizardDialogProps) {
  const { t } = useTranslation("test-triad-route");

  const suggestion = useMemo<RouteWizardValues | null>(() => {
    if (!group || !template) return null;
    const category = categoryFromLetter(group.category);
    const letter = categoryLetter(category) ?? "A";
    return {
      courseId: nextFreeCourseId(
        courses.map((course) => course.courseId),
        FIRST_CUSTOM_COURSE_ID,
      ),
      name: `${letter}-${group.courseNumber ?? 1}`,
      category,
      numberInCategory: group.courseNumber ?? 1,
      firstSceneNumber: nextFreeSceneNumber(
        scenes.map((scene) => scene.sceneNo),
        FIRST_CUSTOM_SCENE_NUMBER,
      ),
      starRating: template.starRating,
      goldScore: template.goldScore,
      initiallyOpen: true,
    };
  }, [group, template, courses, scenes]);

  const [values, setValues] = useState<RouteWizardValues | null>(suggestion);
  useEffect(() => setValues(suggestion), [suggestion]);

  const patch = (next: Partial<RouteWizardValues>) =>
    setValues((current) => (current ? { ...current, ...next } : current));

  const canCreate =
    values !== null && values.courseId > 0 && values.name.trim().length > 0 && /^[\x20-\x7e]+$/.test(values.name);

  return (
    <Dialog open={group !== null} onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("wizard.title")}</DialogTitle>
          <DialogDescription>{t("wizard.description")}</DialogDescription>
        </DialogHeader>

        {group && values ? (
          <div className="flex flex-col gap-4">
            <section className="rounded border bg-muted/40 p-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("wizard.sceneGroup")}
              </p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {group.scenes.map((scene) => (
                  <li key={scene.sceneKey} className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-muted-foreground">
                      {formatHash(scene.sceneKey)}
                    </span>
                    <span className="truncate">{scene.sceneName ?? ""}</span>
                  </li>
                ))}
              </ul>
            </section>

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
                <Label className="text-xs">{t("wizard.numberInCategory")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={values.numberInCategory}
                  onChange={(event) =>
                    patch({ numberInCategory: Number(event.target.value) || 0 })
                  }
                />
              </div>

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
                <p className="text-[11px] text-muted-foreground">{t("wizard.sceneNumberHint")}</p>
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
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("wizard.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!canCreate}
            onClick={() => (values ? onCreate(values) : undefined)}
          >
            {t("wizard.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
