import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function collectSourceFiles(directory: string, output: string[]): void {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(fullPath, output);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
    output.push(fullPath);
  }
}

describe("template NUL escapes", () => {
  it("does not place \\0 before ${ so Rolldown cannot fold it into an octal template escape", () => {
    const files: string[] = [];
    collectSourceFiles("src", files);
    const banned = /\\0\$\{/;
    const hits: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      if (banned.test(text)) {
        hits.push(file.replaceAll("\\", "/"));
      }
    }
    expect(hits).toEqual([]);
  });
});
