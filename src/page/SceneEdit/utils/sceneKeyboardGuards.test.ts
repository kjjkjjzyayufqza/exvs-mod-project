import { describe, expect, it } from "vitest";
import {
  hasNativeTextSelection,
  isEditableKeyboardTarget,
  shouldHandleSceneCopy,
  shouldHandleScenePaste,
} from "./sceneKeyboardGuards";

describe("isEditableKeyboardTarget", () => {
  it("detects native form controls", () => {
    expect(isEditableKeyboardTarget(document.createElement("input"))).toBe(true);
    expect(isEditableKeyboardTarget(document.createElement("textarea"))).toBe(true);
    expect(isEditableKeyboardTarget(document.createElement("select"))).toBe(true);
  });

  it("detects contenteditable elements", () => {
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    expect(isEditableKeyboardTarget(editable)).toBe(true);
  });

  it("detects descendants of contenteditable containers", () => {
    const container = document.createElement("div");
    container.setAttribute("contenteditable", "true");
    const child = document.createElement("span");
    container.appendChild(child);
    document.body.appendChild(container);
    expect(isEditableKeyboardTarget(child)).toBe(true);
    document.body.removeChild(container);
  });

  it("returns false for regular elements", () => {
    expect(isEditableKeyboardTarget(document.createElement("div"))).toBe(false);
    expect(isEditableKeyboardTarget(null)).toBe(false);
  });
});

describe("shouldHandleSceneCopy", () => {
  it("requires selected objects and non-editable context", () => {
    const div = document.createElement("div");
    expect(shouldHandleSceneCopy(0, div)).toBe(false);
    expect(shouldHandleSceneCopy(2, div)).toBe(true);
    expect(shouldHandleSceneCopy(2, document.createElement("input"))).toBe(false);
  });
});

describe("shouldHandleScenePaste", () => {
  it("requires scene clipboard content and non-editable context", () => {
    const div = document.createElement("div");
    expect(shouldHandleScenePaste(0, div)).toBe(false);
    expect(shouldHandleScenePaste(1, div)).toBe(true);
    expect(shouldHandleScenePaste(1, document.createElement("textarea"))).toBe(false);
  });
});

describe("hasNativeTextSelection", () => {
  it("returns false when selection is collapsed", () => {
    const range = document.createRange();
    const node = document.createTextNode("hello");
    document.body.appendChild(node);
    range.setStart(node, 0);
    range.setEnd(node, 0);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    expect(hasNativeTextSelection()).toBe(false);
    document.body.removeChild(node);
  });
});
