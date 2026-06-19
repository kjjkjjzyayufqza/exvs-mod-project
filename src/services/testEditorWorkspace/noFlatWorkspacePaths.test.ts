import { describe, expect, it } from "vitest";

const sourceModules = import.meta.glob("/src/page/TestEditor/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const FORBIDDEN_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  {
    name: "root hash join",
    pattern: /join\((folderPath|workspaceRoot|currentDir|projectRootDir),\s*(hash|normalizedHash|"0x)/,
  },
  {
    name: "root template structure JSON join",
    pattern: /join\((folderPath|workspaceRoot|currentDir|projectRootDir),\s*`[^`]*_structure\.json`/,
  },
  {
    name: "old dirty folder API",
    pattern:
      /dirtyFolders|dirtyTopLevelFolderNames|workspaceTopLevelFolderNames|workspaceRootStructureJsonNames|parseRootStructureJsonRepackTarget|isWorkspaceDirectChildFolder|getDirtyFolderNameFromPath|getTopLevelFolderName/,
  },
];

function lineNumberFor(source: string, index: number): number {
  return source.slice(0, index).split(/\r?\n/).length;
}

describe("TestEditor workspace path policy", () => {
  it("keeps runtime consumers off flat workspace hash paths", () => {
    const violations: string[] = [];

    for (const [path, source] of Object.entries(sourceModules)) {
      if (/\.(test|spec)\.[cm]?[tj]sx?$/.test(path)) continue;

      for (const { name, pattern } of FORBIDDEN_PATTERNS) {
        const match = pattern.exec(source);
        if (!match) continue;
        violations.push(`${path}:${lineNumberFor(source, match.index)} ${name}: ${match[0]}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
