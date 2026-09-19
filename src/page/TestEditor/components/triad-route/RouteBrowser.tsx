import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PackageOpen, Search, Sparkles, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  categoryLetter,
  groupDormantScenes,
  type CourseRow,
  type DormantScene,
  type DormantSceneGroup,
} from "@/services/triadRoute/types";

type BrowserTab = "courses" | "dormant";

type RouteBrowserProps = {
  courses: CourseRow[];
  dormantScenes: DormantScene[];
  selectedCourseRowId: number | null;
  onSelectCourse: (course: CourseRow) => void;
  onClaimDormantGroup: (group: DormantSceneGroup) => void;
};

function matches(course: CourseRow, needle: string): boolean {
  if (!needle) return true;
  return (
    course.name.toLowerCase().includes(needle) || String(course.courseId).includes(needle)
  );
}

/**
 * The route list, plus the thing a modder actually wants to find: scene slots
 * that ship complete and are not used by any course. Those are surfaced as
 * their own tab because claiming one is the only way to add a route without
 * minting a package hash the base game never shipped — and because stacking
 * them above three hundred courses pushed every course below the fold.
 */
export function RouteBrowser({
  courses,
  dormantScenes,
  selectedCourseRowId,
  onSelectCourse,
  onClaimDormantGroup,
}: RouteBrowserProps) {
  const { t } = useTranslation("test-triad-route");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<BrowserTab>("courses");

  const needle = query.trim().toLowerCase();

  const categories = useMemo(() => {
    const byCategory = new Map<number, CourseRow[]>();
    for (const course of courses) {
      if (!matches(course, needle)) continue;
      const list = byCategory.get(course.category) ?? [];
      list.push(course);
      byCategory.set(course.category, list);
    }
    return [...byCategory.entries()]
      .sort(([a], [b]) => a - b)
      .map(([category, rows]) => ({
        category,
        rows: rows.sort((a, b) => a.courseId - b.courseId || a.variant - b.variant),
      }));
  }, [courses, needle]);

  const dormantGroups = useMemo(
    () =>
      groupDormantScenes(dormantScenes).filter(
        (group) => !needle || group.label.toLowerCase().includes(needle),
      ),
    [dormantScenes, needle],
  );

  const matchedCourses = categories.reduce((total, entry) => total + entry.rows.length, 0);

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col gap-2 rounded-lg border bg-card/40 p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          placeholder={t("browser.search")}
          onChange={(event) => setQuery(event.target.value)}
          className="h-9 pl-8"
        />
      </div>

      <div
        role="tablist"
        aria-label={t("browser.title")}
        className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-1"
      >
        <TabButton
          isActive={tab === "courses"}
          count={matchedCourses}
          onClick={() => setTab("courses")}
        >
          {t("browser.title")}
        </TabButton>
        <TabButton
          isActive={tab === "dormant"}
          count={dormantGroups.length}
          onClick={() => setTab("dormant")}
        >
          <Sparkles className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          {t("browser.dormantTitle")}
        </TabButton>
      </div>

      <ScrollArea className="min-h-0 flex-1 pr-2.5">
        {tab === "courses" ? (
          <div className="flex flex-col gap-4">
            {categories.map(({ category, rows }) => (
              <section key={category} className="flex flex-col gap-1">
                <h4 className="sticky top-0 z-[1] bg-background/95 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {t("browser.categoryLabel", { letter: categoryLetter(category) ?? category })}
                </h4>
                {rows.map((course) => (
                  <button
                    key={course.rowId}
                    type="button"
                    aria-current={course.rowId === selectedCourseRowId ? "true" : undefined}
                    onClick={() => onSelectCourse(course)}
                    className={cn(
                      "flex min-h-11 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left",
                      "transition-[background-color,border-color,transform] duration-150 ease-out",
                      "hover:bg-accent active:translate-y-px",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      course.rowId === selectedCourseRowId && "border-primary bg-accent",
                    )}
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold tabular-nums">
                      {categoryLetter(course.category) ?? course.category}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-xs font-medium">
                        {course.name}
                        {course.variant > 0 ? (
                          <Badge
                            variant="outline"
                            className="h-4 shrink-0 px-1 text-[10px] tabular-nums"
                          >
                            {t("browser.variant", { number: course.variant })}
                          </Badge>
                        ) : null}
                      </p>
                      <p className="truncate text-[11px] tabular-nums text-muted-foreground">
                        {t("browser.courseId", { id: course.courseId })} ·{" "}
                        {t("browser.stages", {
                          count: course.stageSceneKeys.filter((key) => key !== 0).length,
                        })}
                        {course.initiallyOpen === 1 ? ` · ${t("browser.initiallyOpen")}` : ""}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground">
                      <Star className="size-3" />
                      {course.starRating}
                    </span>
                  </button>
                ))}
              </section>
            ))}
            {categories.length === 0 ? <BrowserEmpty text={t("browser.empty")} /> : null}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p
              className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2 text-[11px] leading-snug text-muted-foreground"
              style={{ textWrap: "pretty" }}
            >
              {t("browser.dormantHint")}
            </p>
            {dormantGroups.map((group) => (
              <div
                key={group.key}
                className="flex items-center justify-between gap-2 rounded-md border bg-card/60 px-2.5 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{group.label}</p>
                  <p className="text-[11px] tabular-nums text-muted-foreground">
                    {t("browser.dormantGroup", { count: group.scenes.length })}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  onClick={() => onClaimDormantGroup(group)}
                >
                  {t("browser.claim")}
                </Button>
              </div>
            ))}
            {dormantGroups.length === 0 ? <BrowserEmpty text={t("browser.dormantEmpty")} /> : null}
          </div>
        )}
      </ScrollArea>
    </aside>
  );
}

function TabButton({
  isActive,
  count,
  onClick,
  children,
}: {
  isActive: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md px-2 text-[11px] font-medium",
        "transition-[background-color,color,box-shadow] duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function BrowserEmpty({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
      <PackageOpen className="mt-px size-4 shrink-0" />
      <span style={{ textWrap: "pretty" }}>{text}</span>
    </p>
  );
}
