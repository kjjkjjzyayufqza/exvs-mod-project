# Case Scope

## meta
- case_id: 20260828-wing-zero-rebellion-flight-cs-tv-beam-pair
- created: 2026-08-28T00:00:00+08:00

## auth
- status: granted
- basis: own_system
- evidence_of_auth: user explicitly requested the MSC modification

## in_scope
- assets:
  - E:/XB/mod/040msc/wing_gundam_zero_rebellion_msc/2.c
  - E:/XB/mod/040msc/wing_gundam_zero_rebellion_msc/2.dscex
  - E:/XB/mod/041cpm/wing_gundam_zero_rebellion_param/bulletparam.bin
- activities: [static-reverse, source-modification, compile, repack]

## out_of_scope
- activities: [runtime-injection, in-game-test, resource-pack-port]

## network_profile
- mode: offline

## pre-registration

H hypothesis: Rebellion's single reachable flight CS can use the newly installed
`0xCDA9F565/566` pair while TV charge-complete effect `0x8A3D0AFB` remains
visible on both target gun models until SHOOT.

P prediction: The full-charge pulse creates left/right charge effects; CS START
keeps them; SHOOT emits `0xCDA9F565/566` and then clears only group-A slots
`0xA/0xB`; flight movement and recovery stay unchanged.

F falsifier: Either charge effect is missing/misplaced, another group-A effect
is removed, old `0xCDA9F55C/55D` fires, the charge effect survives SHOOT, or
flight movement/recovery changes.

## runtime result 2026-08-28

E3-: Flight CS release produced the uncharged bird main shot. Current source
and current `0.bscex/2.dscex` readbacks are synchronized. The flight selector
checks input `0x1` before charge-A release `0x800`; the runtime result shows the
release frame can carry both bits, so the main branch wins while field `0x100`
is still 0 and submits `0x476FAC14`.

H hypothesis: Prioritizing `0x800` over `0x1` and directly submitting
`0x2194F05D` makes charge release independent of the presentation-stage field.
Re-arming both charge effects on CS START guarantees the visual lead-in even if
the `0x90003` pulse was not observed by the depiction tick.

P prediction: A flight main tap still selects `0x476FAC14`; a completed charge
release always selects `0x2194F05D`, shows both charge effects through START,
then fires `0xCDA9F565/566`.

F falsifier: Main tap becomes CS, charge release still produces main, charge FX
does not precede SHOOT, or any prior movement/recovery behavior regresses.

## runtime result: CS2 START charge effect absent

E3-: CS2 is now selected, but the START wait remains visually empty. Source
and binary contain the `0x8A3D0AFB` calls; the target effect structure lacks the
TV nozzle/line effect dependencies. The target's normal main/sub-shot
`0x6C04BF01` has already shown correctly on both Rebellion gun models in game.

H hypothesis: Replacing the TV-only charge effect with the exact normal
SUB_SHOT_CUSTOM muzzle effect and group-7 slot layout makes both muzzles visibly
charge for the complete CS2 START wait.

P prediction: Both `0x6C04BF01` effects appear when full/START begins, persist
through START, then disappear immediately after `0xCDA9F565/566` fires.

F falsifier: START is still visually empty, only one muzzle appears, either
effect survives SHOOT, or normal main/sub effect ownership regresses.

## timing revision 2026-08-29

H hypothesis: Holding CS2 SHOOT for the same 40 logical frames as the two
bulletparam lifetimes makes phase ownership match the visible beam. Reducing
START from 31 to 10 logical frames removes roughly two thirds of the pre-fire
delay without changing projectile or recovery ownership.

P prediction: START shows both muzzle effects for 10 frames; SHOOT spawns
`0xCDA9F565/566`, clears the muzzle effects, and remains active for 40 frames;
END then remains active for 40 frames. Total normal path is 90 logical frames.

F falsifier: START is not materially shorter, SHOOT releases before the beam
expires or never advances, the beam fires more than once, or END/movement
behavior regresses.

## runtime result: charge-complete effect fires before action

E3-: Merely filling the flight charge bar shows the muzzle effect before the
player releases the button. The cause is explicit in `rebellion_bird_cs_tick`:
the `0x90003` full-charge pulse calls `rebellion_bird_cs_charge_fx_start()`.

H hypothesis: Removing only that tick call makes full charge publish stage 2
silently; the unchanged CS2 START first frame remains the sole effect owner.

P prediction: Holding a full charge shows no muzzle effect. Releasing charge
enters CS2 START, both effects appear for the 10-frame START, then SHOOT clears
them after firing.

F falsifier: An effect still appears before release, START has no effects, or
SHOOT fails to clear both.

## END timing revision 2026-08-29

H hypothesis: Reducing only CS2 recovery from 40 to 13 logical frames makes END
approximately three times faster without affecting the 10-frame START or
40-frame SHOOT/beam ownership.

P prediction: The normal path becomes START 10 + SHOOT 40 + END 13 = 63 logical
frames; beam lifetime remains 40 and recovery releases shortly after it ends.

F falsifier: END still feels unchanged, exits before SHOOT/beam ownership ends,
or flight handoff/movement regresses.

## signoff
- ready_for_act: true
