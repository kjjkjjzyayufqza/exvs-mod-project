# Flight sub repair — Hambrabi START aim snap (func_601)

**Status:** E1 source edit + legacy repack installed; runtime unverified.

Build identity:
- Source `2.c` MD5: `A8862D987D1DE8F87F0F62820EE56C6E`
- Installed `2.dscex` MD5: `616D3F4307D19C059FC6564B917BA189`
- Backup: `tmp/msc-repack/20260901-flight-sub-start-aim-snap/2.before.dscex`
- Compiler: legacy `tools/msclang.py -i`
- Source guards: AI blocks pass; opaque pointers 0 warnings; action shape 0 errors.

User 2026-09-01: auto 3-shot is cancelled (E3). Next fix is face the lock.
Do not use Rebellion `2.c` as the aim design. Source is Hambrabi
`002zgundm_006hambrb_001/2.c`. Do not edit `0.c`.

## H/P/F

H  hypothesis: Hambrabi 向き直り is START-only. `func_1082`/`func_1085` set
   `global689 = 0x6`. Kind `0x35` tick is `func_599` → START `func_601`, which
   after the window last-writes `sys_46(0, sys_0(0x40000, 0x5))` every remaining
   START tick. `func_1083`/`func_1086`/`func_602` have no lock yaw. `func_626()`
   is `0x40000,5` plus `global73` offsets; `func_586` zeros `global73`, so the
   distinct Hambrabi write is the **hard snap**, not a different angle source.
   I10 already falsified SHOOT `func_626` yaw.

P  prediction: during 676 START the unit yaws onto the current lock. SHOOT/END
   heading is unchanged by this pack. Hold-repeat still works. Form/flight stay.

F  falsifier: START still ignores the lock, OR SHOOT/END heading changes, OR
   I10-class "no observable yaw", OR I12-class fall / form tear, OR hold-repeat
   breaks.

## Scope

- One judgement variable: after `func_593()`, while `global184 == 0x1`, write
  `sys_46(0, sys_0(0x40000, 0x5))` (Hambrabi `func_601` post-window snap).
- Do not write yaw in SHOOT/679 (I10 / D11).
- Do not change `global689`, mix, motor, `0x4000`, clamp, or clips this pack.
- Do not switch the tick to `func_599` (would replace the hold-repeat driver).
- Do not edit `0.c`.

## Lifecycle / ownership

| State | ENTER | ACTIVE START | EXIT 679 | INTERRUPT |
|---|---|---|---|---|
| `sys_46(0)` lock yaw | inherit | **snap every tick, last-write after driver** | inherit (no snap) | native |
| `global689` | preserve `0xa` | preserve | preserve | preserve |
| hold-repeat / `0x4000` / motor | preserve | preserve | preserve | preserve |
