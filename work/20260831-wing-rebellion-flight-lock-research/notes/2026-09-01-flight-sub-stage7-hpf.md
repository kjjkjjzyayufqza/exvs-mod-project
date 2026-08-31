# Flight sub repair stage 7 — analog leftover scale 454=0

**Status:** E1 source edit + legacy repack; runtime unverified.

User correction 2026-09-01: no back input is fine; held back reverse-flies
and the camera offsets. I9-I11 were misread as lock-yaw. I12 (every-tick
motor off) free-fell in bird visuals; motor-off is removed.

## Scope

- One judgement variable: `global454` `0x62` → `0` on both roll ENTERs,
  matching `ACTION_A_SHOT_BIRD`. `func_594` copies it to `global714` while
  `global24 & 0x1000000`.
- Keep `global452/453`, roll clips, lateral push, profile 1, motor on.
- Do not `func_296(0x3e8, 0)`, `func_167`, `func_169(0x4000)`, yaw, or SE.

## H/P/F

H  hypothesis: held-back reverse flight is `func_300` leftover scaled by
   `global454=0x62`.

P  prediction: holding back during SHOOT no longer reverse-flies (or only a
   trace remains), so the camera stays; the scripted lateral push still runs;
   START still aims; END still flies.

F  falsifier: held back still reverse-flies at full analog, the unit freezes
   or falls, or the lateral push dies.

## Action-only matrix

| Saw | Means |
|---|---|
| Hold back, stay (except side push) | leftover scale was the reverse owner |
| Hold back, still full reverse | native `0x4000` analog ignores mix (I8 class) |
| Fall / fake bird | 454=0 was too close to I12 |
| No side travel | `func_300` also ate the Hambrabi push |
