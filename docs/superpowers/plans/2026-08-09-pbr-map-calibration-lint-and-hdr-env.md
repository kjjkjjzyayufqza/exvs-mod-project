# PBR Map Calibration Lint + HDR Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task states its RED step (write the failing test, run it, confirm the expected failure) before its GREEN step. Do not write implementation code before the corresponding test fails for the stated reason.

**Goal:** Catch miscalibrated custom PBR maps in the editor instead of in game.

A custom weapon shipped with roughness `0.120` (57.2% of texels a perfect mirror), metallic `0.631`, every non-color map tagged sRGB, and no `Texture1` binding. In game it rendered as a white mirror. In the three.js preview it looked completely normal. Full case write-up and every measured number: `docs/exvs2-custom-model-pbr-map-calibration.md`.

---

## Background: why the preview could not catch it

These are verified in code, not inferred. They define what this plan has to fix.

| # | Cause | Location | Consequence |
|---|---|---|---|
| 1 | Texture color space is chosen by **slot role**, never read from the nutexb footer | `ssbhTextureUpload.ts:45`, `:235` | The preview always treats roughness/metallic/normal/AO as linear — which is *correct*. It silently does the right thing, so it can never show the wrong thing. sRGB mistagging is structurally undetectable here. |
| 2 | The EXVS binding path never reads `Texture1` | `meshFromSsbh.ts:627-637` (EXVS) vs `:855` (generic Smash fallback) | Binding or not binding `Texture1` produces an identical image. |
| 3 | Every nutexb — including the `BC6Ufloat` HDR specular cube map — is decoded to 8-bit RGBA | `nutexb_lib.rs` (`to_rgba8`, `ExtendedColorType::Rgba8`); compressed path hard-disabled at `useSceneTextureLoader.ts:211` | Reflected energy above 1.0 is clamped away. Measured: **3.90%** of that cube map's texels clip at 255 when forced to 8-bit. Metal reflects the environment, so a clamped probe turns a white blowout into plausible grey chrome. |
| 4 | The cube map is bound as a 2D `EquirectangularReflectionMapping` texture, not a cube | `ssbhTextureUpload.ts:205-207` | Six faces are sampled as one 512×3072 equirectangular strip. Highlights get smeared instead of concentrated — a second, independent dimming. |
| 5 | `envMapIntensity` / `aoMapIntensity` are hardcoded and duplicated across two viewports | `SsbhModelCanvas.tsx:743-750`, `:783`; `MapViewport.tsx:1552-1587`, `:1926-1969` | Values were tuned to compensate for the clamped probe, and can drift between viewports. |

**The method that did find the bug** compared the texture value distributions against the shipped game art for the same unit. That is a file-level check requiring no renderer fidelity whatsoever, which is why Phase 1 leads.

---

## Design overview

```
   .nutexb ──► [Rust] nutexb_map_stats ──► NutexbMapStats { storedFormat, layerCount, channels[4] }
                       │                              │
                       │                              ├──► [TS] lintPbrMaps(binding, stats)  ──► PbrMapFinding[]   (Phase 1)
                       │                              │
                       │                              └──► [TS] diffAgainstReference(a, b)   ──► SlotDelta[]       (Phase 2)
                       │
   .numatb ──► ResolvedMaterialBinding (slot → texture path)


   .nutexb (BC6Ufloat, 6 layers) ──► [Rust] nutexb_compressed_bytes (layer-aware)
                                          └──► [TS] CompressedCubeTexture ──► envMap                              (Phase 3)
```

**Phase 1 (detection)** — deterministic, no renderer involvement, catches all four defects. Ships value alone.
**Phase 2 (comparison)** — reuses Phase 1 statistics for the subject-vs-reference diff. Ships value alone.
**Phase 3 (render fidelity)** — the only phase that makes the *rendered image* trustworthy for metallic surfaces, and the only one with genuine uncertainty. Must not block 1 and 2.

**Tech Stack:** Rust (`nutexb`, `image_dds`), Tauri commands, React 19, TypeScript, three.js / @react-three/fiber, Vitest + Testing Library, `cargo test`.

**Non-goals:** reproducing `vsngCharaBasic` exactly; auto-correcting textures inside the editor (calibration stays an offline script); changing how `.numatb` files are written.

---

# Phase 1 — File-level map lint

## Task 1: Rust map statistics module

**Files:**
- Create: `src-tauri/src/format/nutexb_map_stats.rs`
- Modify: `src-tauri/src/format/mod.rs` (add `pub mod nutexb_map_stats;`)
- Modify: `src-tauri/src/commands.rs` (add the `#[tauri::command]` wrapper)
- Modify: `src-tauri/src/lib.rs` (register in `invoke_handler`, next to `commands::nutexb_rgba_bytes` at line 71)
- Create: `src-tauri/tests/nutexb_map_stats_test.rs`

### Types

```rust
/// Per-channel distribution of an 8-bit decoded texture.
/// Percentiles come from a 256-bin histogram, which is exact for 8-bit data.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelStats {
    pub mean: f32,
    pub std_dev: f32,
    pub p01: f32,
    pub p25: f32,
    pub p50: f32,
    pub p75: f32,
    pub p99: f32,
    /// Fraction of texels below 0.1. For a roughness map this is the mirror fraction.
    pub below_010_fraction: f32,
    /// Fraction of texels above 0.9. For a float source this also signals LDR clipping.
    pub above_090_fraction: f32,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NutexbMapStats {
    pub path: String,
    /// Verbatim `NutexbFormat` variant name from the footer, e.g. "BC7Srgb".
    /// Never inferred from the file name or from the slot it is bound to.
    pub stored_format: String,
    pub width: u32,
    pub height: u32,
    /// `footer.layer_count` — 6 for cube maps, 1 otherwise.
    pub layer_count: u32,
    pub mipmap_count: u32,
    /// True when a float source format (BC6H) was measured through the 8-bit decode path,
    /// so every statistic below is clamped to [0,1] and understates the real range.
    pub ldr_clamped: bool,
    /// R, G, B, A.
    pub channels: [ChannelStats; 4],
}
```

