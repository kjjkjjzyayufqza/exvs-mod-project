# EXVS2 Runtime Model Culling — Hook Targets

Date: 2026-06-22

Target binary:

- `E:\OBHK0.3_v27\vsac27_Release.exe`
- IDB: `E:\OBHK0.3_v27\vsac27_Release.exe.i64`
- Image base: `0x140000000`

Companion analysis: `docs/exvs2-runtime-model-culling-ida-notes.md` (root cause).

## Purpose

This note lists the candidate functions to hook in order to stop a large
converted SSBH model (the "ship") from disappearing when the camera/focus leaves
its center region. It records **which function and why**, not a full hook
implementation plan.

Scope note: hooking is a runtime patch. The earlier IDA notes declared
"no dynamic-memory patching" as a non-goal for the analysis phase. Choosing a
hook fix intentionally relaxes that constraint. This repo currently has **no
injection/hook infrastructure** (it is an offline Tauri asset editor), so any
hook fix means introducing a separate injector / patch tool.

## Root Cause Recap (one paragraph)

The ship disappears because it **stops being submitted to main render**. The
chain: the ship is one stage-object descriptor -> one driver -> one runtime key
-> one isolated activation unit. Its activation depends on propagation seeded
from the single focus object (player/camera target). When the focus leaves the
ship's center region, propagation breaks, the object stops being submitted, the
3-frame deferred recycler frees its slot and invalidates its key
(generation = 4095), and the main-render gate `sub_1405E26E0` then fails -> the
whole main model is skipped. The shadow pass uses a separate queue and is
unaffected. Full evidence is in the companion IDA notes.

## Shared Prerequisite For Every Option

All options below require the hook to **only affect the target ship**, otherwise
they force every object visible. The hook must identify the ship entity at
runtime (most stable discriminators are the entity's model-name pointer or a
fixed runtime key). The concrete field offset for "is this the ship" is **not
yet pinned statically** and must be resolved before implementing any option.

## Candidate Hook Targets

Ordered from most on-target to most blunt.

### Preferred — `sub_1405FF080` (focus-relative relevance predicate)

- **What it is:** the core predicate that decides whether an entity is
  active/relevant relative to the current focus object `v9 = *(scene+181056)`.
  It combines the entity's relationship to the focus (`sub_1405FEDB0(v9, key)`),
  direct comparisons (`v9 == key`, `v9 == *(mgr+2432/2440)`), and external record
  flags (`v27[8..11]`).
- **Why hook it:** the ship has no gameplay relationship to the player focus, so
  this predicate returns false once the focus moves away, which is what stops the
  ship from being submitted. Forcing it true for the ship keeps the ship in the
  active set.
- **Hook action:** when the resolved entity is the ship, return `1` (relevant).
- **Cost / risk:** must match only the ship; otherwise all objects are forced
  relevant. This is the most semantically correct single point.

### Solid (closer to the render gate, needs a pair) — `sub_1405E26E0` + `sub_1405CFFE0`

- **`sub_1405E26E0` (24-slot key validation, the main-render gate):**
  - **What it is:** `sub_1405D00A0` validates `object+0x520` against the 24-slot
    table before submitting; failure -> skip.
  - **Why hook it:** it is the final gate that rejects the ship.
  - **Hook action:** force `true` for the ship's key.
  - **Cost / risk:** **not sufficient alone** — once the key is recycled the
    object is no longer submitted, so a `true` result has nothing to draw. Must
    be paired with blocking recycling.
- **`sub_1405CFFE0` (3-frame deferred recycler) / `sub_1405F7A60` (per-object release):**
  - **What it is:** the site that frees the ship's slot and forces its key
    generation to 4095 (invalid).
  - **Why hook it:** prevents the key from going stale.
  - **Hook action:** skip recycling for the ship so it keeps its slot and a valid
    key.
  - **Cost / risk:** must match only the ship; blocking recycling alone does not
    fix "stops being submitted", so pair with the gate/submit side.
- **Use together** as a double safety: keep the slot/key alive (`sub_1405CFFE0`)
  and keep the gate passing (`sub_1405E26E0`).

### Cleanest single point (if viable) — `sub_1405EFA30` (driver `vtable+0xC0`, key-type lookup)

- **What it is:** the driver's `vtable+0xC0` resolves to `sub_1405EFA30`, whose
  return value `& 7` is the key type used by `sub_1405F7630`. The render gate
  treats keys with `(key & 0x7000000) != 0` as **special type**, which bypasses
  the 24-slot check (validated via `sub_1405CFF30` instead) and the
  focus-propagation activation entirely.
- **Why hook it:** if the ship driver returns a special type (1 or 2), the ship
  no longer competes for one of the 24 slots and no longer depends on focus
  propagation, so it stays renderable regardless of camera region.
- **Hook action:** for the ship driver, return a special type.
- **Cost / risk:** side effects of special-type objects (count limits, behavioral
  differences, how `sub_1405CFF30` and other code treat them) are **not yet
  statically verified**. If clean, this is the smallest, most permanent single
  point.

## Summary

- **Most on-target:** hook `sub_1405FF080`, force the ship relevant.
- **Most robust:** hook `sub_1405CFFE0` (block recycle) + `sub_1405E26E0`
  (key always valid), as a pair.
- **Cleanest one-shot:** hook `sub_1405EFA30` so the ship uses the special-key
  path and bypasses the whole 24-slot + focus-propagation machinery (verify
  special-type side effects first).

All three depend on the same prerequisite: the hook must reliably identify the
target ship entity at runtime. Pinning that discriminator field is the shared
next step before any implementation.

## Open Items Before Implementation

1. Resolve the runtime discriminator for "this is the target ship"
   (entity model-name pointer or fixed key; offset not yet pinned).
2. For the `sub_1405EFA30` option: statically verify special-type
   (`key & 0x7000000`) side effects via `sub_1405CFF30` and any count/behavior
   limits.
3. Decide delivery form (separate injected DLL, in-process patch tool, or static
   binary patch) — out of scope for this note.
