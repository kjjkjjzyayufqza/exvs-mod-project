# Flight sub repair — Hambrabi hold-repeat (func_1182)

**Status:** E1 source edit; runtime unverified.

## H/P/F

H  hypothesis: auto 3-shot was native `global683 = 0x3`. Hambrabi `func_969`
   uses `global683 = 0x1`; extras are `func_1182` hold `0x80` then `func_81`
   the same hash at motion 21-34f.

P  prediction: tap fires one pair; holding sub through ~21f starts another
   roll; releasing after the first shot does not fire two more.

F  falsifier: still three shots with no hold, OR hold never chains, OR
   `func_81` drops form/flight (A3 class).

## Scope

- `global683` `0x3` → `0x1` on both roll ENTERs.
- Tick after `func_593` runs `rebellion_flight_sub_hold_refire`.
- 679 stays until clip time `0x22` or complete, so the 21-34f window exists.
- Do not change lateral `sys_46`, mix, motor, or yaw this build.