`ldr_clamped` matters: `barispecular00_cubemap` is `BC6Ufloat`, and its statistics are only meaningful as a *lower bound* until Phase 3 lands. The UI must not present a clamped measurement as the truth.

### RED

- [ ] Create `src-tauri/tests/nutexb_map_stats_test.rs` with the real-data fixture guard pattern used by `src-tauri/tests/effect_model_preview_real_data_test.rs`:

```rust
use std::path::Path;

use app_lib::format::nutexb_map_stats::nutexb_map_stats_from_path;

const TEX_DIR: &str = r"E:\XB\mod\002chara\wing_gundam_zero_rebellion_model\textures";
/// Pre-fix backup of the broken custom maps. Created 2026-08-09 alongside the fix.
const BROKEN_TEX_DIR: &str =
    r"E:\XB\mod\002chara\wing_gundam_zero_rebellion_model.bak-20260809\textures";

/// BC7 is lossy, so measured values drift by a few thousandths between encodes.
const TOL: f32 = 0.01;

fn skip_unless_file_present(path: &str) -> bool {
    if Path::new(path).is_file() {
        return false;
    }
    eprintln!("SKIP: real texture fixture is unavailable: {path}");
    true
}

/// The footer format must be reported verbatim. The whole sRGB-mistagging rule depends on
/// this being the file's own tag and not something derived from the slot or file name.
#[test]
fn reports_the_stored_format_verbatim() {
    let path = format!("{TEX_DIR}\\016gundmw_001wgzero_001_pbr1_roughness.nutexb");
    if skip_unless_file_present(&path) {
        return;
    }
    let stats = nutexb_map_stats_from_path(&path).expect("read shipped roughness map");
    assert_eq!(stats.stored_format, "BC4Unorm");
    assert_eq!((stats.width, stats.height), (1024, 1024));
    assert_eq!(stats.layer_count, 1);
    assert!(!stats.ldr_clamped);
}

/// Ground truth for every roughness threshold in the lint.
#[test]
fn measures_shipped_roughness_distribution() {
    let path = format!("{TEX_DIR}\\016gundmw_001wgzero_001_pbr1_roughness.nutexb");
    if skip_unless_file_present(&path) {
        return;
    }
    let r = &nutexb_map_stats_from_path(&path).unwrap().channels[0];
    assert!((r.mean - 0.525).abs() < TOL, "mean was {}", r.mean);
    assert!((r.p25 - 0.357).abs() < TOL, "p25 was {}", r.p25);
    assert!((r.p50 - 0.482).abs() < TOL, "p50 was {}", r.p50);
    assert!((r.p75 - 0.694).abs() < TOL, "p75 was {}", r.p75);
    // Shipped art puts essentially nothing in the mirror band.
    assert!(r.below_010_fraction < 0.01, "mirror was {}", r.below_010_fraction);
}

/// The defect this whole plan exists to catch: 57.2% of the surface is a mirror.
#[test]
fn measures_broken_custom_roughness_as_mostly_mirror() {
    let path = format!("{BROKEN_TEX_DIR}\\wep_2004_roughnessmap.nutexb");
    if skip_unless_file_present(&path) {
        return;
    }
    let stats = nutexb_map_stats_from_path(&path).unwrap();
    // The map is a data map yet was stored in an sRGB view.
    assert_eq!(stats.stored_format, "BC7Srgb");
    let r = &stats.channels[0];
    assert!((r.mean - 0.120).abs() < TOL, "mean was {}", r.mean);
    assert!(
        (r.below_010_fraction - 0.572).abs() < 0.02,
        "mirror fraction was {}",
        r.below_010_fraction
    );
}

/// Metallic: shipped art is mostly non-metal; the broken map makes 75% of the gun metal.
#[test]
fn measures_metallic_p25_gap_between_shipped_and_broken() {
    let shipped = format!("{TEX_DIR}\\016gundmw_001wgzero_001_pbr1_metallic.nutexb");
    let broken = format!("{BROKEN_TEX_DIR}\\wep_2004_metallicmap.nutexb");
    if skip_unless_file_present(&shipped) || skip_unless_file_present(&broken) {
        return;
    }
    let shipped_stats = nutexb_map_stats_from_path(&shipped).unwrap();
    let broken_stats = nutexb_map_stats_from_path(&broken).unwrap();
    // The game itself stores metallic in an sRGB view here, which is why the sRGB rule for
    // the metallic slot can only ever be a warning.
    assert_eq!(shipped_stats.stored_format, "BC3Srgb");
    assert!((shipped_stats.channels[0].p25 - 0.129).abs() < TOL);
    assert!((broken_stats.channels[0].p25 - 0.541).abs() < TOL);
}

/// Cube maps are 6-layer float textures. Both facts have to survive to the frontend:
/// layer_count drives Phase 3, ldr_clamped stops the UI trusting a clamped measurement.
#[test]
fn reports_cube_map_layers_and_flags_ldr_clamping() {
    let path = format!("{TEX_DIR}\\barispecular00_cubemap.nutexb");
    if skip_unless_file_present(&path) {
        return;
    }
    let stats = nutexb_map_stats_from_path(&path).unwrap();
    assert_eq!(stats.stored_format, "BC6Ufloat");
    assert_eq!(stats.layer_count, 6);
    assert_eq!((stats.width, stats.height), (512, 512));
    assert!(stats.ldr_clamped, "BC6 measured through the 8-bit path must be flagged");
    // Direct evidence of content above 1.0 surviving into the clamped decode.
    assert!(
        stats.channels[0].above_090_fraction > 0.02,
        "expected visible clipping, got {}",
        stats.channels[0].above_090_fraction
    );
}

/// A constant-valued placeholder must report zero deviation rather than a defaulted struct.
#[test]
fn measures_constant_placeholder_map_as_zero_deviation() {
    let path = format!("{TEX_DIR}\\016gundmw_001wgzero_001_emi_metallic.nutexb");
    if skip_unless_file_present(&path) {
        return;
    }
    let r = &nutexb_map_stats_from_path(&path).unwrap().channels[0];
    assert!((r.mean - 0.200).abs() < TOL, "mean was {}", r.mean);
    assert!(r.std_dev < 0.005, "std_dev was {}", r.std_dev);
}

/// A missing file must error. Returning a zero-filled struct would make every lint rule
/// silently pass for a texture that does not exist.
#[test]
fn missing_file_errors_instead_of_returning_defaults() {
    let result = nutexb_map_stats_from_path(r"E:\XB\mod\__does_not_exist__.nutexb");
    assert!(result.is_err());
}
```

