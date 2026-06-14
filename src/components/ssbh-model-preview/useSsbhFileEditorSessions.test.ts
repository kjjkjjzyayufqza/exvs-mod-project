import { describe, it, expect } from "vitest";

import { ssbhEditorKindForPath } from "./useSsbhFileEditorSessions";

describe("ssbhEditorKindForPath", () => {
  it("dispatches by extension", () => {
    expect(ssbhEditorKindForPath("a/b.numdlb")).toBe("numdlb");
    expect(ssbhEditorKindForPath("a/b.numatb")).toBe("numatb");
    expect(ssbhEditorKindForPath("a/b.nuhlpb")).toBe("nuhlpb");
    expect(ssbhEditorKindForPath("a/b.jnttbl")).toBe("jnttbl");
  });

  it("is case-insensitive", () => {
    expect(ssbhEditorKindForPath("A\\B.NUMATB")).toBe("numatb");
  });

  it("returns null for unsupported files", () => {
    expect(ssbhEditorKindForPath("a/b.nutexb")).toBeNull();
    expect(ssbhEditorKindForPath("a/b.bin")).toBeNull();
    expect(ssbhEditorKindForPath("")).toBeNull();
  });
});
