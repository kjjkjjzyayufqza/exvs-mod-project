# EXVS2 homemade NUANMB: in-game layout (FBX import)

Status: **accepted** (2026-08-03) — in-game retest confirmed  
Domain: Unit Model / Motion panel — **Import FBX as NUANMB** and any
`MotionClip` → `.nuanmb` write path used for **in-game** body/shot clips.

### Verified root-cause ranking (in-game retest)

Four candidate fixes were isolated during diagnosis. **Product path keeps full
Translate on every bone** (item 2 cancelled as a requirement). Retest conclusion:

| # | Factor | Role in prior “editor OK / game bad” |
|---|--------|--------------------------------------|
| **3** | Multi-frame rotate = **indexed `0x4300`** (not dense stream) | **Primary / most important** for real moving shots |
| **1** | Uncompressed stock shell: **CompScale + Scale + Rotate + Translate + Visibility** | Contributes; old `to_anim_uncompressed` missing CompScale/Visibility misbehaves in-game |
| **4** | Hygiene & pipeline: no `ATH_*`, prefer real FBX source, no residual compress, re-import UX | **Definitely involved** (wrong source / residual / ATH can still break or confuse diagnosis) |
| **2** | Omit limb Translate (roots only) | **Not required.** In-game OK with full limb Translate when 1+3+4 are correct |

**Takeaway:** fix dense multi-frame `0x4300` first on moving clips; always ship the
CompScale/Visibility shell; keep full Translate; never treat residual or ATH bake
as the product default.

Related:

- `docs/nuanmb-ath-helper-bone-policy.md` — never author `ATH_*` tracks  
- `docs/adr/0002-motion-fbx-import-direct-ufbx.md` — direct ufbx import  
- `docs/ssbh-wmmt2-merge-animation-regression.md` — TransformFlags semantics  
- Code: `src-tauri/src/ssbh_motion_interchange/nuanmb.rs`  
  (`write_motion_clip_as_nuanmb`, `write_anim_data_exvs2_uncompressed`)  
- UI: `src/components/ssbh-model-preview/components/MotionFbxImportPanel.tsx`  
- Client notes: `src/components/ssbh-model-preview/motionFbxImportService.ts`

Primary verification asset (Delta Kai motion pack):

- FBX: homemade main-shot / aerial idle authored in Cascadeur  
- Live NUANMB under unit motion folder (example):  
  `…/026gnbelt_003delatkai_001_motion/0/0/主射CSA.nuanmb`  
- Skeleton: body `.nusktb`  
- Helper policy: body `.nuhlpb` drives `ATH_*` (not NUANMB)

---

## 1. Symptom (what was wrong)

| Environment | Behavior |
|-------------|----------|
| DCC / FBX | Pose and timing look correct |
| Editor preview (same NUANMB + NUSKTB) | Looks correct |
| **In-game after pack** | Wrong pose: body twisted / “scrambled”, or a frozen bad pose; hold clips and moving clips both affected until layout was fixed |

Important distinctions discovered during diagnosis:

1. **Not primarily an ATH problem** on the final broken files (many homemade clips already had **zero** `ATH_*` nodes). ATH omission remains mandatory (see ATH policy) but was **not** the sole root cause of “editor OK / game bad”.
2. **“60 frames idle hold” vs “real main-shot motion”** must not be confused. A true hold (constant pose) can look fine after partial layout fixes, while a **multi-frame** shot still fails if multi-frame rotate encoding is wrong.
3. **Dense full-TRS + `to_anim_uncompressed` alone** is enough for the editor’s composition path; it is **not** enough for stock-like EXVS2 runtime expectations.

---

## 2. Root causes (ordered by impact)

Impact order from in-game retest: **§2.2 (indexed `0x4300`) ≫ §2.1 (property shell)
and §2.4–2.6 (hygiene / source / UX)**. Limb-T omission (§2.3 historical) is **not**
a required product fix.

### 2.1 Missing stock Transform properties

Stock body/shot `.nuanmb` (kamae, grenade, boost, …) almost always carry on **each** Transform track:

| Property | Typical **stock** presence | **Product Import** (this repo) |
|----------|----------------------------|--------------------------------|
| `CompensateScale` | Always (`0x1013`, value `0` when false) | **Always** |
| `Rotate` | Always | **Always** |
| `Translate` | Stock often **roots only** (`GBL_RT` / `CENTER_RT` / `BASE`); limbs omit | **Always on every Transform bone** (limbs included) |
| `Scale` | Often only on roots when needed; limbs usually omit | **Always** (dense shell) |
| `Visibility` | Usually present (`0x1013`, `0x7FFF` = visible) | **Always** |