- [ ] Run: `cargo test --test nutexb_map_stats_test`. **Expected failure:** the module `app_lib::format::nutexb_map_stats` does not exist, so the test binary fails to compile. That is the correct RED — a compile failure here proves the tests are wired to the real target.

### GREEN

- [ ] Implement `nutexb_map_stats_from_bytes(bytes: &[u8], path: &str) -> Result<NutexbMapStats, String>` and a thin `nutexb_map_stats_from_path` wrapper.
  - Read the footer once via `NutexbFile::read` for `stored_format` (format the `NutexbFormat` variant with `{:?}`), `width`, `height`, `layer_count`, `mipmap_count`. **Do not** take dimensions from the decoded image — a downsampled decode would report the wrong size.
  - Set `ldr_clamped = matches!(fmt, NutexbFormat::BC6Ufloat | NutexbFormat::BC6Sfloat)`.
  - Decode pixels with the existing `nutexb_to_rgba_from_bytes(bytes, None)`. Pass `None` for `max_dimension`: statistics must describe the real file, not a downsampled preview.
  - Accumulate one `[u64; 256]` histogram per channel in a single pass over the RGBA buffer. Then derive everything from the histograms — mean and variance as `Σ(v·count)/n` and `Σ(v²·count)/n − mean²`, percentiles by walking the cumulative counts, `below_010_fraction` as bins `0..=25` (25/255 ≈ 0.098), `above_090_fraction` as bins `230..=255` (230/255 ≈ 0.902). Document those two bin edges in a comment; they are the exact thresholds the lint rules key on.
- [ ] Run: `cargo test --test nutexb_map_stats_test`. **Expected: pass.**
- [ ] Run `cargo clippy -- -D warnings` and `cargo fmt`.

### Command wrapper

- [ ] Add to `src-tauri/src/commands.rs`, following the `nutexb_rgba_bytes` shape at `:257` (async, `spawn_blocking`, `?` twice):

```rust
/// Batched per-texture statistics for the PBR map lint. Takes a whole material's
/// textures in one call so a lint pass is one IPC round trip rather than seven.
#[tauri::command]
pub async fn nutexb_map_stats(
    paths: Vec<String>,
) -> Result<Vec<crate::format::nutexb_map_stats::NutexbMapStats>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        paths
            .iter()
            .map(|p| crate::format::nutexb_map_stats::nutexb_map_stats_from_path(p))
            .collect::<Result<Vec<_>, String>>()
    })
    .await
    .map_err(|e| e.to_string())?
}
```

- [ ] Register `commands::nutexb_map_stats` in `src-tauri/src/lib.rs` beside `commands::nutexb_rgba_bytes`.
- [ ] Add `fhm2d_memory_preview::fhm2d_memory_nutexb_map_stats` mirroring `fhm2d_memory_nutexb_rgba_bytes` (`lib.rs:126`) so in-memory FHM2D sessions can be linted too. Without it the lint silently does nothing for memory-preview workflows — an availability gap that is worse than no lint, because the panel would render "no findings".
- [ ] Run `cargo build`.

---

## Task 2: Reference corpus and threshold validation

The thresholds in Task 3 came from a handful of files measured by hand during the investigation. That is enough to state a hypothesis, not enough to ship a gate. This task turns them into something a regression can defend.

**Files:**
- Create: `scripts/build-pbr-map-corpus.mjs`
- Create: `src-tauri/tests/fixtures/pbr_map_stats_corpus.json`

- [ ] Write `scripts/build-pbr-map-corpus.mjs`. For each package it walks every `.numatb`, resolves each material's slot → texture path binding, runs `nutexb_map_stats` on the resolved files, and emits records of `{ package, materialLabel, slot, texturePath, storedFormat, width, height, layerCount, channels }`. **Slot role must come from the `.numatb` binding, never from the file name** — mod authors name files freely (`gdk0_col_01_MetallicMap`, `UCdkw00_01_SpecularMap` bound to `MetallicMap`, `wep_2004_color`), so file names are not a role signal.
- [ ] Seed the corpus from these three sources, which between them cover shipped art, shipped placeholders, and a third-party mod that is confirmed working in game:

| Source | Path | Why it is in the corpus |
|---|---|---|
| Shipped, full detail | `E:\XB\mod\002chara\wing_gundam_zero_rebellion_model\textures\016gundmw_001wgzero_001_pbr1_*` | The reference this case was diagnosed against |
| Shipped, constant placeholders | same folder, `..._emi_*` | Several are single-valued (`emi_metallic` mean 0.200 std 0.000). Any rule keyed on variance must not fire on these. |
| Working third-party mod | `E:\XB\mod\002chara\026gnbelt_003delatkai_001\textures\gdk0_col_01_*`, `UCdkw00_01_*` | Proves what a *custom* package can look like and still be correct in game |

- [ ] Add a test asserting **every corpus entry produces zero `error`-severity findings** from Task 3's rules. This is the guard that stops a future threshold tweak from criminalising stock art. Any change to the threshold table must keep this green.

---

## Task 3: Lint rule engine

**Files:**
- Modify: `src/components/ssbh-model-preview/meshFromSsbh.ts` (extend `ResolvedMaterialBinding`)
- Create: `src/components/ssbh-model-preview/pbrMapLint.ts`
- Create: `src/components/ssbh-model-preview/pbrMapLint.test.ts`

### Prerequisite: `Texture1` must reach the binding

