# characterparam damage-multiplier audit

> **Superseded for per-slot F/S/C/V/R labels (2026-08-01).** The consumer
> families below remain valid, but exact native data flow proves only selector
> slots. Current canonical keys use `_slot_0..4`; the older lettered names are
> compatibility aliases and historical claims.

Date: 2026-07-15
Binary: OB `vsac27_Release.exe`, SHA-256
`cae3636aa4870d356eb25837badeb83482a71e290961442dec13cf87e1baa76`
Safety: executable, IDB, and original parameter files were inspected read-only

## Corrected result

The earlier audit grouped five 5-field families as F/S/C/V/R Burst bonuses.
Two of those conclusions were too broad. Exact OB caller analysis now proves:

1. `F25A5100/85C483F0/1E61CF9F/6AF92610/F15C6A7F` is selected by a state-record
   value `0..4` while that record's `+0xC` member is 2 or 3. Its native consumer
   is the HP incoming-damage path. The state value's F/S/C/V/R identity is not
   address-level proven.
2. `8A902D5F/9BED4726/22169CCE/B91793D4/00EC483C` is multiplied into the
   final native damage scalar. At the sole call site, a selected hit subrecord
   is required to have type `2` or `3` at `+0x0C`, and its first `dword` is
   passed as the selector. The upstream record relation previously described
   as `[hit_record+0x40]` refers to the subrecord's location, not a direct load
   performed by the getter. The observed path bounds the value to `0..3`; the
   helper supports selector `4`, but that branch is not reached there.
   The dataflow does not yet prove that this field is a Burst-type enum, so the
   canonical names are neutral damage-calculation slots `0..4`.

The melee-attack, ranged-attack, and mobility families keep their existing
Burst names; this correction concerns only the two families above.

## Active-Burst incoming-damage family

`sub_1405F8D40` selects these hashes:

| Selector | Hash | Canonical JSON |
|---:|---|---|
| 0 | `0xF25A5100` | `conditionalIncomingDamageMultiplierSlot0` |
| 1 | `0x85C483F0` | `conditionalIncomingDamageMultiplierSlot1` |
| 2 | `0x1E61CF9F` | `conditionalIncomingDamageMultiplierSlot2` |
| 3 | `0x6AF92610` | `conditionalIncomingDamageMultiplierSlot3` |
| 4 | `0xF15C6A7F` | `conditionalIncomingDamageMultiplierSlot4` |

The only caller, `sub_1405F89C0`, reads the unit's Burst controller. When the
controller state is `2` or `3` and its type is not `-1`, the selected value is
stored at HP-state offset `+0x10`. `sub_1405F9480` then multiplies that value
into incoming damage before subtracting the integer result from current HP.

The actual Burst-gauge update routine is `sub_1405FA740`. It uses a separate
system table (`0x76EF065F`, `0xDD36F7E0`, `0x7B41FC54`, `0xBEE6C2DA`,
`0x1891C96E`, default `0xECDEED7D`, plus `0xB6272E8A`). It does not consume
the `F25A...` family. This is direct native evidence against the old
`BoostConsumptionMultiplier` name.

## Damage-calculation slot family

`sub_140625060` selects:

| Selector | Hash | Canonical JSON | Observed reachability |
|---:|---|---|---|
| 0 | `0x8A902D5F` | `damageCalculationMultiplierSlot0` | reached |
| 1 | `0x9BED4726` | `damageCalculationMultiplierSlot1` | reached |
| 2 | `0x22169CCE` | `damageCalculationMultiplierSlot2` | reached |
| 3 | `0xB91793D4` | `damageCalculationMultiplierSlot3` | reached |
| 4 | `0x00EC483C` | `damageCalculationMultiplierSlot4` | helper branch only |

At `sub_140622010+0xACC`, the helper result is preserved in `xmm12`. The final
damage construction multiplies `xmm14` by `xmm12` at `0x140622CBE`, then
passes the result to `sub_140624880`. Exact instructions at
`0x140622AB8..0x140622ADC` require the selected subrecord's `+0x0C` type to be
`2` or `3`, load its first `dword`, and pass that value to the helper. Upstream
this selected subrecord is the location previously summarized as
`[hit_record+0x40]`; the getter itself does not add `0x40`. The value is also
used with a four-element runtime array on the observed path. Calling these
fields F/S/C/V/R would require proving what the subrecord's first `dword`
encodes; the current native evidence does not.

## HP application formula

The direct HP subtraction path in `sub_1405F9480` is equivalent to:

```text
applied_damage = trunc(
    raw_damage
  * status_effect_incoming_damage_multiplier
  * active_burst_incoming_damage_multiplier
  * runtime_1_or_1_2_multiplier
  * low_durability_incoming_damage_multiplier
)
```

The four HP-state factors are read from the status-effect controller at
`+176`, then HP-state offsets `+0x10`, `+0x1C`, and `+0x18` respectively.
`sub_1405F89C0` refreshes the last three factors; `sub_1405F8E70` supplies the
low-durability factor.

## Real-file correlation and its limit

The original Gyan and Hyaku Shiki files were read without writing them. Their
`F25A...` values numerically match the Boost-consumption percentages published
on the [OB Gyan page](https://w.atwiki.jp/exvs2ob/pages/136.html) and
[OB Hyaku Shiki page](https://w.atwiki.jp/exvs2ob/pages/249.html), while the
`8A...` values correlate with the pages' defense percentages. That correlation
is useful evidence about shared tuning, but it cannot override the executable's
consumer dataflow. Canonical names therefore describe the proven native use.

## Compatibility

The parser still accepts both the original guessed keys and the previous
intermediate keys (`burst*BoostConsumptionMultiplier` and
`burst*DefenseMultiplier`) as input-only aliases. Serialization and the
property panel publish only the corrected canonical names.

## Confidence

- Active-Burst incoming-damage family: Grade A, direct selector and HP
  subtraction consumer.
- Damage-calculation slots 0–3: Grade A for multiplication into final damage;
  selector meaning remains unresolved.
- Damage-calculation slot 4: Grade B, present in the helper but unreachable
  from its sole observed caller.
