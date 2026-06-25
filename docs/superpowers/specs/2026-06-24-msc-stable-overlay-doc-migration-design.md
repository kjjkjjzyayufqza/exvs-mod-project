# MSC Stable Overlay And Doc Migration Design

- Date: 2026-06-24
- Status: Proposed
- Area: `src/page/TestEditor/utils/*`, MSC workspace resolved display, `docs/msc-research/*`
- Driver: The current MSC auto-rename flow depends on unstable decompile surface forms such as `func_143`, `func_95`, legacy `func_N` numbering, and old `ACTION_*` display names. Recent semantic toolchain repairs improved the compiler/decompiler behavior but also invalidated many surface-level anchors. We need a minimal usable redesign that restores editor usefulness and stops documentation drift without attempting a full repository-wide rename migration.

---

## 1. Problem Statement

The current MSC display layer mixes two different concepts:

1. **Stable evidence**
   - `action hash`
   - registry relationships such as `func_241(actionHash, callback)`
   - slot callback registry entries
   - resource and weapon-slot binding hashes

2. **Unstable display artifacts**
   - `func_N`
   - `ACTION_*`
   - `//main shot`
   - exact `if (...)` text shape
   - exact decompiled function numbering and layout

The old auto-rename utility is coupled to the unstable layer. It currently assumes:

- `0.c` contains the same `func_143` dispatcher shape
- action semantics are recoverable from `func_95(hash, ...)` nested under the same condition tree
- `2.c` callback symbols can be safely renamed as if they were durable identities

That coupling is now too brittle. The compiler/decompiler can preserve semantics while still changing the decompiled surface. When that happens, editor overlays and research documents drift even though the underlying script behavior is still valid.

---

## 2. Goals

This redesign intentionally targets a small, usable slice.

### 2.1 Primary goals

1. Restore a usable MSC resolved overlay in `TestEditor`.
2. Make the overlay depend on stable evidence rather than old `func_N` text shapes.
3. Update the core research rules so future MSC docs stop using legacy display names as primary keys.
4. Preserve raw decompiled C as the source view; the new layer is additive, not destructive.

### 2.2 Success definition

The first slice is successful when:

- the MSC resolved overlay no longer requires fixed `func_143`, `func_95`, or old `func_N` shapes as its primary evidence source;
- the overlay can stably display action registry, slot callback registry, and weapon/resource binding evidence;
- core docs clearly distinguish stable keys from legacy aliases;
- new research writing has a repeatable citation rule that survives future decompile surface drift.

---

## 3. Non-Goals

This design does **not** attempt to:

- rebuild every MSC research document in one pass;
- rename every `func_N` in raw decompiled source;
- infer final projectile or `bulletparam` meaning automatically;
- guarantee a single perfect human-readable action name for every hash;
- replace `mscdec.py` or `msclang.py`;
- solve every unit-specific overlay case in the first slice.

The purpose is to stop the current bleed, not to finish the entire migration.

---

## 4. Design Principles

### 4.1 Stable keys first

The new overlay and doc rules must treat these as durable keys:

- `action hash`
- `func_241(actionHash, callback)` binding relationships
- `sys_1(0x10001, 0x2, slot, callback)` slot callback relationships
- `sys_1(0x10001, 0x3/0x4, slot, hash)` resource registry relationships
- `sys_4F(0xb, slot, armsEntryHash)` weapon slot binding relationships
- supporting param labels from `armsparam.bin` and `characterparam.bin`

### 4.2 Legacy names as aliases only

`func_N`, `ACTION_*`, and user-facing labels such as `main shot` remain useful as working names, but they are no longer primary identifiers. The system must treat them as derived aliases attached to stable keys.

### 4.3 Additive overlay, not raw-source mutation

The first slice should enhance the MSC workspace resolved view instead of rewriting the raw decompiled C file contents. Raw C stays raw. Overlay adds evidence, aliases, and confidence annotations beside it.

### 4.4 Evidence over guesswork

If a working name cannot be justified from registry shape, slot use, resource binding, or param label evidence, the overlay should fall back to a conservative evidence-based name instead of inventing a stronger semantic label.