`ResolvedMaterialBinding.textureRefs` (`meshFromSsbh.ts:562-593`) has `map / normal / roughness / metalness / emissive / ao / cube` and **no `texture1`**, and `ResolvedMaterialTexturePaths` (`:306-314`) likewise. The `texture1-unbound` rule cannot exist without it.

- [ ] Add `texture1: string | null` to `textureRefs` and `texture1Path: string | null` to `ResolvedMaterialTexturePaths`, populated from `textureRefForParam(entry, "Texture1")`.
- [ ] Do **not** add it to `TEXTURE_PREVIEW_SLOT_META` or `createDefaultTextureSlotLoadEnabled` — `Texture1` is not a preview render slot and adding it there would change what gets decoded and uploaded. It is lint metadata only. Add a comment saying so, because the asymmetry looks like an oversight otherwise.

### Types

```ts
export type PbrLintSlot =
  | "map" | "normalMap" | "roughnessMap" | "metalnessMap"
  | "emissiveMap" | "aoMap" | "cubeMap" | "texture1";

export type PbrMapRuleId =
  | "roughness-mirror" | "roughness-too-low"
  | "metallic-everything" | "metallic-high-mean"
  | "srgb-on-data-map" | "srgb-on-metallic"
  | "ao-no-effect" | "normal-no-detail"
  | "texture1-unbound" | "non-power-of-two";

export type PbrMapFinding = {
  ruleId: PbrMapRuleId;
  severity: "error" | "warn" | "info";
  slot: PbrLintSlot;
  materialLabel: string;
  texturePath: string | null;
  /** Human-readable measured value, e.g. "mirror texels 57.2%". */
  measured: string;
  /** The shipped-art range this was judged against, e.g. "shipped 0.3%, working mod 2.8%". */
  shippedRange: string;
  message: string;
};

export function lintPbrMaps(
  binding: ResolvedMaterialBinding,
  statsByPath: ReadonlyMap<string, NutexbMapStats>,
): PbrMapFinding[];
```

Every finding carries both `measured` and `shippedRange`. A finding that says only "roughness looks wrong" is not actionable; one that says "mirror texels 57.2% — shipped art is 0.3%, working mod 2.8%" tells the author what to aim at.

### Rule table

| Rule | Condition | Severity | Evidence |
|---|---|---|---|
| `roughness-mirror` | roughness R `below010Fraction` > 0.10 | **error** | shipped 0.3%, mod 2.8%, broken **57.2%** |
| `roughness-too-low` | roughness R `mean` < 0.25 | warn | shipped 0.525, mod 0.464, broken **0.120** |
| `metallic-everything` | metallic R `p25` > 0.40 | **error** | 75% of the surface substantially metal; shipped p25 0.129, mod 0.149, broken **0.541** |
| `metallic-high-mean` | metallic R `mean` > 0.50 | warn | shipped 0.285, mod 0.404, broken **0.631** |
| `srgb-on-data-map` | `normalMap` / `roughnessMap` / `aoMap` / `texture1` bound to a `storedFormat` ending in `Srgb` | **error** | shipped and mod use `BC4Unorm` / `BC7Unorm` for all four |
| `srgb-on-metallic` | `metalnessMap` bound to a `*Srgb` format | **warn, never error** | shipped `pbr1_metallic` is genuinely `BC3Srgb` while `emi_metallic` is `BC4Unorm`. The game contradicts itself, so an error would fire on stock art. |
| `ao-no-effect` | AO R `stdDev` < 0.01 | info | broken 0.005, but the **working mod ships 0.994 mean / near-zero variance too** — so this is advisory, not a defect |
| `normal-no-detail` | normal R `stdDev` < 0.02 | info | shipped 0.171, mod **0.013**, broken 0.005. The mod is below the threshold and works in game, which is exactly why this is not an error. |
| `texture1-unbound` | `texturePaths.texture1Path` is null | warn | 7/7 shipped materials and 2/2 mod materials bind it |
| `non-power-of-two` | width or height not a power of two | info | `wep_2004_color` is 1408² |

Two rules are deliberately **weaker than the evidence would allow**, and both must stay that way:

- `srgb-on-metallic` is a warning because the shipped `pbr1_metallic` really is `BC3Srgb`. Promoting it to error makes the linter wrong about the game's own files.
- `normal-no-detail` and `ao-no-effect` are info because the confirmed-working Delta Kai mod violates both. A rule that flags a package known to look correct in game is a false positive, regardless of how defensible the underlying art advice is.

### RED

- [ ] Create `src/components/ssbh-model-preview/pbrMapLint.test.ts`. Use plain object fixtures — the rule engine is pure, so no rendering or mocking is needed.

