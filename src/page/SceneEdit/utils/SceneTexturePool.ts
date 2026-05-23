import * as THREE from "three";

/**
 * Shared GPU texture pool — multiple TexturedMesh instances referencing the same
 * texture file + slot + sampling parameters share a single THREE.DataTexture,
 * eliminating per-placement VRAM duplication.
 */
export class SceneTexturePool {
  private pool = new Map<string, THREE.Texture>();

  has(key: string): boolean {
    return this.pool.has(key);
  }

  acquire(key: string, factory: () => THREE.Texture): THREE.Texture {
    const existing = this.pool.get(key);
    if (existing) return existing;
    const tex = factory();
    this.pool.set(key, tex);
    return tex;
  }

  disposeAll(): void {
    for (const tex of this.pool.values()) {
      tex.dispose();
    }
    this.pool.clear();
  }

  get size(): number {
    return this.pool.size;
  }

  get estimatedBytes(): number {
    let total = 0;
    for (const tex of this.pool.values()) {
      const img = tex.image as { width?: number; height?: number } | null;
      if (img?.width && img?.height) {
        total += img.width * img.height * 4;
      }
    }
    return total;
  }
}
