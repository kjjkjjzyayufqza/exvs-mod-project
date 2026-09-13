import assert from "node:assert/strict";
import test from "node:test";
import { assertEnglishReleaseNotes } from "./assert-english-release-notes.mjs";

test("accepts English product notes", () => {
  assertEnglishReleaseNotes(
    "Windows x64 release of EXVS Mod Project.\n\n- Fix Mesh Replace for `_m001` materials.\n",
  );
});

test("rejects empty notes", () => {
  assert.throws(() => assertEnglishReleaseNotes("  \n"), /empty/);
});

test("rejects CJK prose", () => {
  assert.throws(
    () => assertEnglishReleaseNotes("Windows x64 release of EXVS Mod Project.\n\n修复战狼模型加载。\n"),
    /English only/,
  );
});
