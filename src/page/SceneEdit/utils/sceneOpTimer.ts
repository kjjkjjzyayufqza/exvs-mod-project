/**
 * Lightweight timing for top-level Scene Editor operations
 * (load stage folder, save changes, repack FHM2D).
 *
 * Each operation logs one start line and one elapsed-ms line under a single
 * `[SceneOp]` tag, so the duration is easy to scan in the dev console and to
 * cross-check against the matching Rust `[tag] Done in {}ms` logs.
 */

const SCENE_OP_TAG = "[SceneOp]";

export interface SceneOpTimer {
  /** Log successful completion and return the elapsed milliseconds. */
  end: (detail?: string) => number;
  /** Log a failure with elapsed milliseconds and return them. */
  fail: (error: unknown) => number;
}

export function beginSceneOp(op: string): SceneOpTimer {
  const startedAt = performance.now();
  console.log(`${SCENE_OP_TAG} ${op} ▶ start`);

  let settled = false;
  const elapsedMs = (): number => Math.round(performance.now() - startedAt);

  return {
    end: (detail?: string): number => {
      const ms = elapsedMs();
      if (!settled) {
        settled = true;
        console.log(`${SCENE_OP_TAG} ${op} ✓ done in ${ms}ms${detail ? ` — ${detail}` : ""}`);
      }
      return ms;
    },
    fail: (error: unknown): number => {
      const ms = elapsedMs();
      if (!settled) {
        settled = true;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${SCENE_OP_TAG} ${op} ✗ failed in ${ms}ms — ${message}`);
      }
      return ms;
    },
  };
}
