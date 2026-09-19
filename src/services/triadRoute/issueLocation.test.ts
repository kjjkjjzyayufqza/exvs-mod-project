import { describe, expect, it } from "vitest";
import {
  courseFieldIssues,
  issueLocationLabel,
  issueTitle,
  parseIssueLocation,
} from "./issueLocation";
import type { ValidationIssue } from "./types";

function issue(partial: Partial<ValidationIssue> & Pick<ValidationIssue, "code">): ValidationIssue {
  return {
    severity: "error",
    message: "fallback",
    location: "course",
    ...partial,
  };
}

describe("parseIssueLocation", () => {
  it("reads a stage briefing as a briefing target", () => {
    expect(parseIssueLocation("stage.2.briefing")).toEqual({ section: "briefing", stage: 2 });
  });
});

describe("courseFieldIssues", () => {
  it("puts a duplicate identity on the course id field", () => {
    const byField = courseFieldIssues([
      issue({
        code: "course-id-duplicate",
        args: { courseId: "1", variant: "0", rowId: "0x08C459FF" },
      }),
    ]);
    expect(byField.courseId?.map((entry) => entry.code)).toEqual(["course-id-duplicate"]);
  });

  it("no longer maps the retired server-unlock note onto a field", () => {
    const byField = courseFieldIssues([issue({ code: "unlock-server-controlled", severity: "info" })]);
    expect(byField.unlockType).toBeUndefined();
  });
});

describe("issueTitle", () => {
  it("interpolates args into the localized title", () => {
    const title = issueTitle(
      (key, options) =>
        key === "issues.course-id-duplicate"
          ? `Course ${options?.courseId} variant ${options?.variant} is row ${options?.rowId}`
          : "",
      issue({
        code: "course-id-duplicate",
        args: { courseId: "1", variant: "0", rowId: "0x08C459FF" },
      }),
    );
    expect(title).toBe("Course 1 variant 0 is row 0x08C459FF");
  });

  it("falls back to the validator message when no translation exists", () => {
    const title = issueTitle(
      () => "",
      issue({ code: "unknown-code", message: "course id 1 is already used by another row" }),
    );
    expect(title).toBe("course id 1 is already used by another row");
  });
});

describe("issueLocationLabel", () => {
  it("names a stage location", () => {
    const label = issueLocationLabel(
      (key, options) => (key === "validation.location.stage" ? `Stage ${options?.index}` : key),
      "stage.2",
    );
    expect(label).toBe("Stage 2");
  });
});
