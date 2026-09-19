import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ScrollText } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { courseFieldIssues, issuesForSection } from "@/services/triadRoute/issueLocation";
import {
  categoryLetter,
  UNLOCK_TYPE,
  type CourseDraft,
  type ValidationIssue,
} from "@/services/triadRoute/types";
import { Field, fieldRing } from "./fields";
import { SectionHeader } from "./SectionHeader";
import { UnitSelect } from "./UnitSelect";
import { FOCUS_FLASH_CLASS, useIssueFocus, type IssueFocusRequest } from "./issueFocus";
import type { UnitNameMap } from "./triadRouteWorkspace";

const EDITABLE_UNLOCK_TYPES: number[] = [
  UNLOCK_TYPE.serverOnly,
  UNLOCK_TYPE.clearCourse,
  UNLOCK_TYPE.clearCount,
];
const CATEGORIES = [1, 2, 3, 4, 5, 6];

type CourseEditorPanelProps = {
  course: CourseDraft;
  units: UnitNameMap;
  issues: ValidationIssue[];
  focus: IssueFocusRequest | null;
  disabled?: boolean;
  onChange: (course: CourseDraft) => void;
};

/**
 * The course row a modder actually cares about.
 *
 * Identity is id + variant, not id alone: the shipped table holds several
 * rows per course id. Unlock type 0 is explained on the field, because
 * listing it as a finding made every vanilla route look broken.
 */
