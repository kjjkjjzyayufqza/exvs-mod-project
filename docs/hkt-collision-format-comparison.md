# HKT Collision Format Comparison

How our current `numshb → hkt` collision encoder compares with our earlier attempts
and with the game's own two native collision formats, plus the concrete problems we
will hit if we keep shipping the current approach.

All numbers below are taken from real round-tripped files, not assumptions:

- Game **simple** sample: `test/211stage211_object_build_b_before/map_hit.xml`
  (decoded from `0xBBC60B47/.../211stage211_object_build_b_before/map_hit.hkt`)
- Game **complex** sample: `object19` in the `base/map_hit.hkt` template
  (values recorded in `docs/agent-sessions/havok-mesh-validation/process.md`)
- Our **current** output: `e:\XB\解包\com\test\map_hit_sssssccccc_full.xml` / `.hkt`
  produced by `cargo run --bin gen_simple_hkt`

---

## 0. TL;DR

- The game accepts our file because its **runtime collision query only needs the
  `meshTree` (sections + primitives + packed/shared vertices)**, which we encode
  correctly.
- `PreviewTool.exe` rejects our multi-section file because we leave the shape-key
  space and the acceleration structures in a state that is **internally
  inconsistent** with the rest of the mesh — something the game tolerates but the
  authoring tool does not.
- Our current method is a **runtime-only shortcut**, not a faithful
  `hknpCompressedMeshShape`. It works in-game today but trades away correctness on
  shape keys, SIMD acceleration, connectivity, and interior-edge flags.

---

## 1. The four approaches side by side

| | **Game — simple** | **Game — complex compressed** | **Our previous attempts** | **Our current (`gen_simple_hkt`)** |
|---|---|---|---|---|
| Shape class | `hknpCompressedMeshShape` | `hknpCompressedMeshShape` | same | same |
| Template shell | authentic game export | authentic game export | hand-built box template / real-base `Last` mode | authentic **simple** game export (`map_hit.xml`), data chain regenerated |
| Sections | 1 | many (31 for this geometry) | many (hand BVH) | 1 (fit mode) **or** 31 (full mode) |
| Geometry kept | full (tiny: 5 quads) | full | full | **127 tris only** (fit) or full 3901 tris (full) |
| `meshTree` source | Havok official builder | Havok official builder | hand-written | hand-written (`split_and_encode_sections`) |
| Shape-key space | primitive-key | primitive-key | mixed / fixed=4 | **section-key (inconsistent)** |
| `simdTree` | populated | populated | stale (copied from template) | **emptied** |
| `connectivity` | present | populated | stale | **emptied** |
| `hasSimdTree` | `true` | `true` | `true` (stale) | `false` |
| `triangleIsInterior` | real flags | real flags | real/stale | **all-zero** |
| `sharedVertices` | 0 | present | present (multi-section) | 0 (fit) / 97 (full) |
| Opens in PreviewTool | ✅ | ✅ | ❌ (≥8 sections hang) | ✅ 1-section / ❌ full |
| Loads in game | ✅ | ✅ | — | ✅ (user-confirmed) |

---

## 2. Field-level numbers (the decisive divergence)

| Field | Game simple | Game complex | Our full output |
|---|---|---|---|
| `numShapeKeyBits` (shape) | 4 | **13** | 5 |
| `numPrimitiveKeys` (meshTree) | 10 | ~10086 | **7802** |
| `bitsPerKey` | 4 | **13** | **5** |
| `maxKeyValue` | 9 | **5043** | **30** |
| primitive count | 5 | ~5043 | 3901 |
| section count | 1 | 31 | 31 |

**Read the right-hand column carefully.** In both game formats the key width
covers every primitive key:

- simple: `bitsPerKey=4` → 16 values ≥ `numPrimitiveKeys=10` ✅
- complex: `bitsPerKey=13` → 8192 values ≥ `maxKeyValue=5043` ✅

In our output it does **not**:

- ours: `bitsPerKey=5` → 32 values, but `numPrimitiveKeys=7802` ❌

