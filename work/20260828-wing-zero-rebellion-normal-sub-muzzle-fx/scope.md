# Case Scope

## meta
- case_id: 20260828-wing-zero-rebellion-normal-sub-muzzle-fx
- created: 2026-08-28T00:00:00+08:00
- primary_skill: reverse-engineering

## auth
- status: granted
- basis: own_system
- evidence_of_auth: user explicitly requested the normal sub-shot modification

## in_scope
- assets:
  - E:/XB/mod/040msc/wing_gundam_zero_rebellion_msc/2.c
  - E:/XB/mod/040msc/wing_gundam_zero_rebellion_msc/2.dscex
- activities: [static-reverse, source-modification, compile, repack]

## out_of_scope
- activities: [runtime-injection, in-game-test, unrelated-action-changes]

## network_profile
- mode: offline

## pre-registration

H hypothesis: `SUB_SHOT_CUSTOM` can reuse normal main shot's group-7 muzzle
effect immediately before its paired projectile fire without changing the
homemade motion clock or action phase ownership.

P prediction: During the final eight start frames, both right and left gun
models show effect `0x6C04BF01`; the paired projectiles then fire and group 7
is cleared. Motion timing, ammo use, recoil, and recovery remain unchanged.

F falsifier: Either side has no muzzle effect, the effect appears away from its
gun, persists after firing/interruption, or sub-shot timing/projectiles change.

## runtime result 2026-08-28

E3-: START showed both muzzle effects, but SHOOT/END retained only the left
effect. The first build created group-7 slots 0 and 1 but every cleanup called
only `sys_4A(0x1, 0x7, 0)`, proving that cleanup is slot-specific rather than a
whole-group clear.

H hypothesis: Clearing both group-7 slots 0 and 1 at SHOOT, NO_AMMO, and END
removes the left residual without changing START.

P prediction: Both effects appear only during the final eight START frames and
neither remains once SHOOT begins.

F falsifier: Any muzzle effect remains visible during SHOOT/END, or either START
effect disappears before the phase transition.

## timing revision 2026-08-28

H hypothesis: Creating both muzzle effects on START frame 0, immediately after
the two gun models are mounted/opened, keeps them active for the complete START
phase while the existing SHOOT cleanup still removes both after projectile fire.

P prediction: Both muzzles show the effect from START frame 0 through frame 25;
SHOOT frame 1 fires the paired projectiles and then removes both effects.

F falsifier: Either effect begins late, disappears during START, or remains
visible after SHOOT frame 1.

## signoff
- ready_for_act: true
