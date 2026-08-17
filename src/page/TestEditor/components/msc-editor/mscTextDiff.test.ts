import { describe, expect, it } from "vitest";

import { diffTextLines } from "@/page/TestEditor/components/msc-editor/mscTextDiff";

describe("diffTextLines", () => {
  it("reports identical texts with context lines only", () => {
    const text = "int main()\n{\n    return 0;\n}\n";
    const result = diffTextLines(text, text);
    expect(result.isIdentical).toBe(true);
    expect(result.addedCount).toBe(0);
    expect(result.removedCount).toBe(0);
    expect(result.lines.map((line) => line.kind)).toEqual([
      "context",
      "context",
      "context",
      "context",
    ]);
  });

  it("treats a single trailing newline as insignificant", () => {
    const result = diffTextLines("func_1();\n", "func_1();");
    expect(result.isIdentical).toBe(true);
  });

  it("detects an added line with correct line numbers", () => {
    const result = diffTextLines("a\nc\n", "a\nb\nc\n");
    expect(result.addedCount).toBe(1);
    expect(result.removedCount).toBe(0);
    const added = result.lines.find((line) => line.kind === "added");
    expect(added).toMatchObject({ text: "b", oldLineNumber: null, newLineNumber: 2 });
  });

  it("detects a removed line with correct line numbers", () => {
    const result = diffTextLines("a\nb\nc\n", "a\nc\n");
    expect(result.removedCount).toBe(1);
    const removed = result.lines.find((line) => line.kind === "removed");
    expect(removed).toMatchObject({ text: "b", oldLineNumber: 2, newLineNumber: null });
  });

  it("represents a changed line as removed plus added", () => {
    const result = diffTextLines(
      "func_241(0xf48d2d49, func_390);\n",
      "func_241(0xf48d2d49, ACTION_A_SHOT);\n",
    );
    expect(result.isIdentical).toBe(false);
    expect(result.lines.map((line) => line.kind)).toEqual(["removed", "added"]);
    expect(result.lines[0].text).toContain("func_390");
    expect(result.lines[1].text).toContain("ACTION_A_SHOT");
  });

  it("diffs from and to empty text", () => {
    const added = diffTextLines("", "a\nb\n");
    expect(added.addedCount).toBe(2);
    expect(added.removedCount).toBe(0);

    const removed = diffTextLines("a\nb\n", "");
    expect(removed.addedCount).toBe(0);
    expect(removed.removedCount).toBe(2);
  });

  it("keeps unchanged prefix and suffix as context around a local edit", () => {
    const oldText = ["// header", "int a;", "int b;", "int c;", "// footer"].join("\n");
    const newText = ["// header", "int a;", "int B2;", "int c;", "// footer"].join("\n");
    const result = diffTextLines(oldText, newText);
    expect(result.lines.map((line) => line.kind)).toEqual([
      "context",
      "context",
      "removed",
      "added",
      "context",
      "context",
    ]);
  });

  it("falls back to one whole-block replacement when the middle exceeds the LCS budget", () => {
    // 1100 x 1100 distinct middle lines exceed the 1M-cell LCS budget.
    const oldLines = Array.from({ length: 1100 }, (_, i) => `old_${i}`);
    const newLines = Array.from({ length: 1100 }, (_, i) => `new_${i}`);
    const result = diffTextLines(oldLines.join("\n"), newLines.join("\n"));
    expect(result.removedCount).toBe(1100);
    expect(result.addedCount).toBe(1100);
    expect(result.isIdentical).toBe(false);
    // No interleaving: all removals first, then all additions.
    const kinds = result.lines.map((line) => line.kind);
    expect(kinds.slice(0, 1100).every((kind) => kind === "removed")).toBe(true);
    expect(kinds.slice(1100).every((kind) => kind === "added")).toBe(true);
  });
});
