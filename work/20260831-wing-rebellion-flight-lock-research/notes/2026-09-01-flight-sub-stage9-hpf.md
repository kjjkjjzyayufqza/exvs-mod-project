# Flight sub repair stage 9 — Hambrabi hook sys_4C(0x8, 0x3)

**Status:** E1 source edit + legacy repack installed; runtime unverified (E3 pending).

Stage 8 (`func_296(0x3e9,0)` / `sys_46(0x6,0)`) is **withdrawn before E3**.
It copied Hambrabi kind-0x35 START `global854` 足止, which `func_1083` /
`func_1086` never call. The roll hooks write `sys_4C(0x8, 0x3)` every
hook tick instead.

## Build identity

- Source `2.c` MD5: `D7913F209D643F853D4499E002DC7684`
- Installed `2.dscex` MD5: `4E0478ADD4D90595C0951C212F7C138C`
- Previous Stage 8 `2.dscex` MD5: `9DB851C90E0294BAD13AD77B3993A9C2`
- Backup: `tmp/msc-repack/20260901-flight-sub-sys4c-stage9/2.stage8-before.dscex`
- Compiler: legacy `tools/msclang.py -i`
- Source guards: AI blocks pass; opaque pointers 0 warnings; action shape 0 errors.

This binary also contains the in-tree Hambrabi hold-repeat (`global683=0x1` +
`rebellion_flight_sub_hold_refire`) that was already in `2.c` when Stage 8
was swapped. The analog judgement variable is still only `sys_4C(0x8, 0x3)`.

## Scope

- One judgement variable: `sys_4C(0x8, 0x3)` every 677 tick, matching
  Hambrabi `func_1083` / `func_1086`.
- Remove Stage 8 `func_296(0x3e9, 0/1)` from 677/679.
- Do not copy `global183 = 0`, `func_110(0x82)`, `sys_46(0x5)`, motor-off,
  mix, yaw, SE, `func_167`, `0x4000` clear, or the flight-special clamp.
- START and 679 do not write `sys_4C`: Hambrabi 1082/1085 do not; 1083
  stops when the hook ends.

Speedparam reaudit named nearby `sys_4C(0x8, 0x3)` as a movement-magnitude
reseed, not the `0x30001` motor. Grade of that name is not E3; this pack
only copies the Hambrabi roll-hook call.

## Lifecycle / ownership

| State | ENTER START | ACTIVE SHOOT | EXIT 679 | INTERRUPT |
|---|---|---|---|---|
| `sys_1(0x30001)` | preserve | preserve | preserve | preserve |
| `global24 & 0x4000` | preserve | preserve | preserve | preserve |
| `sys_46(0x6)` | inherit | inherit (Stage 8 removed) | inherit | inherit |
| `sys_4C(0x8, 0x3)` | inherit | **every 677 tick** | stop writing | stop writing |
| ch1/2 scripted push | START kick if side change | SHOOT ENTER lateral | inherit | native |

## H/P/F

H  hypothesis: held-back reverse is analog magnitude that Hambrabi's roll
   hook reseeds/gates with `sys_4C(0x8, 0x3)` every `func_1083` tick, not
   `sys_46(0x6)`.

P  prediction: holding back during SHOOT no longer reverse-flies and the
   camera does not pull; the unit still flies; lateral push and END flight
   remain.

F  falsifier: still reverse-flies, **or** I12-class fall / fake bird,
   **or** side roll / EXIT broken.

## Action-only matrix

| Saw | Means |
|---|---|
| Hold back, no reverse (side push only) | `sys_4C(0x8, 0x3)` gated analog mag |
| Hold back, still full reverse | hook `sys_4C` does not own `0x4000` analog |
| Fall / fake bird | `sys_4C(0x8, 0x3)` coupled to motor/lift |
| No side travel | `sys_4C` also ate the Hambrabi `sys_46(0x1,0x2)` push |
