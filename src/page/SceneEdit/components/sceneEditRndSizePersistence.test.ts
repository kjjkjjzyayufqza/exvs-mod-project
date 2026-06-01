import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  SCENE_EDIT_RND_SIZE_KEYS,
  readPersistedRndSize,
  resolveSceneEditRndInitialSize,
  writePersistedRndSize,
} from "./sceneEditRndSizePersistence";
import { getDetailViewModalDimensions } from "./sceneEditRndModalUtils";

describe("sceneEditRndSizePersistence", () => {
  beforeEach(() => {
    let store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem(key: string) {
        return store[key] ?? null;
      },
      setItem(key: string, value: string) {
        store[key] = value;
      },
      removeItem(key: string) {
        delete store[key];
      },
      clear() {
        store = {};
      },
    });
    vi.stubGlobal("window", {
      innerWidth: 1600,
      innerHeight: 900,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns default size when no persisted value exists", () => {
    const dims = getDetailViewModalDimensions();
    const size = resolveSceneEditRndInitialSize(
      SCENE_EDIT_RND_SIZE_KEYS.detailView,
      dims,
    );
    expect(size).toEqual({ width: dims.width, height: dims.height });
  });

  it("restores persisted size clamped to current viewport constraints", () => {
    const dims = getDetailViewModalDimensions();
    writePersistedRndSize(SCENE_EDIT_RND_SIZE_KEYS.detailView, {
      width: 9999,
      height: 9999,
    });

    const size = resolveSceneEditRndInitialSize(
      SCENE_EDIT_RND_SIZE_KEYS.detailView,
      dims,
    );
    expect(size.width).toBeLessThanOrEqual(dims.maxWidth);
    expect(size.height).toBeLessThanOrEqual(dims.maxHeight);
    expect(size.width).toBeGreaterThanOrEqual(dims.minWidth);
    expect(size.height).toBeGreaterThanOrEqual(dims.minHeight);
  });

  it("ignores invalid persisted payloads", () => {
    localStorage.setItem(SCENE_EDIT_RND_SIZE_KEYS.detailView, "{bad json");
    expect(readPersistedRndSize(SCENE_EDIT_RND_SIZE_KEYS.detailView)).toBeNull();

    localStorage.setItem(
      SCENE_EDIT_RND_SIZE_KEYS.detailView,
      JSON.stringify({ width: "wide", height: 400 }),
    );
    expect(readPersistedRndSize(SCENE_EDIT_RND_SIZE_KEYS.detailView)).toBeNull();
  });

  it("shrinks persisted size when the window becomes smaller", () => {
    const dims = getDetailViewModalDimensions();
    writePersistedRndSize(SCENE_EDIT_RND_SIZE_KEYS.detailView, {
      width: dims.maxWidth,
      height: dims.maxHeight,
    });

    vi.stubGlobal("window", {
      innerWidth: 900,
      innerHeight: 600,
    });

    const smallerDims = getDetailViewModalDimensions();
    const size = resolveSceneEditRndInitialSize(
      SCENE_EDIT_RND_SIZE_KEYS.detailView,
      smallerDims,
    );
    expect(size.width).toBeLessThanOrEqual(smallerDims.maxWidth);
    expect(size.height).toBeLessThanOrEqual(smallerDims.maxHeight);
  });
});
