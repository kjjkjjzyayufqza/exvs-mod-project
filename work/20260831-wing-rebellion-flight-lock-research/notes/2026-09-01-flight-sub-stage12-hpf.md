# Flight sub analog Stage 12 — clamp last-writes the tick

**Status:** E1 source + legacy pack installed; runtime unverified (not E3).

## Build identity

- Source `2.c` MD5: `8B128FFDE085DD860D1F42528A8006E5`
- Installed `2.dscex` MD5: `46A5F1D2BEB0BC5D330169C91099FAAD` (304208 B)
- Snapshot: `tmp/msc-repack/20260901-flight-sub-analog-stage12/`
- Compiler: legacy `tools/msclang.py -i`
- Source guards: AI blocks pass; opaque pointers 0 warnings; action shape 0 errors.
- Bytecode: `func_947` is `func_593`; hold-repeat; `global184==1` yaw; then `func_946` clamp.

If the loaded file is not `46A5F1D2...`, this pack is not what the game ran.

Stage 11 put the 2026-08-28 clamp after `func_593`, but START yaw
`sys_46(0, sys_0(0x40000, 0x5))` ran **after** the clamp. I10 already
showed `global184==2` may never be true; if `global184` stays `1` through
SHOOT, that yaw last-writes every SHOOT frame. I1 translation stop needs
the channel clamp to be the last MSC writer.

One judgement variable: tick order. Clamp last. START yaw may still run
before the clamp. Motor on. No `0x4000` clear. No `sys_46(0xF)`. No 679
clamp.

## H/P/F

H  Stage 11 clamp was not last-writer when `global184` stayed 1; native
   analog / leftover after that yaw restored reverse-fly.

P  hold back during SHOOT: no reverse / camera pull; side travel remains;
   no I12 fall; END flies.

F  still reverse, fall, no side travel, or EXIT cannot fly.
