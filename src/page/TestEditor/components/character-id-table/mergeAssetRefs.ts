import type { AssetRefInfo } from "./assetRef";

/**
 * Keep previous AssetRefInfo object identity when the field hash is unchanged.
 * Prevents path-only parent re-resolves from wiping probed OB/MOD/WS existence
 * (which made every asset field flash "loading" on live DualValueProperty commits).
 */
export function mergeResolvedAssetRefs(
  previous: Record<string, AssetRefInfo>,
  next: Record<string, AssetRefInfo>,
): Record<string, AssetRefInfo> {
  const merged: Record<string, AssetRefInfo> = {};
  let changed = false;

  for (const key of Object.keys(next)) {
    const incoming = next[key]!;
    const prior = previous[key];
    if (
      prior &&
      prior.fieldKey === incoming.fieldKey &&
      prior.rawValue === incoming.rawValue
    ) {
      merged[key] = prior;
      if (prior !== incoming) {
        // Still same logical asset; reuse prior (may hold probe results).
      }
    } else {
      merged[key] = incoming;
      changed = true;
    }
  }

  for (const key of Object.keys(previous)) {
    if (!(key in next)) {
      changed = true;
      break;
    }
  }

  if (!changed && Object.keys(previous).length === Object.keys(next).length) {
    // All keys reused prior objects — return previous map for referential stability.
    let allSame = true;
    for (const key of Object.keys(previous)) {
      if (merged[key] !== previous[key]) {
        allSame = false;
        break;
      }
    }
    if (allSame) return previous;
  }

  return merged;
}