Old homemade path (`AnimData::to_anim_uncompressed` only):

- Always wrote **Scale + Rotate + Translate**
- **Never** wrote `CompensateScale` / `Visibility`
- Editor still samples correctly; **in-game** diverges

**A/B experiments (static hold, same source pose):**

| Experiment | Change | In-game hold |
|------------|--------|--------------|
| **B** | Keep dense Translate; **add only** CompScale + Visibility | OK |
| **C** | Omit limb Translate; **no** CompScale/Visibility | OK |
| Full stock-like hold | CompScale + Vis + no limb Translate + `0x4003` holds | OK |

Conclusion (holds only): either property shell (B) or limb-T omission (C) can unblock
**static hold** clips. That does **not** make (C) a product requirement.

**Product policy (current, retest-confirmed):** experiment **B** semantics —
**always write Translate on every bone** — plus CompScale/Visibility + **indexed
multi-frame rotate (§2.2)**. Item (C) remains historical A/B only.

### 2.2 Multi-frame rotate header `0x4300` layout (**most important** for moving shots)

`0x4300` is overloaded. `ssbh_data` documents several layouts and picks by buffer length:

| Variant | Layout (after magic) | Typical use |
|---------|----------------------|-------------|
| **A (dense)** | `u32 count` + `f32 unk1` + `f32 unk2` + `count × vec4` | Homemade writer (old) |
| **B** | 12-byte header + dense quats | Alternate |
| **C (indexed)** | `u32 count` + `f32 unk1` + `u8 indices[count]` + align4 + `count × vec4` | **Game-observed / preferred** |

Old homemade multi-frame rotate used **variant A** (example: 61 keys → buffer length **992**).  
Indexed **variant C** for 61 keys → length **1052** (`12 + 61 + pad + 61×16`).

Stock **moving** shot clips almost never use dense `0x4300`; multi-frame rotates are mostly residual families (`0x4409` / `0x4408` / `0x4308` / …). Constant holds use `0x4003`.

| Clip type | Editor | Game with dense `0x4300` |
|-----------|--------|---------------------------|
| Hold (`0x4003` only) | OK | Often OK after CompScale/Vis |
| **Moving shot** (dense `0x4300`) | OK | **Bad / frozen garbage pose** |
| Moving shot (**indexed** `0x4300`) | OK | **OK** (verified in-game on real main-shot) |

**Retest weight:** this factor is the **main** reason real multi-frame shots failed
while the editor still looked correct. CompScale/Visibility and pipeline hygiene
matter, but without indexed `0x4300` a moving shot still breaks in-game even when
other shells look right.

**Policy for this repo:** do **not** depend on residual `0x3409` / `0x4409` for homemade import. Use **uncompressed** streams only:

- Hold / near-constant: `0x4003` (quat), `0x3003` (vec3)  
- Multi-frame rotate: **indexed** `0x4300`  
- Multi-frame translate (when present): indexed-style `0x3300` (already used)

Residual compression is **forbidden** for Import FBX product path unless a future decision explicitly opts in and is re-verified in-game.

### 2.3 Limb / torso translation semantics (**not** a required product fix)

TransformFlags (wmmt2-merge / preview):

- `override_translation = true` → use **skeleton rest** translation  
- `override_translation = false` → use **animation** translation  

Property-sparse stock: **missing** Translate ⇒ `override_translation = true`.

Dense homemade (product Import): Translate present on **every** bone ⇒ `override_translation = false`.  
Values should match authored local translation (typically rest bone length for rigid limbs when the source does not animate stretch).

**In-game retest:** full limb Translate + items **1 + 3 + 4** is fine. Omitting limb
Translate was an optional historical A/B path only; it is **not** needed to fix the
main-shot scramble once indexed `0x4300` and the property shell are correct.

**Historical note (rejected as product default):** omitting non-root Translate matched stock shot sparsity and unblocked some hold A/B tests. Product policy **cancelled** that path: Import always writes Translate so FBX-authored local T is preserved end-to-end.

**Content bug still possible on homemade body/shot (Cascadeur/FBX bake):**

- `KOSHI` and `MUNE1` are **siblings under `BASE`** (not parent/child).  
- Rest local T is `(0,0,0)` for both.  
- Homemade clips sometimes bake **the same non-rest T curve** onto both (delta ~0.5, max ~0.6 over the clip).  
- Stock shots **do not** animate those translations.

Hierarchy reminder (body):

```text
GBL_RT → CENTER_RT → BASE
                      ├─ KOSHI → legs …
                      └─ MUNE1 → MUNE2 → SAKOTSU → KATA → UDE → TE
                                      └─ ATH_* (NUHLPB, not NUANMB)
```