```ts
import { describe, expect, it } from "vitest";
import { lintPbrMaps, type PbrMapFinding } from "./pbrMapLint";
import type { NutexbMapStats } from "./nutexbMapStatsTypes";
import type { ResolvedMaterialBinding } from "./meshFromSsbh";

/** Only the R channel drives every rule; G/B/A mirror it for these greyscale maps. */
function stats(
  path: string,
  storedFormat: string,
  r: Partial<NutexbMapStats["channels"][0]>,
  size = 2048,
): NutexbMapStats {
  const channel = {
    mean: 0.5, stdDev: 0.2, p01: 0, p25: 0.4, p50: 0.5, p75: 0.6, p99: 1,
    below010Fraction: 0, above090Fraction: 0, ...r,
  };
  return {
    path, storedFormat, width: size, height: size, layerCount: 1, mipmapCount: 1,
    ldrClamped: false,
    channels: [channel, channel, channel, channel],
  };
}

function binding(paths: Partial<ResolvedMaterialBinding["texturePaths"]>): ResolvedMaterialBinding {
  return {
    materialLabel: "Wep_2004",
    shaderLabel: "vsngCharaBasic",
    shaderFamily: "vsngCharaBasic",
    textureRefs: {
      map: null, normal: null, roughness: null, metalness: null,
      emissive: null, ao: null, cube: null, texture1: null,
    },
    texturePaths: {
      mapPath: null, normalPath: null, roughnessPath: null, metalnessPath: null,
      emissivePath: null, aoPath: null, cubePath: null, texture1Path: null, ...paths,
    },
    renderHints: { isTransparent: false, isSparkle: false },
    uniforms: { fresnelType4V16Hex: null, roughnessScalar: null, metalnessScalar: null },
    sampling: {} as ResolvedMaterialBinding["sampling"],
  };
}

const ids = (f: PbrMapFinding[]) => f.map((x) => x.ruleId);
const errorIds = (f: PbrMapFinding[]) => f.filter((x) => x.severity === "error").map((x) => x.ruleId);

describe("lintPbrMaps — the shipped defect", () => {
  it("flags the broken custom weapon with the four defects that shipped", () => {
    const found = lintPbrMaps(
      binding({
        roughnessPath: "wep_2004_roughnessmap",
        metalnessPath: "wep_2004_metallicmap",
        normalPath: "wep_2004_normalmap",
        aoPath: "wep_2004_aomap",
        texture1Path: null,
      }),
      new Map([
        ["wep_2004_roughnessmap", stats("wep_2004_roughnessmap", "BC7Srgb", { mean: 0.120, p25: 0.039, below010Fraction: 0.572 })],
        ["wep_2004_metallicmap", stats("wep_2004_metallicmap", "BC7Srgb", { mean: 0.631, p25: 0.541 })],
        ["wep_2004_normalmap", stats("wep_2004_normalmap", "BC7Srgb", { mean: 0.498, stdDev: 0.0053 })],
        ["wep_2004_aomap", stats("wep_2004_aomap", "BC7Srgb", { mean: 0.995, stdDev: 0.0051 })],
      ]),
    );

    expect(errorIds(found)).toEqual(
      expect.arrayContaining(["roughness-mirror", "metallic-everything", "srgb-on-data-map"]),
    );
    expect(ids(found)).toContain("texture1-unbound");
  });

  it("reports the measured value and the shipped range so the finding is actionable", () => {
    const found = lintPbrMaps(
      binding({ roughnessPath: "r" }),
      new Map([["r", stats("r", "BC7Unorm", { mean: 0.120, below010Fraction: 0.572 })]]),
    );
    const mirror = found.find((f) => f.ruleId === "roughness-mirror")!;
    expect(mirror.measured).toContain("57.2");
    expect(mirror.shippedRange).toMatch(/0\.3%/);
    expect(mirror.texturePath).toBe("r");
  });
});

describe("lintPbrMaps — the fixed package is clean", () => {
  it("returns no errors for the calibrated maps", () => {
    const found = lintPbrMaps(
      binding({
        roughnessPath: "r", metalnessPath: "m", normalPath: "n",
        aoPath: "a", texture1Path: "r",
      }),
      new Map([
        ["r", stats("r", "BC7Unorm", { mean: 0.530, p25: 0.357, p50: 0.494, below010Fraction: 0.000 })],
        ["m", stats("m", "BC7Unorm", { mean: 0.291, p25: 0.125, below010Fraction: 0.193 })],
        ["n", stats("n", "BC7Unorm", { mean: 0.498, stdDev: 0.0212 })],
        ["a", stats("a", "BC7Unorm", { mean: 0.995, stdDev: 0.0051 })],
      ]),
    );
    expect(errorIds(found)).toEqual([]);
  });
});

describe("lintPbrMaps — must not criminalise shipped or known-good art", () => {
  it("does not error on the game's own sRGB metallic map", () => {
    const found = lintPbrMaps(
      binding({ metalnessPath: "pbr1_metallic" }),
      new Map([["pbr1_metallic", stats("pbr1_metallic", "BC3Srgb", { mean: 0.285, p25: 0.129, below010Fraction: 0.193 }, 1024)]]),
    );
    expect(errorIds(found)).toEqual([]);
    expect(found.find((f) => f.ruleId === "srgb-on-metallic")?.severity).toBe("warn");
  });

  it("does not error on the working mod's nearly flat normal and AO maps", () => {
    const found = lintPbrMaps(
      binding({ normalPath: "n", aoPath: "a" }),
      new Map([
        ["n", stats("n", "BC7Unorm", { mean: 0.498, stdDev: 0.0129 })],
        ["a", stats("a", "BC7Unorm", { mean: 0.994, stdDev: 0.004 })],
      ]),
    );
    expect(errorIds(found)).toEqual([]);
    expect(found.map((f) => f.severity)).not.toContain("error");
  });

  it("does not fire variance rules on shipped constant-valued placeholders", () => {
    const found = lintPbrMaps(
      binding({ metalnessPath: "emi_metallic", roughnessPath: "emi_roughness" }),
      new Map([
        ["emi_metallic", stats("emi_metallic", "BC4Unorm", { mean: 0.200, stdDev: 0, p25: 0.2, below010Fraction: 0 }, 128)],
        ["emi_roughness", stats("emi_roughness", "BC4Unorm", { mean: 0.502, stdDev: 0, p25: 0.502, below010Fraction: 0 }, 128)],
      ]),
    );
    expect(errorIds(found)).toEqual([]);
  });
});

describe("lintPbrMaps — absent data is not a pass", () => {
  it("skips slots with no bound texture rather than inventing findings", () => {
    expect(lintPbrMaps(binding({}), new Map())).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId: "texture1-unbound" })]),
    );
  });

  it("reports a bound path whose stats are missing instead of silently passing", () => {
    const found = lintPbrMaps(binding({ roughnessPath: "gone" }), new Map());
    expect(found.some((f) => f.texturePath === "gone")).toBe(true);
  });
});
```

- [ ] Run: `npm test -- src/components/ssbh-model-preview/pbrMapLint.test.ts`. **Expected failure:** `pbrMapLint.ts` does not exist.

### GREEN

- [ ] Create `src/components/ssbh-model-preview/nutexbMapStatsTypes.ts` mirroring the Rust struct in camelCase (the command already serialises with `rename_all = "camelCase"`).
- [ ] Implement `pbrMapLint.ts` as a pure module. Export the threshold table as one named constant:

