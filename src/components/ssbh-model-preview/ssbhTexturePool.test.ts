import { describe, expect, it, vi } from "vitest";
import type * as THREE from "three";
import { SceneTexturePool } from "./ssbhTextureUpload";

function fakeTexture(): THREE.Texture {
  return { dispose: vi.fn() } as unknown as THREE.Texture;
}

describe("SceneTexturePool.pruneExcept", () => {
  it("disposes and drops entries whose key is not in the active set", () => {
    const pool = new SceneTexturePool();
    const a = fakeTexture();
    const b = fakeTexture();
    const c = fakeTexture();
    pool.acquire("a", () => a);
    pool.acquire("b", () => b);
    pool.acquire("c", () => c);

    const removed = pool.pruneExcept(new Set(["a", "c"]));

    expect(removed).toBe(1);
    expect(pool.size).toBe(2);
    expect(pool.has("a")).toBe(true);
    expect(pool.has("c")).toBe(true);
    expect(pool.has("b")).toBe(false);
    expect(b.dispose).toHaveBeenCalledTimes(1);
    expect(a.dispose).not.toHaveBeenCalled();
  });

  it("keeps every entry when all keys are active", () => {
    const pool = new SceneTexturePool();
    pool.acquire("a", fakeTexture);
    pool.acquire("b", fakeTexture);

    const removed = pool.pruneExcept(new Set(["a", "b"]));

    expect(removed).toBe(0);
    expect(pool.size).toBe(2);
  });

  it("disposes all entries when the active set is empty", () => {
    const pool = new SceneTexturePool();
    const a = fakeTexture();
    pool.acquire("a", () => a);

    const removed = pool.pruneExcept(new Set());

    expect(removed).toBe(1);
    expect(pool.size).toBe(0);
    expect(a.dispose).toHaveBeenCalledTimes(1);
  });
});