export function CourseEditorPanel({
  course,
  units,
  issues,
  focus,
  disabled,
  onChange,
}: CourseEditorPanelProps) {
  const { t } = useTranslation("test-triad-route");
  const unlockLocked = !EDITABLE_UNLOCK_TYPES.includes(course.unlockType);
  const { ref, isFlashing } = useIssueFocus("course", focus);

  const sectionIssues = useMemo(() => issuesForSection(issues, "course"), [issues]);
  const byField = useMemo(() => courseFieldIssues(issues), [issues]);

  return (
    <section
      ref={ref as React.RefObject<HTMLElement>}
      className={cn(
        "flex scroll-mt-4 flex-col gap-3 rounded-lg border bg-card/40 p-3",
        "transition-shadow duration-300 ease-out",
        isFlashing && FOCUS_FLASH_CLASS,
      )}
    >
      <SectionHeader
        icon={ScrollText}
        title={t("course.title")}
        description={t("course.description")}
        issues={sectionIssues}
      />

      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        <Field label={t("course.name")} issues={byField.name}>
          <Input
            value={course.name}
            disabled={disabled}
            aria-invalid={byField.name !== undefined}
            className={fieldRing(byField.name)}
            onChange={(event) => onChange({ ...course, name: event.target.value })}
          />
        </Field>

        <Field label={t("course.courseId")} issues={byField.courseId}>
          <Input
            type="number"
            min={1}
            value={course.courseId}
            disabled={disabled}
            aria-invalid={byField.courseId !== undefined}
            className={cn("tabular-nums", fieldRing(byField.courseId))}
            onChange={(event) =>
              onChange({ ...course, courseId: Number(event.target.value) || 0 })
            }
          />
        </Field>

        <Field
          label={t("course.variant")}
          issues={byField.variant}
          hint={t("course.variantHint")}
        >
          <Input
            type="number"
            min={0}
            value={course.variant}
            disabled={disabled}
            className="tabular-nums"
            onChange={(event) =>
              onChange({ ...course, variant: Number(event.target.value) || 0 })
            }
          />
        </Field>

        <Field label={t("course.category")} issues={byField.category}>
          <Select
            value={String(course.category)}
            disabled={disabled}
            onValueChange={(value) => onChange({ ...course, category: Number(value) })}
          >
            <SelectTrigger className={cn("w-full min-w-0", fieldRing(byField.category))}>
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
        </Field>

        <Field label={t("course.numberInCategory")} issues={byField.numberInCategory}>
          <Input
            type="number"
            min={1}
            value={course.numberInCategory}
            disabled={disabled}
            className="tabular-nums"
            onChange={(event) =>
              onChange({ ...course, numberInCategory: Number(event.target.value) || 0 })
            }
          />
        </Field>

        <Field label={t("course.stars")} issues={byField.starRating}>
          <Input
            type="number"
            min={1}
            max={5}
            value={course.starRating}
            disabled={disabled}
            aria-invalid={byField.starRating !== undefined}
            className={cn("tabular-nums", fieldRing(byField.starRating))}
            onChange={(event) =>
              onChange({ ...course, starRating: Number(event.target.value) || 0 })
            }
          />
        </Field>

        <Field label={t("course.goldScore")} issues={byField.goldScore}>
          <Input
            type="number"
            min={0}
            step={1000}
            value={course.goldScore}
            disabled={disabled}
            aria-invalid={byField.goldScore !== undefined}
            className={cn("tabular-nums", fieldRing(byField.goldScore))}
            onChange={(event) =>
              onChange({ ...course, goldScore: Number(event.target.value) || 0 })
            }
          />
        </Field>

        <Field
          label={t("course.unlockType")}
          issues={byField.unlockType}
          hint={
            course.unlockType === UNLOCK_TYPE.serverOnly ? t("course.unlockServerHint") : undefined
          }
          className="md:col-span-2"
        >
          <Select
            value={String(course.unlockType)}
            disabled={disabled || unlockLocked}
            onValueChange={(value) => onChange({ ...course, unlockType: Number(value) })}
          >
            <SelectTrigger className={cn("w-full min-w-0", fieldRing(byField.unlockType))}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EDITABLE_UNLOCK_TYPES.map((type) => (
                <SelectItem key={type} value={String(type)}>
                  {t(`course.unlock.${type}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {unlockLocked ? (
            <p
              className="text-[11px] leading-snug text-amber-600 dark:text-amber-400"
              style={{ textWrap: "pretty" }}
            >
              {t("course.unlockLocked", { type: course.unlockType })}
            </p>
          ) : null}
        </Field>

        {course.unlockType === UNLOCK_TYPE.clearCourse ? (
          <Field label={t("course.unlockArg0")} issues={byField.unlockArg0} className="md:col-span-2">
            <Input
              type="number"
              min={1}
              value={course.unlockArg0}
              disabled={disabled}
              aria-invalid={byField.unlockArg0 !== undefined}
              className={cn("tabular-nums", fieldRing(byField.unlockArg0))}
              onChange={(event) =>
                onChange({ ...course, unlockArg0: Number(event.target.value) || 0 })
              }
            />
          </Field>
        ) : null}

        <label
          className={cn(
            "flex min-h-10 cursor-pointer select-none items-center gap-2 rounded-md px-1 text-xs md:col-span-2",
            "transition-[background-color] duration-150 ease-out hover:bg-accent/50",
            disabled && "cursor-default opacity-60",
          )}
        >
          <Checkbox
            checked={course.initiallyOpen}
            disabled={disabled}
            onCheckedChange={(checked) => onChange({ ...course, initiallyOpen: checked === true })}
          />
          {t("course.initiallyOpen")}
        </label>

        <Field label={t("course.displayUnits")} issues={byField.displayUnitIds} className="md:col-span-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {course.displayUnitIds.map((unitId, position) => (
              <UnitSelect
                key={position}
                value={unitId}
                units={units}
                disabled={disabled}
                placeholder={t("course.displayUnits")}
                onChange={(next) => {
                  const displayUnitIds: [number, number, number, number] = [
                    ...course.displayUnitIds,
                  ];
                  displayUnitIds[position] = next;
                  onChange({ ...course, displayUnitIds });
                }}
              />
            ))}
          </div>
        </Field>
      </div>
    </section>
  );
}