---

## 5. Scope Of The First Slice

The first slice includes two deliverables only:

1. **Stable MSC overlay redesign in `TestEditor`**
2. **Core documentation migration rules plus a small set of core doc updates**

It does not include a full repository-wide rename pass.

---

## 6. Overlay Architecture

### 6.1 Raw view versus resolved view

The MSC workspace keeps two roles separate:

- **Raw view**
  - shows the decompiled `.c` output as-is
  - no promise that `func_N` numbering or expression text is durable

- **Resolved overlay**
  - shows derived evidence beside raw lines or symbols
  - uses stable keys and working aliases
  - may be regenerated whenever the source changes

This separation is the core safety boundary. We stop pretending that the raw decompile output is a durable naming layer.

### 6.2 Overlay entities

The resolved overlay should model three evidence families in v1:

1. **Action registry evidence**
   - source shape: `func_241(actionHash, callback)`
   - stable key: `actionHash`
   - derived fields:
     - callback symbol
     - working action name
     - legacy aliases
     - confidence
     - evidence summary

2. **Slot callback registry evidence**
   - source shape: `sys_1(0x10001, 0x2, slot, callback)`
   - stable key: `(slot, callback)` with registry context
   - derived fields:
     - working slot callback name
     - action hashes that reference it
     - related resource evidence
     - confidence

3. **Weapon/resource binding evidence**
   - source shapes:
     - `sys_4F(0xb, slot, armsEntryHash)`
     - `sys_1(0x10001, 0x3/0x4, slot, hash)`
   - stable key: `(slot, hash)` with binding kind
   - derived fields:
     - arms/resource label if available
     - working slot/resource alias
     - evidence source

### 6.3 Data extraction order

The first slice should derive overlay candidates in this order:

1. Scan `0.c` for `sys_1(0x10000, 0x1, actionIndex, actionHash)` where available.
2. Scan `2.c` for `func_241(actionHash, callback)`.
3. Scan `2.c` action handlers for slot requests and equivalent runtime setup evidence.
4. Scan `2.c` for `sys_1(0x10001, 0x2, slot, callback)`.
5. Scan `2.c` for `sys_1(0x10001, 0x3/0x4, slot, hash)` and `sys_4F(0xb, slot, armsEntryHash)`.
6. Enrich visible labels from `armsparam.bin` and `characterparam.bin` when those files are available in the current workspace context.

The old `func_143 -> func_95` path may still be kept as a best-effort alias source, but it is no longer the primary overlay engine.

---

## 7. Overlay Output Shape

The first slice should be conservative and annotation-heavy.

### 7.1 Action registry display

Given raw text such as:

```c
func_241(0xf48d2d49, func_912);
```

The resolved overlay may show:

```text
actionHash=0xf48d2d49 | workingName=ACTION_A_SHOT | legacyAlias=main shot | confidence=medium
```

### 7.2 Slot callback display

Given raw text such as:

```c
sys_1(0x10001, 0x2, 0x23, func_870);
```

The resolved overlay may show:

```text
slot=0x23 | slotCallback=SLOT_CB_TRANSFORM_ENTRY | referencedBy=0x9475130e
```

### 7.3 Weapon/resource binding display

Given raw text such as:

```c
sys_4F(0xb, 0x2, 0xa8e202bf);
```

The resolved overlay may show:

```text
slot=0x2 | armsEntry=0xa8e202bf | label=GUN_015GNDMUC_004DELTPL_001_ASSIST
```

The key point is that the overlay supplements raw text instead of rewriting it into pretend-stable source.

---

## 8. Legacy Compatibility Strategy

The old action-mask renamer still has some value for familiar user-facing shorthand, but it must move to a secondary role.

### 8.1 Allowed legacy role

The old rename path may still provide:

- legacy aliases such as `ACTION_A_SHOT`
- familiar comments such as `main shot`
- weak hints for user orientation

### 8.2 Disallowed legacy role

The old rename path must no longer be responsible for:

- primary identity
- cross-version references
- doc citation keys
- determining whether a handler name is durable

