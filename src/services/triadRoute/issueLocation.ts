/**
 * Turning a validation issue's `location` into a place in the editor.
 *
 * The Rust checks address each finding to a section — `course`, `stage.2`,
 * `stage.2.briefing` — so the panel can do more than print the string: it can
 * put the modder in front of the field the check is about. Anything the parser
 * does not recognise is reported as-is and simply is not offered as a jump
 * target, rather than being guessed at.
 */

import type { IssueSeverity, ValidationIssue } from "./types";

export type IssueSection = "document" | "course" | "stages" | "stage" | "briefing" | "unknown";

export interface IssueTarget {
  section: IssueSection;
  /** 1-based stage index, for the sections that belong to one. */
  stage: number | null;
}

const STAGE_LOCATION = /^stage\.(\d+)(\.briefing)?$/;

/** Read an issue location into the section it addresses. */
export function parseIssueLocation(location: string): IssueTarget {
  if (location === "document" || location === "course" || location === "stages") {
    return { section: location, stage: null };
  }
  const match = STAGE_LOCATION.exec(location);
  if (match) {
    return {
      section: match[2] ? "briefing" : "stage",
      stage: Number(match[1]),
    };
  }
  return { section: "unknown", stage: null };
}

/** Whether the editor has somewhere to scroll to for this location. */
export function isNavigableLocation(location: string): boolean {
  return parseIssueLocation(location).section !== "unknown";
}

/** The worst severity in a list, or `null` when the list is empty. */
export function worstSeverity(issues: ValidationIssue[]): IssueSeverity | null {
  if (issues.some((issue) => issue.severity === "error")) return "error";
  if (issues.some((issue) => issue.severity === "warning")) return "warning";
  if (issues.some((issue) => issue.severity === "info")) return "info";
  return null;
}

/**
 * Issues that belong to one section of the editor.
 *
 * A stage's own findings and its briefing's are counted together for the stage
 * pills, because a modder picking a stage wants to know whether anything in it
 * needs attention, not which half.
 */
export function issuesForSection(
  issues: ValidationIssue[],
  section: Exclude<IssueSection, "unknown">,
  stage?: number,
): ValidationIssue[] {
  return issues.filter((issue) => {
    const target = parseIssueLocation(issue.location);
    if (stage !== undefined && target.stage !== stage) return false;
    if (section === "stage") return target.section === "stage" || target.section === "briefing";
    return target.section === section;
  });
}

/** Issues anywhere in one stage, briefing included. */
export function issuesForStage(issues: ValidationIssue[], stage: number): ValidationIssue[] {
  return issuesForSection(issues, "stage", stage);
}

/**
 * Which course field a check is about.
 *
 * Only the course row is mapped this far: its fields are the ones a modder
 * edits by hand and so the ones worth marking individually. Codes outside this
 * table still reach the panel; they just do not colour a field.
 */
export type CourseField =
  | "name"
  | "courseId"
  | "variant"
  | "category"
  | "numberInCategory"
  | "starRating"
  | "goldScore"
  | "unlockType"
  | "unlockArg0"
  | "displayUnitIds";

const COURSE_FIELD_BY_CODE: Readonly<Record<string, CourseField>> = Object.freeze({
  "course-name-invalid": "name",
  "course-id-invalid": "courseId",
  "course-id-duplicate": "courseId",
  "course-row-id-taken": "courseId",
  "course-category-invalid": "category",
  "course-stars-invalid": "starRating",
  "course-gold-score-invalid": "goldScore",
  "unlock-type-unsupported": "unlockType",
  "unlock-type-experimental": "unlockType",
  "unlock-arg-missing": "unlockArg0",
  "course-display-unit-unknown": "displayUnitIds",
});

export type CourseFieldIssues = Partial<Record<CourseField, ValidationIssue[]>>;

/** Group the course row's findings by the field each one is about. */
export function courseFieldIssues(issues: ValidationIssue[]): CourseFieldIssues {
  const byField: CourseFieldIssues = {};
  for (const issue of issuesForSection(issues, "course")) {
    const field = COURSE_FIELD_BY_CODE[issue.code];
    if (!field) continue;
    (byField[field] ??= []).push(issue);
  }
  return byField;
}

/**
 * Localized title for a finding.
 *
 * The Rust `message` is the English fallback and carries the same ids as
 * `args`. The UI prefers the i18n string so a Chinese editor does not print
 * "course id 1 is already used by another row" under a localized heading.
 */
export function issueTitle(
  translate: (key: string, options?: Record<string, unknown>) => string,
  issue: ValidationIssue,
): string {
  const translated = translate(`issues.${issue.code}`, {
    ...issue.args,
    defaultValue: "",
  });
  return translated || issue.message;
}

/** Human label for an issue location, falling back to the raw path. */
export function issueLocationLabel(
  translate: (key: string, options?: Record<string, unknown>) => string,
  location: string,
): string {
  const target = parseIssueLocation(location);
  if (target.section === "unknown") return location;
  if (target.stage !== null) {
    return translate(`validation.location.${target.section}`, {
      index: target.stage,
      defaultValue: location,
    });
  }
  return translate(`validation.location.${target.section}`, { defaultValue: location });
}
