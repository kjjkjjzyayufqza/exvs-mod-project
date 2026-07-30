/**
 * Minimal line-based text diff for the MSC workspace `.c` preview.
 *
 * No external dependency: common prefix/suffix trimming plus an LCS table on
 * the remaining middle window. Decompiled `.c` edits are localized, so the
 * middle window is normally tiny. To keep worst-case memory bounded, middles
 * larger than `MAX_LCS_CELLS` are reported as one whole-block replacement
 * (every middle line removed + added) instead of a line-paired diff. That
 * bound only coarsens granularity; it never hides a difference.
 */

export type MscDiffLineKind = "context" | "removed" | "added";

export interface MscDiffLine {
  kind: MscDiffLineKind;
  text: string;
  /** 1-based line number in the old text; null for added lines. */
  oldLineNumber: number | null;
  /** 1-based line number in the new text; null for removed lines. */
  newLineNumber: number | null;
}

export interface MscTextDiffResult {
  lines: MscDiffLine[];
  addedCount: number;
  removedCount: number;
  isIdentical: boolean;
}

const MAX_LCS_CELLS = 1_000_000;

function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  const lines = text.split(/\r\n|\r|\n/);
  // A trailing newline produces one empty trailing element; drop it so
  // "a\n" and "a" both diff as the single line "a".
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

interface DiffOp {
  kind: MscDiffLineKind;
  oldIndex: number | null;
  newIndex: number | null;
}

/** Pair up middle lines via a classic LCS table. */
function diffMiddleWithLcs(
  oldLines: readonly string[],
  newLines: readonly string[],
  oldStart: number,
  newStart: number,
  oldCount: number,
  newCount: number,
): DiffOp[] {
  // Row-compressed LCS lengths would save memory but we need the full table
  // for backtracking; the caller guarantees oldCount * newCount is bounded.
  const width = newCount + 1;
  const table = new Uint32Array((oldCount + 1) * width);
  for (let i = oldCount - 1; i >= 0; i -= 1) {
    for (let j = newCount - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        oldLines[oldStart + i] === newLines[newStart + j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < oldCount && j < newCount) {
    if (oldLines[oldStart + i] === newLines[newStart + j]) {
      ops.push({ kind: "context", oldIndex: oldStart + i, newIndex: newStart + j });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      ops.push({ kind: "removed", oldIndex: oldStart + i, newIndex: null });
      i += 1;
    } else {
      ops.push({ kind: "added", oldIndex: null, newIndex: newStart + j });
      j += 1;
    }
  }
  while (i < oldCount) {
    ops.push({ kind: "removed", oldIndex: oldStart + i, newIndex: null });
    i += 1;
  }
  while (j < newCount) {
    ops.push({ kind: "added", oldIndex: null, newIndex: newStart + j });
    j += 1;
  }
  return ops;
}

function diffMiddleAsBlock(
  oldStart: number,
  newStart: number,
  oldCount: number,
  newCount: number,
): DiffOp[] {
  const ops: DiffOp[] = [];
  for (let i = 0; i < oldCount; i += 1) {
    ops.push({ kind: "removed", oldIndex: oldStart + i, newIndex: null });
  }
  for (let j = 0; j < newCount; j += 1) {
    ops.push({ kind: "added", oldIndex: null, newIndex: newStart + j });
  }
  return ops;
}

/** Line-based diff of `oldText` -> `newText`. */
export function diffTextLines(oldText: string, newText: string): MscTextDiffResult {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);

  let prefix = 0;
  const maxPrefix = Math.min(oldLines.length, newLines.length);
  while (prefix < maxPrefix && oldLines[prefix] === newLines[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  const maxSuffix = Math.min(oldLines.length, newLines.length) - prefix;
  while (
    suffix < maxSuffix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const oldMiddleCount = oldLines.length - prefix - suffix;
  const newMiddleCount = newLines.length - prefix - suffix;

  const ops: DiffOp[] = [];
  for (let i = 0; i < prefix; i += 1) {
    ops.push({ kind: "context", oldIndex: i, newIndex: i });
  }
  if (oldMiddleCount > 0 || newMiddleCount > 0) {
    const cells = (oldMiddleCount + 1) * (newMiddleCount + 1);
    ops.push(
      ...(cells <= MAX_LCS_CELLS
        ? diffMiddleWithLcs(oldLines, newLines, prefix, prefix, oldMiddleCount, newMiddleCount)
        : diffMiddleAsBlock(prefix, prefix, oldMiddleCount, newMiddleCount)),
    );
  }
  for (let i = 0; i < suffix; i += 1) {
    ops.push({
      kind: "context",
      oldIndex: oldLines.length - suffix + i,
      newIndex: newLines.length - suffix + i,
    });
  }

  let addedCount = 0;
  let removedCount = 0;
  const lines: MscDiffLine[] = ops.map((op) => {
    if (op.kind === "added") addedCount += 1;
    if (op.kind === "removed") removedCount += 1;
    return {
      kind: op.kind,
      text: op.kind === "added" ? newLines[op.newIndex as number] : oldLines[op.oldIndex as number],
      oldLineNumber: op.oldIndex === null ? null : op.oldIndex + 1,
      newLineNumber: op.newIndex === null ? null : op.newIndex + 1,
    };
  });

  return {
    lines,
    addedCount,
    removedCount,
    isIdentical: addedCount === 0 && removedCount === 0 && oldLines.length === newLines.length,
  };
}
