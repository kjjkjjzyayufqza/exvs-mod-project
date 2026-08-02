# Characterparam unresolved runtime scalar tuple

## Verdict

`0x1113F30E`, `0xC6E2AD28`, and `0x2698D841` form a contiguous three-float
runtime configuration tuple, but current static evidence does not identify the
tuple's game-design meaning. They remain `unresolved_040`, `unresolved_270`,
and `unresolved_094`.

The historical `model_scale`, `charge_damage_multiplier`, and
`damage_correction_base` names are not justified by their native consumers.

## OB evidence

The dedicated getters are `sub_140634F00`, `sub_140634D00`, and
`sub_140634BD0`. `sub_140636160` stores their results contiguously:

| Hash | Runtime member |
|---|---|
| `0x1113F30E` | `+0x94` |
| `0xC6E2AD28` | `+0x98` |
| `0x2698D841` | `+0x9C` |

Direct-call enumeration also shows that the first two getters are used by a
second control path at `0x140680F6D` and `0x140680FD3`. That path multiplies
each getter base value by an external integer converted to a percentage and
writes the result back to `+0x94` or `+0x98`. The third field is refreshed at
`0x14063584E` but has no independently proven downstream scalar operation.

This establishes three runtime channels and percentage override behavior for
two channels. It does not establish XYZ axes, model/render scale, collision
scale, or damage categories.

## Important exclusion

The proven collision-sphere radius scale is `0xFEADD5BE`, consumed with
`collision_sphere_0_radius` by `sub_1406394E0`. That separate native chain must
not be used to infer collision semantics for this tuple.

## Confidence boundary

The tuple layout and override mechanisms are closed. A safe semantic rename
requires readers of runtime members `+0x94/+0x98/+0x9C` that bind each channel
to a concrete engine operation; the getter and initializer chains alone do not
provide that evidence.