In other words, the old path becomes a hint provider, not the naming authority.

---

## 9. Core Documentation Migration Rules

The first slice should update the rules for future MSC research writing and patch a small core set of documents to match.

### 9.1 Required citation format

New or updated MSC research docs must cite at least these four fields together:

1. **Stable key**
2. **Current symbol**
3. **Working name**
4. **Evidence**

Recommended table shape:

| Kind | Stable key | Current symbol | Working name | Evidence |
|---|---|---|---|---|
| Action | hash `0x9475130E` | `func_450` | `ACTION_TRANSFORM_DASH_ENTRY` | `func_241`, slot `0x23`, transform entry callback |

### 9.2 Core documents to update in the first slice

The first slice should update only the highest-value documents:

1. `docs/msc-research/msc-auto-rename-mapping.md`
   - mark the old `func_143 -> func_95 -> ACTION_*` flow as `legacy path`
   - document the new stable overlay path

2. `docs/msc-research/0c-to-2c-input-action-boundary.md`
   - preserve existing examples
   - explicitly state that `ACTION_*` is a working alias and `action hash` is the durable reference

3. this spec and its follow-up plan
   - define the migration rule for future work

### 9.3 Documentation rule change

After this redesign, docs should follow these rules:

- do not use `func_N` as a cross-version primary key;
- do not use `ACTION_*` alone as the only identifier;
- do not treat `main shot`, `sub shot`, or similar labels as proof of identity;
- always include stable evidence such as hash, slot, registry shape, or resource binding.

---

## 10. Acceptance Criteria

The first slice is accepted when all of the following are true:

1. The MSC resolved overlay no longer depends on fixed `func_143`, `func_95`, or old `func_N` numbering as its primary evidence path.
2. The overlay can stably surface:
   - action registry evidence
   - slot callback registry evidence
   - weapon/resource binding evidence
3. `docs/msc-research/msc-auto-rename-mapping.md` clearly distinguishes:
   - stable keys
   - working names
   - legacy aliases
4. `docs/msc-research/0c-to-2c-input-action-boundary.md` no longer presents `ACTION_*` names as durable primary identifiers by themselves.
5. The first slice does not attempt broad full-repo rename migration.

---

## 11. Risks And Guardrails

### Risk 1: Over-promising semantics

Some action hashes can only be weakly named from available evidence.

Guardrail:

- require confidence labels;
- fall back to evidence-based names when stronger semantics are unproven.

### Risk 2: Reintroducing source mutation as naming truth

If the overlay rewrites raw C aggressively, users will again mistake generated names for durable source truth.

Guardrail:

- keep raw view separate from resolved overlay;
- keep aliases explicitly marked as derived.

### Risk 3: Param-driven labels are missing

Some workspaces may not have the full param package available.

Guardrail:

- param labels are enrichment, not mandatory identity;
- overlay still works from registry evidence alone.

### Risk 4: Scope creep into full migration

Trying to repair every document and every unit in one pass will delay the usable fix.

Guardrail:

- patch only core docs in the first slice;
- document the future migration rule instead of rewriting everything now.

---

## 12. Verification Strategy

Implementation should verify:

1. registry parsing still works when `func_N` numbering shifts;
2. overlay generation still works when boolean expression text changes but registry relationships stay the same;
3. raw decompiled C remains unchanged while resolved overlay updates;
4. core docs cite stable keys explicitly after the migration patch.

Real-sample verification should include at least:

- the current `0xFEEA714A` workflow that motivated the drift;
- one unit whose old docs rely heavily on `ACTION_*` naming;
- one transform-style action family where simple old mask routing is not enough.

---

## 13. Recommended Implementation Shape

The follow-up implementation plan should build the first slice in this order:

1. define overlay data structures around stable evidence;
2. parse action/callback/slot/resource relationships without relying on old `func_N` identities;
3. add param-label enrichment;
4. update resolved overlay rendering;
5. patch the two core MSC docs to the new rule set;
6. verify against real samples.

This keeps the effort focused on a minimal usable redesign rather than a full renaming campaign.