Fix bad KOSHI/MUNE1 bake in **source** (FBX / DCC), not by stripping limb Translate in the product writer.

**Trap:** writing **T=0 with Translate property still present** and `ovT=false` collapses bone lengths in-game (zeros overwrite rest length). Product path must write **real** local translations (from FBX sample), never force limb T to zero under a present Translate property.

### 2.4 Extra non-stock body tracks / residual / ATH (item **4** — confirmed contributory)

Group of pipeline and content hygiene issues that **definitely** participate in
broken or misleading results (even if not always the sole pose scramble):

| Sub-issue | Product stance |
|-----------|----------------|
| `ATH_*` authored / converted into NUANMB | **Forbidden** — NUHLPB + rest only |
| Residual `0x3409` / `0x4409` as default write | **Forbidden** for Import product path |
| `FUN_*` / `SARM_*` / `PENQI_*` on shot clips | Optional strip; stock shots usually omit |
| Wrong on-disk source (see §2.5) | Always re-sample from true FBX |

Homemade FBX import against full NUSKTB can emit nodes stock shot clips never use, e.g. `FUN_*`, `SARM_*`, `PENQI_*` (often constant rest). Not always fatal; stripping to the stock 24-body set is optional hygiene for shot clips.

### 2.5 False “static 60f” sources

Some on-disk `主射CSA.nuanmb` copies were **true holds** (all STATIC).  
Other copies (e.g. intermediate import/preview_good) had **large fake multi-frame rotation** (e.g. `KATA_R` max angular metric ~0.85) while the author intended a hold — or conversely, a real shot was mislabeled as hold.

Always diagnose with a frame-variance pass before choosing hold vs multi-frame encode.
Diagnosing with a residual or fake multi-frame intermediate as “source” confuses
whether layout (item 3) or content is at fault — part of item **4**.

### 2.6 Import UI: output path == selected template

After a successful import, the UI selects the new NUANMB. A second import with the same output path used the **selected clip as template** and hit “output must differ from template”.

**Fix:** template path may equal output path: load template **fully into memory**, then overwrite. Still forbid output == FBX or == NUSKTB.

---

## 3. Accepted product rules (Import FBX as NUANMB)

These apply to `write_motion_clip_as_nuanmb` and thus to Import, ClipOps write-back, and other callers of that API.

| # | Rule | Retest priority |
|---|------|-----------------|
| R1 | **Uncompressed only** for product write (no residual `0x3409` / `0x4409` as the default path). | Item **4** |
| R2 | Every Transform track emits **`CompensateScale`** and **`Visibility`** (stock-like shell). | Item **1** |
| R3 | Every Transform track emits dense **Scale + Rotate + Translate** — **including limbs**. Do **not** omit non-root Translate. | Full T OK; omit-limb-T **not** required |
| R4 | Near-constant channels snap to **`0x4003` / `0x3003`**. | With shell |
| R5 | Multi-frame rotate uses **indexed `0x4300`** (not dense 16-byte-header-only stream). | Item **3** — **most important** for shots |
| R6 | **Never** emit `ATH_*` Transform nodes (ATH policy). | Item **4** |
| R7 | Template NUANMB may equal output path (in-memory load, then overwrite). | UX |

**Repair / re-export for broken homemade body/shot (order matches retest impact):**

| Step | Action | Why |
|------|--------|-----|
| S1 | Re-sample from **true** source FBX + body NUSKTB | Item **4** — avoid fake multi-frame intermediates |
| S2 | Multi-frame rotate → **indexed `0x4300`**; holds → `0x4003` | Item **3** — **do this first** on moving shots |
| S3 | Write CompScale + Visibility; uncompressed; **Translate on every bone** | Item **1** + full T (not omit-limb-T) |
| S4 | Never ATH; no residual default; optionally drop `FUN_*` / `SARM_*` / `PENQI_*` | Item **4** |

---

## 4. Implementation map

| Piece | Location |
|-------|----------|
| Writer entry | `write_motion_clip_as_nuanmb` in `nuanmb.rs` |
| EXVS2 encode | `write_anim_data_exvs2_uncompressed` — CompScale / Scale / Rotate / Translate / Visibility; hold snap; indexed `0x4300` |
| ATH filter | `transform_group_from_clip` + `is_ath_helper_bone` |
| FBX import | `import_motion_fbx` → `write_motion_clip_as_nuanmb` |
| UI re-import | `MotionFbxImportPanel` — allows output == selected template |
| Tests | `nuanmb_writer_strips_ath_helper_bones`, `nuanmb_writer_emits_stock_props_and_hold_headers` (`ssbh_motion_interchange_test`, `--features motion-tests`) |

