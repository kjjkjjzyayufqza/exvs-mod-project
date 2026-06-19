import { describe, expect, it } from "vitest";

const LEGACY_READ_ONLY_MESSAGE =
  "Legacy flat workspace content is read-only. Writes target";

describe("LegacyWorkspaceMoveNotice coverage", () => {
  it("keeps legacy read-only notices centralized in the shared move component", () => {
    const componentSources = import.meta.glob(
      "/src/page/TestEditor/components/**/*.{ts,tsx}",
      {
        query: "?raw",
        import: "default",
        eager: true,
      },
    ) as Record<string, string>;

    const violations = Object.entries(componentSources)
      .filter(
        ([path, source]) =>
          !path.endsWith("/LegacyWorkspaceMoveNotice.tsx") &&
          !path.endsWith("/LegacyWorkspaceMoveNotice.coverage.test.ts") &&
          source.includes(LEGACY_READ_ONLY_MESSAGE),
      )
      .map(([path]) => path);

    expect(violations).toEqual([]);
  });
});