We sized the key space to the **section count (31 → 5 bits)** while still
declaring **7802 primitive keys**. The game's broadphase walks the `meshTree`
section/primitive arrays directly and never trusts this width, so it works.
`PreviewTool` enumerates shape keys using `bitsPerKey`, collides with the
declared `numPrimitiveKeys`, and hangs. This is the single highest-confidence
cause of the PreviewTool failure.

---

## 3. What each consumer actually requires

| Consumer | Needs `meshTree` geometry | Needs consistent shape-key space | Needs `simdTree` | Needs `connectivity` | Needs `triangleIsInterior` |
|---|---|---|---|---|---|
| In-game collision query | ✅ | ⚠️ tolerated | ❌ | ❌ | ⚠️ |
| `hctStandAloneFilterManager` (XML↔HKT) | ✅ | ❌ | ❌ | ❌ | ❌ |
| `PreviewTool.exe` | ✅ | ✅ | likely ✅ | ❓ | ❓ |
| Per-triangle material / surface / damage | ✅ | ✅ | ❌ | partial | partial |

Our current file satisfies the first two rows and fails the third — exactly the
behavior observed.

---

## 4. Problems if we keep shipping the current approach

| # | Problem | Why it matters | Severity |
|---|---|---|---|
| 1 | **Shape-key space is inconsistent** (`bitsPerKey` sized to sections, `numPrimitiveKeys` to primitives) | Relies on the game runtime being lenient. Any feature that decodes a hit back to a specific triangle — material, surface type, footstep sound, destructible chunk, damage zone — can resolve the wrong primitive or fail. | **High** |
| 2 | **PreviewTool cannot open multi-section output** | We lose the only visual QA tool for collision. Every change is shipped blind and can only be checked in-game. | **High** |
| 3 | **`simdTree` emptied / `hasSimdTree=false`** | No SIMD broadphase acceleration. Fine for small meshes; large collision meshes get slower narrow-phase queries and diverge from every authentic game asset. | Medium |
| 4 | **`connectivity` emptied** | No edge/adjacency data. Character-controller edge smoothing and continuous collision can snag or jitter on internal section boundaries. | Medium |
| 5 | **`triangleIsInterior` all-zero** | Every triangle is treated as an exposed surface; internal/shared edges are not filtered, which can catch or stop sliding bodies on welded seams. | Medium |
| 6 | **Single-section fit discards ~96% of geometry** (3901 → 127 tris) | Only valid as a diagnostic. Not usable as real collision — most of the model has no collider. | High (if used as final) |
| 7 | **Greedy fallback above 31 sections** | Meshes that need >31 BVH sections fall back to triangle-order chunking: worse spatial locality, larger shared-vertex sets, and a hard ceiling. Very large meshes cannot be encoded faithfully. | Medium |
| 8 | **Non-deterministic simplify** (HashMap region order) | Single-section output changes run-to-run (227 vs 213 verts observed). No reproducible artifact, hard to regression-test. | Low |
| 9 | **Hand-rolled encoder drift** | We re-implement Havok's compressed-mesh semantics by hand. Every field we guess (key width, leaf index, data runs) is a place to silently diverge from the official builder — the root cause of this whole investigation. | Medium |

---

## 5. Two honest ways forward

1. **Accept "game-functional only".** Stop chasing PreviewTool, document that our
   HKT is a runtime-only collider, and at minimum fix the shape-key space to be
   internally consistent (size `bitsPerKey`/`maxKeyValue`/`numShapeKeyBits` to the
   **primitive-key** space like both game formats do). That alone may also fix
   PreviewTool.

2. **Match the game's complex format faithfully.** Build a real `simdTree`,
   populate `connectivity`, emit real `triangleIsInterior`, and use primitive-key
   shape-key widths — i.e. port the remaining pieces of DSMapStudio's
   `hknpCollisionMeshBuilder` that we skipped. Highest fidelity, highest effort.

The cheapest high-value next experiment is option 1's shape-key fix, because it is
the one field that is provably inconsistent with every working game asset.