```ts
export const PBR_LINT_THRESHOLDS = {
  roughnessMirrorFraction: 0.10,
  roughnessLowMean: 0.25,
  metallicHighP25: 0.40,
  metallicHighMean: 0.50,
  aoFlatStdDev: 0.01,
  normalFlatStdDev: 0.02,
} as const;
```

- [ ] Implement each rule as a small function over `(slot, stats)` returning `PbrMapFinding | null`, then concatenate. Keep them independent so a rule can be disabled without touching the others.
- [ ] A bound path with no matching stats entry produces a finding, never silence. Silence there would mean a texture that failed to load reads as clean — the exact failure mode this plan exists to remove.
- [ ] Run: `npm test -- src/components/ssbh-model-preview/pbrMapLint.test.ts`. **Expected: pass.**

---

## Task 4: Surface findings in the editor

**Files:**
- Create: `src/components/ssbh-model-preview/components/PbrMapLintPanel.tsx`
- Create: `src/components/ssbh-model-preview/components/PbrMapLintPanel.test.tsx`
- Create: `src/components/ssbh-model-preview/pbrMapStatsService.ts`
- Modify: `src/page/UnitModelEdit/components/UnitModelTexturePanel.tsx`
- Modify: `src/components/ssbh-model-preview/SsbhModelPreviewInspector.tsx`

### RED

- [ ] Write `PbrMapLintPanel.test.tsx` mocking `invoke` the way `useSceneTextureLoader.test.tsx` does. Cases:
  - Findings render grouped error → warn → info, with the error count in the header badge.
  - **A clean material renders an explicit "No findings" state**, never an empty container. An empty box is indistinguishable from a panel that failed to run, which is how this class of bug hides.
  - A failed `nutexb_map_stats` call renders the error text and does **not** render "No findings".
  - Clicking a finding calls `onSelectSlot` with that finding's slot.
  - A `ldrClamped` texture renders the clamped-measurement notice.
- [ ] Run: `npm test -- src/components/ssbh-model-preview/components/PbrMapLintPanel.test.tsx`. **Expected failure:** component does not exist.

### GREEN

- [ ] Implement `pbrMapStatsService.ts`: a thin typed wrapper over `invoke("nutexb_map_stats", { paths })` plus the memory-session variant. No rule logic in the service.
- [ ] Implement the panel. Key the stats request by the same content identity the texture cache already uses (`nutexbPreviewCache.ts`), so switching models does not re-measure unchanged files.
- [ ] Mount in `UnitModelTexturePanel` and `SsbhModelPreviewInspector`, with an error/warn count badge on the collapsed header so a problem is visible without opening the panel.
- [ ] Run the focused test. **Expected: pass.**

---

# Phase 2 — Compare against a reference material

## Task 5: Reference diff service

**Files:**
- Create: `src/components/ssbh-model-preview/pbrMapReferenceDiff.ts`
- Create: `src/components/ssbh-model-preview/pbrMapReferenceDiff.test.ts`

### RED

- [ ] Write the failing test:

```ts
describe("diffAgainstReference", () => {
  it("reproduces the roughness and metallic gaps that identified the bug", () => {
    const deltas = diffAgainstReference(brokenWeapon, shippedPbr1);
    const roughness = deltas.find((d) => d.slot === "roughnessMap")!;
    expect(roughness.meanDelta).toBeCloseTo(0.120 - 0.525, 2);
    expect(roughness.below010Delta).toBeCloseTo(0.572 - 0.003, 2);
    const metallic = deltas.find((d) => d.slot === "metalnessMap")!;
    expect(metallic.p25Delta).toBeCloseTo(0.541 - 0.129, 2);
    expect(metallic.storedFormatMismatch).toEqual({ subject: "BC7Srgb", reference: "BC3Srgb" });
  });

  it("yields all-zero deltas when a material is diffed against itself", () => {
    for (const d of diffAgainstReference(shippedPbr1, shippedPbr1)) {
      expect(d.meanDelta).toBe(0);
      expect(d.storedFormatMismatch).toBeNull();
    }
  });

  it("lists slots missing from the reference instead of dropping them", () => {
    const deltas = diffAgainstReference(withEmissive, withoutEmissive);
    expect(deltas.find((d) => d.slot === "emissiveMap")?.referenceMissing).toBe(true);
  });
});
```

- [ ] Run: `npm test -- src/components/ssbh-model-preview/pbrMapReferenceDiff.test.ts`. **Expected: fail.**

### GREEN

- [ ] Implement `diffAgainstReference(subject, reference): SlotDelta[]`, pairing by slot role. A slot present in one side only is reported with `referenceMissing` / `subjectMissing`, never dropped — a silently dropped slot is how a missing map looks identical to a matching one.
- [ ] Run the test. **Expected: pass.**

## Task 6: Reference comparison UI

**Files:**
- Create: `src/components/ssbh-model-preview/components/PbrMapReferencePanel.tsx`
- Create: `src/components/ssbh-model-preview/components/PbrMapReferencePanel.test.tsx`

- [ ] RED: picking a reference populates the delta table; unmatched slots are listed explicitly; the histogram overlay renders one series per side.
- [ ] Run the focused test. **Expected: fail.**
- [ ] GREEN: reference picker over any material in the loaded package or a browsed `.numatb`; per-slot delta table; 256-bin histogram overlay of subject vs reference from the stats already fetched in Phase 1.
- [ ] Run the focused test. **Expected: pass.**

---

# Phase 3 — HDR environment (render fidelity)

> Do not start until Phases 1 and 2 are merged. This changes what the viewport looks like for **every** model and needs its own review pass.

**What is already built.** `COMPRESSED_FORMAT_MAP[6]` (`nutexbPreviewCache.ts:427`) already maps BC6H to `COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT` (`0x8E8F`), and `nutexb_compressed_data_from_bytes` (`nutexb_lib.rs:545`) already returns `format_id = 6` for `BC6Ufloat`. Two things block it: `useSceneTextureLoader.ts:211` hardcodes `const useCompressed = false`, and the Rust side returns mip 0 of **layer 0 only** while a cube map has six layers. Verify both claims at runtime before writing new mapping code.

