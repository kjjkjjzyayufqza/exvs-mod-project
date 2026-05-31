import { describe, expect, it } from "vitest";
import {
  isJnttblCandidate,
  isNusktbCandidate,
  normalizeAuxiliaryPathKey,
} from "./effectProjectAuxiliaryCache";

describe("normalizeAuxiliaryPathKey", () => {
  it("normalizes separators and case", () => {
    expect(normalizeAuxiliaryPathKey(" E:\\TAURI_PROJECT\\A\\File.JNTTBL ")).toBe(
      "e:/tauri_project/a/file.jnttbl",
    );
  });
});

describe("isJnttblCandidate", () => {
  it("accepts only .jnttbl files", () => {
    expect(isJnttblCandidate("abc.jnttbl")).toBe(true);
    expect(isJnttblCandidate("ABC.JNTTBL")).toBe(true);
    expect(isJnttblCandidate("abc.jnttbl.bak")).toBe(false);
    expect(isJnttblCandidate("jnttbl")).toBe(false);
  });
});

describe("isNusktbCandidate", () => {
  it("accepts only .nusktb files", () => {
    expect(isNusktbCandidate("a.nusktb")).toBe(true);
    expect(isNusktbCandidate("A.NUSKTB")).toBe(true);
    expect(isNusktbCandidate("a.nusktb.old")).toBe(false);
  });
});
