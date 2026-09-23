import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpToLine, Loader2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { categoryLetter, type CourseRow } from "@/services/triadRoute/types";

/** One course as the select screen sees it: variants are one entry, not several. */
type OrderedCourse = {
  courseId: number;
  name: string;
  currentNumber: number;
  /** Rows carrying this course id, so an open edit to any of them can block. */
  rowIds: number[];
  variantCount: number;
};

type CategoryOrderDialogProps = {
  /** Category being reordered, or null when the dialog is closed. */
  category: number | null;
  /** Every course row in the workspace; the dialog picks its own category. */
  courses: CourseRow[];
  /** Course rows with unsaved in-memory edits. */
  dirtyRowIds: number[];
  isApplying?: boolean;
  onCancel: () => void;
  onConfirm: (courseIdOrder: number[]) => void;
};

/**
 * Collapse a category's rows into the entries the select screen draws.
 *
 * Variant rows repeat a course id and, in every shipped case, its number, so
 * they belong to one entry. The starting order is the one the game uses:
 * `number_in_category` ascending, with the course id breaking ties between
 * the courses that share a number.
 */
function buildOrder(courses: CourseRow[], category: number | null): OrderedCourse[] {
  if (category === null) return [];
  const byCourseId = new Map<number, OrderedCourse>();
  for (const course of courses) {
    if (course.category !== category) continue;
    const existing = byCourseId.get(course.courseId);
    if (existing) {
      existing.rowIds.push(course.rowId);
      existing.variantCount += 1;
      continue;
    }
    byCourseId.set(course.courseId, {
      courseId: course.courseId,
      name: course.name,
      currentNumber: course.numberInCategory,
      rowIds: [course.rowId],
      variantCount: 1,
    });
  }
  return [...byCourseId.values()].sort(
    (a, b) => a.currentNumber - b.currentNumber || a.courseId - b.courseId,
  );
}

function moved(order: OrderedCourse[], from: number, to: number): OrderedCourse[] {
  if (to < 0 || to >= order.length || from === to) return order;
  const next = [...order];
  const [entry] = next.splice(from, 1);
  next.splice(to, 0, entry);
  return next;
}

/**
 * Reorder one category of the course select screen.
 *
 * The screen groups by category and sorts by `number_in_category`, which is
 * not the number in the course name — the shipped `A-99` sits at 50. So the
 * only way to move a course is to renumber its whole category, which is what
 * confirming here does: the list top to bottom becomes 1..N.
 */
export function CategoryOrderDialog({
  category,
  courses,
  dirtyRowIds,
  isApplying,
  onCancel,
  onConfirm,
}: CategoryOrderDialogProps) {
  const { t } = useTranslation("test-triad-route");
  const baseOrder = useMemo(() => buildOrder(courses, category), [courses, category]);
  const [order, setOrder] = useState<OrderedCourse[]>(baseOrder);

  useEffect(() => {
    setOrder(baseOrder);
  }, [baseOrder]);

  const dirty = useMemo(() => new Set(dirtyRowIds), [dirtyRowIds]);
  const blockedBy = useMemo(
    () => baseOrder.filter((entry) => entry.rowIds.some((rowId) => dirty.has(rowId))),
    [baseOrder, dirty],
  );

  const changed = order.filter((entry, index) => entry.currentNumber !== index + 1).length;
  const letter = category === null ? "" : (categoryLetter(category) ?? String(category));
  const canConfirm = changed > 0 && blockedBy.length === 0 && !isApplying;

  return (
    <Dialog open={category !== null} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="flex max-h-[80vh] flex-col gap-3 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("order.title", { letter })}</DialogTitle>
          <DialogDescription>{t("order.description")}</DialogDescription>
        </DialogHeader>

        {blockedBy.length > 0 ? (
          <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {t("order.blockedByEdits", {
                courses: blockedBy.map((entry) => entry.name).join(", "),
              })}
            </span>
          </p>
        ) : null}

        <ScrollArea className="min-h-0 flex-1 rounded-md border">
          <ol className="flex flex-col gap-1 p-2">
            {order.map((entry, index) => {
              const number = index + 1;
              const moves = entry.currentNumber !== number;
              return (
                <li
                  key={entry.courseId}
                  className={cn(
                    "flex min-w-0 items-center gap-2 rounded-md border px-2 py-1 text-xs",
                    moves ? "border-amber-500/40 bg-amber-500/5" : "bg-card/60",
                  )}
                >
                  <span className="w-10 shrink-0 text-center font-semibold tabular-nums">
                    {number}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{entry.name}</span>
                  {entry.variantCount > 1 ? (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {t("order.variantRows", { count: entry.variantCount })}
                    </Badge>
                  ) : null}
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {moves
                      ? t("order.moved", { from: entry.currentNumber, to: number })
                      : t("order.kept", { number })}
                  </span>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      disabled={index === 0}
                      aria-label={t("order.moveToTop", { name: entry.name })}
                      onClick={() => setOrder((current) => moved(current, index, 0))}
                    >
                      <ArrowUpToLine className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      disabled={index === 0}
                      aria-label={t("order.moveUp", { name: entry.name })}
                      onClick={() => setOrder((current) => moved(current, index, index - 1))}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      disabled={index === order.length - 1}
                      aria-label={t("order.moveDown", { name: entry.name })}
                      onClick={() => setOrder((current) => moved(current, index, index + 1))}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        </ScrollArea>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {changed > 0 ? t("order.changedCount", { count: changed }) : t("order.noChanges")}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={changed === 0 || isApplying}
              onClick={() => setOrder(baseOrder)}
            >
              <RotateCcw className="size-3.5" />
              {t("order.reset")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              {t("order.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canConfirm}
              onClick={() => onConfirm(order.map((entry) => entry.courseId))}
            >
              {isApplying ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {t("order.confirm")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