## Task 7: Layer-aware compressed extraction

**Files:**
- Modify: `src-tauri/src/nutexb_lib.rs`
- Modify: `src-tauri/tests/nutexb_map_stats_test.rs`

- [ ] RED: assert a 6-layer `BC6Ufloat` cube map returns six faces of `ceil(512/4)² × 16 = 262144` bytes each, and that a 1-layer BC7 texture still returns exactly one layer of the previously expected length (the backward-compatibility guard).
- [ ] Run: `cargo test --test nutexb_map_stats_test`. **Expected: fail.**
- [ ] GREEN: extend the response to carry `layer_count` and all layers. `pack_compressed_response` currently emits `[u32 width][u32 height][u8 format_id][data...]`. Either append the layer count in a backward-compatible way or bump to a versioned header — **decide explicitly and record the choice in the function doc comment**, because `parseCompressedResponse` (`nutexbPreviewCache.ts:438`) hardcodes the 9-byte prefix and will silently misparse otherwise.
- [ ] Also print the decoded float range for BC6 sources behind a test-only helper, so the open question "what is the actual HDR peak" gets an answer instead of staying an inference.
- [ ] Run the test. **Expected: pass.**

## Task 8: Enable the compressed path for the cube slot only

**Files:**
- Modify: `src/page/SceneEdit/hooks/useSceneTextureLoader.ts`
- Modify: `src/components/ssbh-model-preview/ssbhTextureUpload.ts`
- Modify: `src/components/ssbh-model-preview/nutexbPreviewCache.ts`

- [ ] Replace `const useCompressed = false` (`:211`) with a per-slot decision that enables the compressed path **for `cubeMap` only**. Every other slot keeps its current RGBA behaviour, so the blast radius is one slot instead of the whole pipeline.
- [ ] Build a `THREE.CompressedCubeTexture` from the six faces and skip the `EquirectangularReflectionMapping` override (`ssbhTextureUpload.ts:205-207`) for compressed cubes. Keep the equirectangular path as the RGBA fallback.
- [ ] Gate on `EXT_texture_compression_bptc`. When unavailable, fall back to the existing clamped RGBA path and record that fact for Task 10 to surface. **Never fail the load** — a missing extension must degrade, not break.
- [ ] Face order and orientation are **unverified**. Add a test asserting face count and per-face byte length, then validate orientation visually against a shipped model before merging. A test cannot catch a swapped face; a human looking at a reflection can.

## Task 9: Consolidate environment and AO intensity

**Files:**
- Create: `src/components/ssbh-model-preview/exvsMaterialTuning.ts`
- Modify: `src/components/ssbh-model-preview/SsbhModelCanvas.tsx`
- Modify: `src/page/SceneEdit/components/MapViewport.tsx`

- [ ] `envMapIntensity` (1.05 / 1.15 / 1.38 / 1.55) and `aoMapIntensity` (0.35) are hardcoded in `SsbhModelCanvas.tsx:743-750`, `:783` and duplicated in **two separate blocks** of `MapViewport.tsx` (`:1552-1587`, `:1926-1969`). Extract one shared module.
- [ ] Write a test asserting both viewports resolve identical values for the same binding, so the copies cannot drift again.
- [ ] Re-tune once the cube map is genuinely HDR. The current numbers were chosen to compensate for a clamped LDR probe and **will be too bright afterwards**.

## Task 10: Show the stored format and the fallback state

**Files:**
- Modify: `src/page/UnitModelEdit/components/UnitModelTexturePanel.tsx`
- Modify: `src/page/SceneEdit/components/TextureQualityPanel.tsx`

- [ ] Display each texture's stored nutexb format, dimensions, and layer count from the Task 1 stats. The preview correctly overrides the color space by slot role, so the file's own tag is otherwise entirely invisible in the UI — which is root cause #1.
- [ ] Mark a compressed-cube fallback (extension unavailable) inline, so an LDR-clamped environment is never mistaken for the real thing.

---

# Verification

- [ ] `cargo test --test nutexb_map_stats_test`
- [ ] `cargo clippy -- -D warnings` and `cargo fmt --check`
- [ ] `cargo build`
- [ ] `npm test -- src/components/ssbh-model-preview/pbrMapLint.test.ts src/components/ssbh-model-preview/pbrMapReferenceDiff.test.ts`
- [ ] `npm test -- src/components/ssbh-model-preview/components/PbrMapLintPanel.test.tsx src/components/ssbh-model-preview/components/PbrMapReferencePanel.test.tsx`
- [ ] `npm run build` (no dev server — see the project rule)
- [ ] `git diff --check`

**End-to-end regression gate.** This is the proof the plan worked:

- [ ] Run the lint against `E:\XB\mod\002chara\wing_gundam_zero_rebellion_model.bak-20260809` (the pre-fix backup, 20 textures / 48 model files) and confirm it reports `roughness-mirror`, `metallic-everything`, `srgb-on-data-map`, and `texture1-unbound`.
- [ ] Run it against the current fixed package and confirm **zero errors**.
- [ ] Run it against `E:\XB\mod\002chara\026gnbelt_003delatkai_001` and confirm **zero errors** — a known-good third-party mod must stay clean.

A lint that cannot flag the case it was built from is not done.

---

# Appendix A — Measured ground truth

Every assertion in this plan traces to one of these. All values are the raw stored 8-bit R channel measured after decoding the `.nutexb`. `mirror` is the fraction below 0.1.

## Shipped art — `016gundmw_001wgzero_001_*`