Property order on Transform (writer):

```text
CompensateScale → Scale → Rotate → Translate → Visibility
```

EXVS2 v1.2 header dual-field convention (same as stock):

| Field | Meaning |
|-------|---------|
| `unk1` | Duration seconds ≈ `end_frame / 60` |
| `final_frame_index` | Timebase FPS (commonly `60.0`) |
| `unk2` | End frame index (`frame_count - 1`) |
| `unk3` | Start / reserved (commonly `0`) |

---

## 5. Diagnosis checklist (agent / modder)

When “preview OK, game bad” on a homemade `.nuanmb` (check in retest priority order):

1. **Rotate headers (item 3)** — Moving limbs: **must** be indexed `0x4300` (length check), not dense 992-style for 61 keys. **Most important** for multi-frame shots.  
2. **Properties (item 1)** — Every Transform has CompScale + Visibility **and Translate**?  
3. **ATH / residual / source (item 4)** — Any `ATH_*`? Residual headers? Is the file the intended clip from true FBX?  
4. **Variance** — True hold vs multi-frame? (per-bone `max_dT` / `max_dR`)  
5. **Limb Translate** — Product always writes it; **do not** “fix” by omitting limb T. Values must not be forced to zero under a present Translate prop.  
6. **KOSHI / MUNE1** — Non-rest T and identical curves → bake bug in **source** FBX; fix DCC.  
7. **Pack / slot** — Correct motion pack entry and filename mapping after layout is fixed.

Useful one-off tools under `src-tauri/examples/` (dev only):  
`nuanmb_prop_layout`, `nuanmb_static_check`, `nuanmb_forensic`, `nuanmb_hdr_census`, `nuanmb_fix_csa_shot`.

---

## 6. What not to do

| Anti-pattern | Why |
|--------------|-----|
| Default to residual `to_anim_v12_compressed` | User/product policy: no residual for this pipeline; crash risk on bad residual |
| Write limb `Translate = 0` with property still present | `ovT=false` → zero bone length → whole body collapses |
| **Omit limb Translate** in product Import / fix tools | Rejected product policy; loses authored local T and diverges from R3 |
| Treat editor-only dense round-trip as in-game proof | Editor and game decoders differ in strictness |
| Use dense (non-indexed) multi-frame `0x4300` for body shots | Verified in-game failure mode for real main-shot |
| Assume “no ATH” means the clip is game-safe | Layout §2.1–2.2 still apply |
| Block import when output == selected NUANMB | Breaks second click after first import selects the output |

---

## 7. Verification evidence (session summary)

| Check | Result |
|-------|--------|
| Static hold + CompScale/Visibility only (limbs keep Translate) | In-game OK |
| Static hold + omit limb Translate only | In-game OK (historical A/B; **not** product path) |
| Real main-shot + CompScale/Vis + omit non-root T + dense `0x4300` | Still broken in-game |
| Real main-shot + CompScale/Vis + (optional omit limb T) + **indexed `0x4300`** | **In-game OK** — proves **item 3** is the shot-critical fix |
| Product path: **full Translate on all bones** + CompScale/Vis + indexed `0x4300` + no ATH/residual | **In-game OK (user retest)** — items **1 + 3 + 4**; item **2** unnecessary |
| Writer unit tests (ATH strip, stock props + hold `0x4003`, limb Translate present) | `--features motion-tests` |

**User retest conclusion (accepted):** prior in-game failures came from **1, 3, and 4**;
**4 is real**, **3 is the most important**; **2 (omit limb T) is not needed**.

---

## 8. Change log

| Date | Note |
|------|------|
| 2026-08-02 | ATH policy accepted; initial homemade strip of `ATH_*` |
| 2026-08-02–03 | Editor-OK / game-bad investigation: CompScale/Visibility, limb T, KOSHI/MUNE1 bake, hold vs shot |
| 2026-08-03 | Product writer: uncompressed EXVS2 props; hold snap; **indexed `0x4300`**; import allows template==output |
| 2026-08-03 | This document |
| 2026-08-03 | **Cancel** product “omit limb Translate”: every Transform bone must write Translate (Import + fix tools) |
| 2026-08-03 | **In-game retest recorded:** root causes ranked **3 ≫ 1 + 4**; full limb Translate confirmed OK |

---

## 9. One-line summary

**Homemade NUANMB for EXVS2 must encode multi-frame rotates as indexed `0x4300` (the critical game fix), ship the uncompressed shell (CompensateScale + Scale + Rotate + Translate + Visibility on every bone), and avoid ATH/residual/wrong-source traps — limb Translate omission is not required.**
