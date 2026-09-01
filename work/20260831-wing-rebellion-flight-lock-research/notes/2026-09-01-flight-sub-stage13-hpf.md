# Flight sub analog Stage 13 — SHOOT analog profile 0

**Status:** E1 source + legacy pack installed; runtime unverified (not E3).

## Build identity

- Source `2.c` MD5: `60D20912627AA404421AFF327B34BB48`
- Installed `2.dscex` MD5: `1CFD3810EC8777AC2464BC7259F339D0` (304256 B)
- Snapshot: `tmp/msc-repack/20260901-flight-sub-analog-stage13/`
- Compiler: legacy `tools/msclang.py -i`
- Bytecode: `func_950` `func_351(0,0x4)` on ENTER and every tick; `func_951` ENTER `func_351(0x2,0x4)`.

If the loaded file is not `1CFD3810...`, this pack is not what the game ran.

Stage 12 last-writes the I1 channel clamp, but START/SHOOT still call
`func_351(0x1, 0x4)` (TV moving-shot). I1 special used profile 0 with
motor on; D9/I7 native analog can republish reverse after MSC while
profile 1 stays selected. I9 already showed profile 1 does not own this
unit's held-back behaviour.

One judgement: SHOOT uses `func_351(0, 0x4)` every tick. 679 ENTER
restores `func_351(0x2, 0x4)` so EXIT is not D10 air-idle. START stays
profile 1. Clamp, motor, `0x4000`, and 679 skip-clamp stay.

## H/P/F

H  profile 1 keeps native analog reverse after the MSC clamp; profile 0
   is the I1 analog selector; D10 requires profile 2 on 679.

P  hold back during SHOOT: no reverse / camera pull; side travel remains;
   no I12 fall; END flies.

F  still reverse, fall, no side travel, or EXIT air-idle / cannot fly.