| Texture | Format | Dims | mean | std | p25 | p50 | p75 | mirror |
|---|---|---|---|---|---|---|---|---|
| `pbr1_basecolor` | BC7Srgb | 1024² | 0.583 | 0.310 | — | — | — | — |
| `pbr1_normal` | BC7Unorm | 2048² | 0.505 | **0.171** | — | — | — | — |
| `pbr1_roughness` | BC4Unorm | 1024² | **0.525** | 0.207 | 0.357 | 0.482 | 0.694 | **0.3%** |
| `pbr1_metallic` | **BC3Srgb** | 1024² | **0.285** | 0.226 | **0.129** | 0.247 | 0.302 | 19.3% |
| `pbr1_ambientocclusion` | BC4Unorm | 1024² | 0.838 | 0.259 | 0.780 | 0.969 | 1.000 | 4.4% |
| `pbr1_roughnessandmask` | BC7Unorm | 1024² | 0.273 | 0.196 | — | — | — | — |
| `emi_metallic` | BC4Unorm | 128² | 0.200 | **0.000** | — | — | — | 0% |
| `emi_roughness` | BC4Unorm | 128² | 0.502 | **0.000** | — | — | — | 0% |
| `emi_normal` | BC7Unorm | 128² | 0.498 | **0.000** | — | — | — | — |
| `barispecular00_cubemap` | **BC6Ufloat** | 512² ×**6** | 0.103* | — | — | — | — | — |

\* LDR-clamped decode. Per-channel clipping in that decode — direct evidence of content above 1.0:

| Channel | mean | fraction > 0.9 | fraction at 1.0 |
|---|---|---|---|
| R | 0.1031 | **0.0415** | 0.0358 |
| G | 0.1009 | 0.0392 | 0.0326 |
| B | 0.0864 | 0.0274 | 0.0227 |

3.90% of texels have at least one channel at 255; 2.05% are fully white. The Task 1 test asserts `above_090_fraction > 0.02` on the R channel, which clears the measured 0.0415 with margin.

## Working third-party mod — `026gnbelt_003delatkai_001`

| Texture | Format | Dims | mean | std | p25 | p50 | p75 | mirror |
|---|---|---|---|---|---|---|---|---|
| `gdk0_col_01_color` | BC7Unorm | 2048² | 0.526 | — | — | — | — | — |
| `gdk0_col_01_NormalMap` | BC7Unorm | 2048² | 0.498 | **0.013** | — | — | — | — |
| `gdk0_col_01_RoughnessMap` | BC7Unorm | 2048² | 0.464 | — | 0.145 | 0.349 | 0.847 | 2.8% |
| `gdk0_col_01_MetallicMap` | BC7Unorm | 2048² | 0.404 | — | 0.149 | 0.325 | 0.694 | 0.0% |
| `gdk0_col_01_AOMap` | BC7Unorm | 2048² | 0.994 | — | — | — | — | 0.0% |

Both materials bind `Texture1` to their own `RoughnessMap`.

## Broken custom weapon — before the fix

Located at `...wing_gundam_zero_rebellion_model.bak-20260809\textures\`.

| Texture | Format | Dims | mean | std | p25 | p50 | p75 | mirror |
|---|---|---|---|---|---|---|---|---|
| `wep_2004_color` | BC7Srgb | **1408²** | 0.161 | 0.253 | — | — | — | — |
| `wep_2004_normalmap` | **BC7Srgb** | 2048² | 0.498 | **0.0053** | — | — | — | — |
| `wep_2004_roughnessmap` | **BC7Srgb** | 2048² | **0.120** | 0.117 | 0.039 | 0.090 | 0.149 | **57.2%** |
| `wep_2004_metallicmap` | **BC7Srgb** | 2048² | **0.631** | 0.198 | **0.541** | 0.667 | 0.788 | 0.0% |
| `wep_2004_aomap` | **BC7Srgb** | 2048² | 0.995 | **0.0051** | — | — | — | 0.0% |

`Texture1` unbound on both `bsrifle00b_out` and `tbsrifle_out`, in both the `__nust__` and `__maya__` profiles.

## Fixed custom weapon — after the fix

| Texture | Format | mean | p25 | p50 | p75 | mirror |
|---|---|---|---|---|---|---|
| `wep_2004_roughnessmap` | BC7Unorm | 0.530 | 0.357 | 0.494 | 0.702 | **0.0%** |
| `wep_2004_metallicmap` | BC7Unorm | 0.291 | 0.125 | 0.247 | 0.302 | 19.3% |
| `wep_2004_normalmap` | BC7Unorm | 0.498 (std 0.021) | — | — | — | — |
| `wep_2004_aomap` | BC7Unorm | 0.995 (pixels unchanged) | — | — | — | — |

---

# Appendix B — Risks and open questions

| Item | Status | Handling |
|---|---|---|
| Actual HDR peak of `barispecular00_cubemap` | **Unmeasured.** `ultimate_tex_cli` writes 0 bytes for `.exr` and `.hdr`. Evidence for above-1.0 content is the `BC6Ufloat` storage format plus 3.90% clipping in the 8-bit decode. | Task 7 prints the decoded float range, converting the inference into a measurement. |
| Cube face order and orientation | Unverified. | Task 8 tests count and size; orientation needs a human visual check before merge. |
| `vsngCharaBasic` environment intensity | Unknown. | Phase 3 makes the *probe* correct; the shader constant is still guessed. Task 10 must say so in the UI rather than implying parity with the game. |
| `srgb-on-metallic` severity | Deliberately `warn`. | Shipped `pbr1_metallic` is `BC3Srgb` and `emi_metallic` is `BC4Unorm`. An error would fire on stock art. Locked by a Task 3 test. |
| `normal-no-detail` / `ao-no-effect` severity | Deliberately `info`. | The confirmed-working Delta Kai mod violates both. Locked by a Task 3 test. |
| Threshold drift over time | Guarded. | Task 2's corpus test fails if any threshold change makes stock or known-good art produce an error. |
| Phase 3 changes every model's appearance | Accepted. | Merged separately from Phases 1 and 2, with its own review pass and re-tuning in Task 9. |

---

# Related docs

- Case write-up and full evidence: `docs/exvs2-custom-model-pbr-map-calibration.md`
- Material validation gate design: `docs/agent-sessions/numatb-texture-validation-gate/design-numatb-format-module.md`
- Unit model dynamic folder pipeline: `docs/agent-sessions/unit-model-editor/dynamic-folder-pipeline-plan.md`
